"""Feedback and admin HTTP routes.

The router owns transport concerns; profile aggregation stays in
``admin_insights`` and authentication is injected by ``main``.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

import feedback_store as fstore
from feedback_attachments import validate_feedback_attachments
import game_store as store
import profile_store as pstore
import users_store as ustore
import matthias_daily_store as matthias_daily_store
import matthias_memory_store as matthias_memory_store
from admin_insights import (
    _extract_admin_insights_payload,
    _extract_summary_stats,
    _foreground_summary,
    _presence_summary,
)
from api_models import (
    AdminDeleteUserRequest,
    AdminFeedbackReplyRequest,
    AdminFeedbackStatusRequest,
    AdminInsightsRequest,
    AdminPlayerPortraitRequest,
    AdminMatthiasPreviewRequest,
    AdminUserRatingRequest,
    FeedbackRequest,
)
from observability import get_database_metrics, get_http_metrics
from observability_history import get_history as get_observability_history
from narrative_cloudflare import generate_narrative, get_ai_dependency_health
from ip_geolocation import network_location_status, resolve_country_code
from resilience import pressure_state
from deployment_annotations import ensure_current_deployment_annotation, list_deployment_annotations
from shadow_evaluation import get_shadow_metrics
from release_info import backend_release
from tracing import emit_observability_probe, emit_trace_probe, tracing_diagnostics


MATTHIAS_PREVIEW_PRESETS = {
    "newcomer": {
        "total_games": 3, "record": {"wins": 1, "draws": 0, "losses": 2}, "question_kind": "improve",
        "matthias_memory": {
            "schema_version": 4, "relationship": {"tier": "acquainted", "label": "Ya nos conocemos", "games_seen": 3},
            "respect": {"tier": "recruit", "label": "Recluta bajo observación", "score": 6},
            "mood": "observant", "active_goals": [], "prior_advice": [], "progress_since_last": {},
        },
    },
    "veteran": {
        "total_games": 84, "record": {"wins": 46, "draws": 9, "losses": 29}, "puzzles_solved": 38, "question_kind": "strengths",
        "cpu_rivalry": {"games": 30, "wins": 14, "draws": 3, "losses": 13, "best_human_streak": 4, "best_cpu_streak": 3},
        "matthias_memory": {
            "schema_version": 4, "relationship": {"tier": "veteran", "label": "Viejo conocido", "games_seen": 84},
            "respect": {"tier": "formidable", "label": "Rival respetado", "score": 76}, "mood": "impressed",
            "active_goals": [], "prior_advice": [], "progress_since_last": {"total_games": 5, "record": {"wins": 4, "losses": 1}},
            "recent_milestones": [{"kind": "goal_completed", "polarity": "fame", "label": "Objetivo superado: Seguridad de la dama"}],
        },
    },
    "repeat_offender": {
        "total_games": 31, "record": {"wins": 12, "draws": 3, "losses": 16}, "question_kind": "tactics",
        "noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 6}],
        "matthias_memory": {
            "schema_version": 4, "relationship": {"tier": "regular", "label": "Habitual del despacho", "games_seen": 31},
            "respect": {"tier": "proven", "label": "Ya no eres recluta", "score": 31}, "mood": "skeptical",
            "active_goals": [{"id": "incident:cpu:KNIGHT_FORK", "topic": "forks", "label": "Horquillas y dobles ataques"}],
            "active_challenge": {"id": "clean-run:cpu:KNIGHT_FORK", "label": "3 partidas sin repetir: Horquillas y dobles ataques", "setbacks": 2},
            "prior_advice": [{"question_kind": "tactics", "text": "Antes de mover, revisa dobles ataques de caballo."}],
            "advice_followup": {"status": "struggling", "games_since": 5, "topic": "forks"},
            "progress_since_last": {"total_games": 5, "record": {"wins": 1, "losses": 4}},
        },
    },
    "improving": {
        "total_games": 24, "record": {"wins": 13, "draws": 2, "losses": 9}, "puzzles_solved": 19, "question_kind": "improve",
        "matthias_memory": {
            "schema_version": 4, "relationship": {"tier": "regular", "label": "Habitual del despacho", "games_seen": 24},
            "respect": {"tier": "respected", "label": "Respeto ganado", "score": 47}, "mood": "satisfied",
            "prior_advice": [{"question_kind": "improve", "text": "Revisa jaques, capturas y amenazas antes de decidir."}],
            "advice_followup": {"status": "improving", "games_since": 4, "topic": "decision_process"},
            "progress_since_last": {"total_games": 4, "puzzles_solved": 5, "record": {"wins": 3, "losses": 1}},
        },
    },
}


def _matthias_preview_facts(preset: str) -> dict:
    key = str(preset or "veteran").strip().lower()
    facts = MATTHIAS_PREVIEW_PRESETS.get(key)
    if facts is None:
        raise HTTPException(400, "Preset de Matthias no válido.")
    return {**facts, "preview_synthetic": True}


def build_admin_router(*, auth_dependency, admin_dependency, limiter) -> APIRouter:
    router = APIRouter()
    @router.post("/api/feedback", status_code=201)
    @limiter.limit("10/hour")
    async def submit_feedback(request: Request, body: FeedbackRequest, username: str = Depends(auth_dependency)):
        category = (body.category or "general").strip().lower()
        allowed_categories = {"general", "bug", "idea", "ux", "other"}
        if category not in allowed_categories:
            raise HTTPException(400, "Categoría de feedback inválida.")
        message = (body.message or "").strip()
        if len(message) < 3:
            raise HTTPException(400, "Cuéntanos un poco más para poder usar el feedback.")
        context = (body.context or "Home").strip() or "Home"
        try:
            attachments = validate_feedback_attachments(body.attachments)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        created = await fstore.create_feedback(
            username=username,
            category=category,
            message=message,
            context=context,
            attachments=attachments,
        )
        return {"feedback": created}


    @router.get("/api/feedback/mine")
    async def user_list_feedback(username: str = Depends(auth_dependency)):
        rows = await fstore.list_feedback_for_user(username, limit=20)
        return {"feedback": rows}


    @router.get("/api/admin/observability")
    async def admin_observability(
        from_time: Optional[str] = None,
        to_time: Optional[str] = None,
        username: str = Depends(admin_dependency),
    ):
        try:
            history = await get_observability_history(from_time, to_time)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        database = await get_database_metrics()
        ai_dependency = get_ai_dependency_health()
        resilience = pressure_state()
        await ensure_current_deployment_annotation()
        dependencies = [
            {
                "id": "mongo",
                "label": "MongoDB",
                "status": "ok" if database.get("status") in {"ok", "memory"} else "down",
                "critical": True,
                "latencyMs": database.get("latency_ms"),
            },
            {
                "id": "workers_ai",
                "label": "Workers AI",
                "status": ai_dependency.get("status"),
                "critical": False,
                "circuitOpen": ai_dependency.get("circuitOpen", False),
            },
        ]
        return {
            "http": get_http_metrics(),
            "database": database,
            "history": history,
            "dependencies": dependencies,
            "aiDependency": ai_dependency,
            "resilience": resilience,
            "frontend": history.get("frontend") or {},
            "deployments": await list_deployment_annotations(),
            "shadow": get_shadow_metrics(),
            "tracing": tracing_diagnostics(),
            "backendRelease": backend_release(),
        }


    @router.post("/api/admin/observability/trace-probe")
    async def admin_trace_probe(username: str = Depends(admin_dependency)):
        # Diagnostic only: emits one synthetic span and never exposes OTLP
        # endpoint/header values. A failed exporter remains fail-open.
        return emit_trace_probe()

    @router.post("/api/admin/observability/probe")
    async def admin_observability_probe(username: str = Depends(admin_dependency)):
        # Sends one safe synthetic signal through logs, metrics and traces.
        # It exposes only configured/flushed booleans and the trace id.
        return emit_observability_probe()


    @router.get("/api/admin/feedback")
    async def admin_list_feedback(username: str = Depends(admin_dependency)):
        rows = await fstore.list_feedback(limit=100)
        return {
            "feedback": rows,
            "newCount": sum(1 for row in rows if row.get("status") == "new"),
        }


    @router.get("/api/admin/feedback/summary")
    async def admin_feedback_summary(username: str = Depends(admin_dependency)):
        return await fstore.feedback_summary()


    @router.get("/api/admin/feedback/{feedback_id}/attachments/{attachment_index}")
    async def admin_feedback_attachment(
        feedback_id: str,
        attachment_index: int,
        username: str = Depends(admin_dependency),
    ):
        item = await fstore.get_feedback_attachment(feedback_id, attachment_index)
        if not item:
            raise HTTPException(404, "Adjunto de feedback no encontrado.")
        filename = str(item.get("name") or "captura").replace('"', "").replace("\r", "").replace("\n", "")
        return Response(
            content=item["data"],
            media_type=item["mime_type"],
            headers={
                "Content-Disposition": f'inline; filename="{filename}"',
                "Cache-Control": "private, max-age=300",
                "X-Content-Type-Options": "nosniff",
            },
        )


    @router.post("/api/admin/feedback/{feedback_id}/status")
    async def admin_update_feedback_status(
        feedback_id: str,
        body: AdminFeedbackStatusRequest,
        username: str = Depends(admin_dependency),
    ):
        status = (body.status or "").strip().lower()
        if status not in {"new", "read", "resolved"}:
            raise HTTPException(400, "Estado de feedback inválido.")
        updated = await fstore.update_feedback_status(feedback_id, status)
        if not updated:
            raise HTTPException(404, "Feedback no encontrado.")
        return {"feedback": updated}


    @router.post("/api/admin/feedback/{feedback_id}/reply")
    async def admin_reply_feedback(
        feedback_id: str,
        body: AdminFeedbackReplyRequest,
        username: str = Depends(admin_dependency),
    ):
        message = (body.message or "").strip()
        if not message:
            raise HTTPException(400, "La respuesta no puede estar vacía.")
        updated = await fstore.reply_to_feedback(feedback_id, message, resolve=bool(body.resolve))
        if not updated:
            raise HTTPException(404, "Feedback no encontrado.")
        return {"feedback": updated}


    @router.delete("/api/admin/feedback/{feedback_id}", status_code=204)
    async def admin_delete_feedback(
        feedback_id: str,
        username: str = Depends(admin_dependency),
    ):
        deleted = await fstore.delete_feedback(feedback_id)
        if not deleted:
            raise HTTPException(404, "Feedback no encontrado.")
        return Response(status_code=204)


    @router.get("/api/admin/users")
    async def admin_list_users(username: str = Depends(admin_dependency)):

        usernames = await ustore.list_usernames()
        result = []
        for uname in usernames:
            user = await ustore.get_user(uname)
            profile = await pstore.get_profile(uname)
            user_doc = user or {}
            client_ip = user_doc.get("last_client_ip")
            client_country = user_doc.get("last_client_country")
            if not client_country and network_location_status(client_ip) == "public":
                client_country = await resolve_country_code(client_ip)
                if client_country:
                    await ustore.update_client_country(uname, client_country)
            # Cuentas heredadas podían no tener `last_activity`. El
            # login fuerza también `last_login`; mientras migran, created_at es
            # mejor fallback que mostrar “Sin actividad” como si nunca hubieran
            # existido. El siguiente login/heartbeat reemplaza enseguida ese dato.
            activity_anchor = user_doc.get("last_activity") or user_doc.get("last_login") or user_doc.get("created_at")
            result.append({
                "username": uname,
                "createdAt": user_doc.get("created_at"),
                "currentActivity": user_doc.get("current_activity"),
                "clientRelease": user_doc.get("client_release"),
                "lastClientIp": client_ip,
                "lastClientCountry": client_country,
                "networkLocationStatus": "resolved" if client_country else network_location_status(client_ip),
                **_presence_summary(activity_anchor, user_doc.get("presence_online")),
                **_foreground_summary(user_doc),
                **_extract_summary_stats(profile),
            })
        return {"users": result}


    async def _resolve_admin_target_username(raw_username: str) -> str:
        """Resuelve una cuenta sin depender de que el username sea URL-safe.

        Las versiones históricas sólo exigían longitud mínima, por lo que puede
        haber nombres con caracteres reservados. El endpoint POST nuevo recibe el
        valor en JSON; esta resolución conserva además compatibilidad de mayúsculas
        con cuentas antiguas.
        """
        candidate = (raw_username or "").strip()
        if not candidate:
            raise HTTPException(400, "Falta el usuario a consultar.")

        if await ustore.get_user(candidate):
            return candidate

        lowered = candidate.lower()
        if lowered != candidate and await ustore.get_user(lowered):
            return lowered

        # Compatibilidad con cuentas muy antiguas creadas antes de normalizar a
        # minúsculas. Sólo se ejecuta en el panel admin y únicamente tras fallar
        # las búsquedas directas.
        for existing in await ustore.list_usernames():
            if str(existing).casefold() == candidate.casefold():
                return str(existing)

        raise HTTPException(404, "Usuario no encontrado.")


    @router.post("/api/admin/user-rating")
    async def admin_update_user_rating(body: AdminUserRatingRequest, username: str = Depends(admin_dependency)):
        target = await _resolve_admin_target_username(body.username)
        rating_key = "chess-study-player-rating"
        audit_key = "chess-study-admin-rating-audit"

        for _attempt in range(2):
            profile = await pstore.get_profile(target) or {}
            data = profile.get("data") if isinstance(profile.get("data"), dict) else {}
            revisions = profile.get("revisions") if isinstance(profile.get("revisions"), dict) else {}

            try:
                rating_data = json.loads(data.get(rating_key) or "{}")
            except (json.JSONDecodeError, TypeError):
                rating_data = {}
            if not isinstance(rating_data, dict):
                rating_data = {}
            try:
                games = max(0, int(rating_data.get("games") or 0))
            except (TypeError, ValueError):
                games = 0
            try:
                previous_rating = int(round(float(rating_data.get("rating"))))
            except (TypeError, ValueError):
                previous_rating = None

            try:
                audit = json.loads(data.get(audit_key) or "[]")
            except (json.JSONDecodeError, TypeError):
                audit = []
            if not isinstance(audit, list):
                audit = []
            audit.append({
                "date": datetime.now(timezone.utc).isoformat(),
                "source": "admin",
                "previousRating": previous_rating,
                "rating": int(body.rating),
            })
            audit = audit[-50:]

            result = await pstore.patch_profile(
                target,
                {
                    rating_key: json.dumps({"rating": int(body.rating), "games": games}, separators=(",", ":")),
                    audit_key: json.dumps(audit, separators=(",", ":")),
                },
                {
                    rating_key: int(revisions.get(rating_key) or 0),
                    audit_key: int(revisions.get(audit_key) or 0),
                },
            )
            if not isinstance(result, pstore.ProfilePatchConflict):
                return {
                    "username": target,
                    "rating": int(body.rating),
                    "games": games,
                    "previousRating": previous_rating,
                }

        raise HTTPException(409, "El perfil cambió mientras se corregía el ELO. Vuelve a intentarlo.")


    async def _admin_insights_response(target_username: str) -> dict:
        resolved = await _resolve_admin_target_username(target_username)
        profile = await pstore.get_profile(resolved)
        return {
            "username": resolved,
            **_extract_admin_insights_payload(profile),
        }


    @router.post("/api/admin/user-insights")
    async def admin_user_insights_post(body: AdminInsightsRequest, username: str = Depends(admin_dependency)):
        return await _admin_insights_response(body.username)


    @router.post("/api/admin/player-portrait")
    async def admin_player_portrait(body: AdminPlayerPortraitRequest, username: str = Depends(admin_dependency)):
        # Revalida que el target exista, pero nunca envía su username al LLM.
        target = await _resolve_admin_target_username(body.username)
        try:
            await matthias_memory_store.observe_facts(target, body.facts)
            memory_context = await matthias_memory_store.context(target, body.facts)
            portrait_facts = {**body.facts, "matthias_memory": memory_context}
        except Exception:
            portrait_facts = body.facts
        result = await generate_narrative(
            "player_portrait",
            portrait_facts,
            tone="friendly_sarcastic",
            locale="es-ES",
            request_kind="portrait_admin",
        )
        return {
            "username": target,
            "text": result.get("text"),
            "provider": result.get("provider"),
            "latencyMs": result.get("latencyMs"),
        }


    @router.post("/api/admin/matthias/personality-preview")
    async def admin_matthias_personality_preview(body: AdminMatthiasPreviewRequest, username: str = Depends(admin_dependency)):
        # Banco de pruebas sintético: no llama a observe_facts ni escribe memoria,
        # consultas o estadísticas de ningún jugador real.
        facts = _matthias_preview_facts(body.preset)
        result = await generate_narrative(
            "matthias_daily", facts, tone="friendly_sarcastic", locale="es-ES",
            request_kind=f"matthias_preview_{body.preset}",
        )
        return {
            "preset": body.preset,
            "text": result.get("text"),
            "provider": result.get("provider"),
            "latencyMs": result.get("latencyMs"),
            "synthetic": True,
        }


    @router.post("/api/admin/matthias/memory")
    async def admin_matthias_memory(body: AdminInsightsRequest, username: str = Depends(admin_dependency)):
        target = await _resolve_admin_target_username(body.username)
        summary = await matthias_memory_store.user_summary(target)
        return {"username": target, "memory": summary}


    @router.post("/api/admin/matthias/reset-memory")
    async def admin_reset_matthias_memory(body: AdminInsightsRequest, username: str = Depends(admin_dependency)):
        target = await _resolve_admin_target_username(body.username)
        await matthias_memory_store.delete_user_memory(target)
        return {"reset": True, "username": target}


    @router.post("/api/admin/delete-user")
    async def admin_delete_user(body: AdminDeleteUserRequest, username: str = Depends(admin_dependency)):

        target = await _resolve_admin_target_username(body.username)
        if target == username:
            raise HTTPException(409, "No puedes borrar tu propia cuenta desde el panel de admin.")

        # Cascada deliberada: una cuenta borrada no debe dejar perfil ni savegames
        # activos. El historial/estadísticas del jugador viven dentro del perfil.
        deleted_games = await store.delete_games_by_owner(target)
        await pstore.delete_profile(target)
        await matthias_daily_store.delete_user_daily(target)
        await matthias_memory_store.delete_user_memory(target)
        deleted = await ustore.delete_user(target)
        if not deleted:
            raise HTTPException(404, "Usuario no encontrado.")

        return {"deleted": True, "username": target, "deletedGames": deleted_games}


    # Compatibilidad con V15.2/V15.3 ya desplegadas. La UI nueva usa POST para
    # evitar problemas con caracteres reservados dentro del username.
    @router.get("/api/admin/users/{target_username}/insights")
    async def admin_user_insights(target_username: str, username: str = Depends(admin_dependency)):
        return await _admin_insights_response(target_username)

    return router