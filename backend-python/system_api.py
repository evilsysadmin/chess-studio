"""Rutas de sistema: liveness, readiness y estado público autenticado."""

from __future__ import annotations

import logging

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
import release_info
from auth import verify_password
from feature_flags import public_feature_flags
from observability import record_process_ready
from observability_history import record_presence_snapshot
from api_models import ClientTelemetryRequest, DeleteAccountRequest
from client_telemetry import record_client_event
from pvp_api import build_pvp_router
from chronicles_api import build_chronicles_router

_logger = logging.getLogger("chess.system")


def build_system_router(*, auth_dependency, is_admin_check, limiter, admin_usernames_getter=None) -> APIRouter:
    router = APIRouter()
    # Keep experimental/game-adjacent transports behind the same authenticated
    # system-router aggregate already mounted by main.py. This avoids a second
    # auth stack while their runtime logic stays isolated from the CPU game API.
    router.include_router(build_pvp_router(auth_dependency=auth_dependency, limiter=limiter))
    router.include_router(build_chronicles_router(auth_dependency=auth_dependency))

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
        return {"ok": True}

    @router.get("/api/release")
    @limiter.exempt
    async def release():
        payload = {"release": release_info.backend_release()}
        build = release_info.build_commit()
        if build:
            payload["build"] = build
        return payload

    @router.get("/api/ready")
    @limiter.exempt
    async def ready():
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
        return {"ok": True, "storage": storage}

    @router.get("/api/features")
    async def public_features(_username: str = Depends(auth_dependency)):
        return {"features": public_feature_flags()}

    @router.post("/api/client-telemetry", status_code=204)
    @limiter.limit("120/minute")
    async def client_telemetry(request: Request, body: ClientTelemetryRequest, username: str = Depends(auth_dependency)):
        record_client_event(body.model_dump(), username=username)
        return Response(status_code=204)

    @router.delete("/api/feedback/{feedback_id}", status_code=204)
    async def delete_own_feedback(feedback_id: str, username: str = Depends(auth_dependency)):
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
        user = await ustore.get_user(username)
        if not user or not verify_password(body.password, user.get("password_hash", "")):
            raise HTTPException(401, "La contraseña actual no es correcta.")

        deleted_games = await gstore.delete_games_by_owner(username)
        await pstore.delete_profile(username)
        await pvp_store.delete_user_data(username)
        await chronicles_run_store.delete_user_runs(username)
        await matthias_daily_store.delete_user_daily(username)
        await matthias_memory_store.delete_user_memory(username)
        deleted = await ustore.delete_user(username)
        if not deleted:
            raise HTTPException(404, "La cuenta ya no existe.")

        request.state.username = username
        return {"deleted": True, "username": username, "deletedGames": deleted_games}

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
                online_users = await ustore.count_online_users(window_seconds=150)
                if is_admin_check(_username):
                    online_users = max(0, online_users - 1)
            try:
                record_presence_snapshot(online_users)
            except Exception as exc:
                _logger.warning("presence_history_record_failed error=%s", type(exc).__name__)
            return {"ok": True, "onlineUsers": online_users, "presenceAvailable": True}
        except db.PersistentStorageUnavailable:
            return {"ok": True, "onlineUsers": None, "presenceAvailable": False}

    return router
