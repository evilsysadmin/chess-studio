"""Rutas de sistema: liveness, readiness y estado público autenticado."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import math
import os
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response


import chronicles_run_store
import db
import feedback_store as fstore
import game_store as gstore
import matthias_daily_store
import matthias_memory_store
import profile_store as pstore
import pvp_store
import users_store as ustore
import user_data_lifecycle
import release_info
from auth import verify_password
from feature_flags import public_feature_flags
from observability import record_process_ready
from observability_history import record_presence_snapshot
from tracing import record_billing_costs_otel
from runtime_contract import staging_runtime_contract_ready
from api_models import ClientTelemetryRequest, DeleteAccountRequest
from client_telemetry import record_client_event
from pvp_api import build_pvp_router
from chronicles_api import build_chronicles_router
from pawn_slug_api import build_pawn_slug_router

_logger = logging.getLogger("chess.system")

_BILLING_SIGNATURE_MAX_SKEW_SECONDS = 300


def _billing_signature_valid(secret: str, timestamp: str, signature: str, body: bytes, *, now: int | None = None) -> bool:
    if not secret or not timestamp or not signature:
        return False
    try:
        stamp = int(timestamp)
    except (TypeError, ValueError):
        return False
    current = int(time.time()) if now is None else int(now)
    if abs(current - stamp) > _BILLING_SIGNATURE_MAX_SKEW_SECONDS:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        timestamp.encode("ascii") + b"." + body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(signature, f"sha256={expected}")


async def billing_auth_dependency(request: Request) -> None:
    """Authenticate the machine-only billing ingest with a short-lived HMAC."""
    secret = os.environ.get("CHESS_AI_SHARED_SECRET", "").strip()
    if not secret:
        raise HTTPException(503, "Billing telemetry auth is not configured.")
    raw = await request.body()
    if not _billing_signature_valid(
        secret,
        request.headers.get("x-chess-timestamp", ""),
        request.headers.get("x-chess-signature", ""),
        raw,
    ):
        raise HTTPException(401, "Invalid billing telemetry signature.")


def _parse_billing_costs(body: bytes) -> list[tuple[str, float, str]]:
    payload = json.loads(body.decode("utf-8"))
    rows = payload.get("costs") if isinstance(payload, dict) else None
    if not isinstance(rows, list) or not 1 <= len(rows) <= 2:
        raise ValueError("expected one or two billing rows")
    costs: list[tuple[str, float, str]] = []
    providers: set[str] = set()
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("invalid billing row")
        provider = str(row.get("provider") or "").strip().lower()
        currency = str(row.get("currency") or "").strip().upper()
        try:
            amount = float(row.get("amount"))
        except (TypeError, ValueError) as exc:
            raise ValueError("invalid billing amount") from exc
        if provider not in {"oci", "cloudflare"} or provider in providers:
            raise ValueError("invalid billing provider")
        if not math.isfinite(amount) or amount < 0:
            raise ValueError("invalid billing amount")
        if len(currency) != 3 or not currency.isalpha():
            raise ValueError("invalid billing currency")
        providers.add(provider)
        costs.append((provider, amount, currency))
    if not providers:
        raise ValueError("at least one billing provider is required")
    return costs


def build_system_router(*, auth_dependency, is_admin_check, limiter, admin_usernames_getter=None) -> APIRouter:
    router = APIRouter()
    # Keep experimental/game-adjacent transports behind the same authenticated
    # system-router aggregate already mounted by main.py. This avoids a second
    # auth stack while their runtime logic stays isolated from the CPU game API.
    router.include_router(build_pvp_router(auth_dependency=auth_dependency, limiter=limiter))
    router.include_router(build_chronicles_router(auth_dependency=auth_dependency))
    router.include_router(build_pawn_slug_router(auth_dependency=auth_dependency))

    @router.get("/")
    @limiter.exempt
    async def root(_username: str = Depends(auth_dependency)):
        return {
            "ok": True,
            "service": "Chess Studio API",
            "health": "/api/health",
            "ready": "/api/ready",
        }

    @router.get("/api/health")
    @limiter.exempt
    async def health():
        # Liveness puro: storage caído no debe provocar un restart loop.
        return {"ok": True}

    @router.get("/api/release")
    @limiter.exempt
    async def release():
        # Identidad pública no sensible del binario/proceso en ejecución. Se
        # mantiene separada de readiness para no convertir health checks en un
        # contrato de despliegue ni romper consumidores que esperan su shape.
        payload = {"release": release_info.backend_release()}
        build = release_info.build_commit()
        if build:
            payload["build"] = build
        return payload

    @router.get("/api/ready")
    @limiter.exempt
    async def ready():
        if not staging_runtime_contract_ready():
            raise HTTPException(503, "Staging runtime contract is not materialized.")
        # En desarrollo sin MONGO_URL explícito el modo memoria es válido. Si
        # hay persistencia configurada, readiness exige un ping real.
        storage_required = db.persistent_storage_required()
        if storage_required and await db.get_db() is None:
            raise HTTPException(503, "MongoDB no está lista.")
        storage = "mongo" if storage_required else "memory"
        cold_start_ms, first_observation = record_process_ready()
        if first_observation:
            _logger.info(
                "backend_first_ready_observed cold_start_ms=%.2f storage=%s",
                cold_start_ms,
                storage,
            )
        # Conservamos deliberadamente el shape público de readiness.
        return {"ok": True, "storage": storage}

    @router.post("/api/internal/billing-costs", status_code=204)
    @limiter.exempt
    async def ingest_billing_costs(
        request: Request,
        _billing_auth: None = Depends(billing_auth_dependency),
    ):
        raw = await request.body()
        try:
            costs = _parse_billing_costs(raw)
            exported = record_billing_costs_otel(costs)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            raise HTTPException(400, "Invalid billing telemetry payload.") from None
        if not exported:
            raise HTTPException(503, "Metrics export is not configured.")
        return Response(status_code=204)

    @router.get("/api/features")
    async def public_features(_username: str = Depends(auth_dependency)):
        # Sólo expone booleanos de producto deliberadamente públicos. Nunca
        # secretos, nombres de variables internas ni configuración sensible.
        return {"features": public_feature_flags()}

    @router.post("/api/client-telemetry", status_code=204)
    @limiter.limit("120/minute")
    async def client_telemetry(request: Request, body: ClientTelemetryRequest, username: str = Depends(auth_dependency)):
        record_client_event(body.model_dump(), username=username)
        return Response(status_code=204)

    @router.delete("/api/feedback/{feedback_id}", status_code=204)
    async def delete_own_feedback(feedback_id: str, username: str = Depends(auth_dependency)):
        # id + owner se resuelven en una única operación de storage. Un id de
        # otra cuenta se comporta igual que uno inexistente para no filtrar
        # información sobre feedback ajeno.
        deleted = await fstore.delete_feedback_for_user(feedback_id, username)
        if not deleted:
            raise HTTPException(404, "Feedback no encontrado.")
        return Response(status_code=204)

    @router.post("/api/auth/delete-account")
    @limiter.limit("5/hour")
    async def delete_own_account(
        request: Request,
        body: DeleteAccountRequest,
        username: str = Depends(auth_dependency),
    ):
        """Borra la identidad autenticada sólo tras revalidar su contraseña.

        La cuenta se elimina al final de la cascada. Si una dependencia de
        persistencia falla a mitad, el usuario conserva su identidad y puede
        reintentar sin dejar una cuenta aparentemente borrada con restos
        inaccesibles. El JWT queda inválido inmediatamente porque users_store
        actualiza su caché de existencia al borrar la cuenta.
        """
        user = await ustore.get_user(username)
        if not user or not verify_password(body.password, user.get("password_hash", "")):
            raise HTTPException(401, "La contraseña actual no es correcta.")

        purged = await user_data_lifecycle.purge_user_data(username)
        deleted = await ustore.delete_user(username)
        if not deleted:
            raise HTTPException(404, "La cuenta ya no existe.")

        request.state.username = username
        return {"deleted": True, "username": username, "deletedGames": purged["games"]}

    @router.get("/api/status")
    async def public_status(_username: str = Depends(auth_dependency)):
        try:
            if admin_usernames_getter is not None:
                configured_admins = {str(name).strip().lower() for name in admin_usernames_getter() if str(name).strip()}
                online_users = await ustore.count_online_users(
                    window_seconds=150,
                    exclude_usernames=configured_admins,
                    exclude_all="*" in configured_admins,
                )
            else:
                # Compatibilidad para routers embebidos fuera de main.py.
                # La app principal siempre pasa el getter y excluye todos los
                # admins en la consulta, no sólo al admin que hace la petición.
                online_users = await ustore.count_online_users(window_seconds=150)
                if is_admin_check(_username):
                    online_users = max(0, online_users - 1)
            # Observability is auxiliary: a metrics/history bug must never turn
            # the user-facing status endpoint into a 500. Presence counting is
            # authoritative; history recording is explicitly fail-open.
            try:
                record_presence_snapshot(online_users)
            except Exception as exc:
                _logger.warning("presence_history_record_failed error=%s", type(exc).__name__)
            return {"ok": True, "onlineUsers": online_users, "presenceAvailable": True}
        except db.PersistentStorageUnavailable:
            return {"ok": True, "onlineUsers": None, "presenceAvailable": False}

    return router
