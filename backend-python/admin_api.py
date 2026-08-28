"""Feedback and admin HTTP routes.

The router owns transport concerns; profile aggregation stays in
``admin_insights`` and authentication is injected by ``main``.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response

import feedback_store as fstore
from feedback_attachments import validate_feedback_attachments
import game_store as store
import profile_store as pstore
import users_store as ustore
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
                **_presence_summary(activity_anchor),
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
        result = await generate_narrative(
            "player_portrait",
            body.facts,
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


    @router.post("/api/admin/delete-user")
    async def admin_delete_user(body: AdminDeleteUserRequest, username: str = Depends(admin_dependency)):

        target = await _resolve_admin_target_username(body.username)
        if target == username:
            raise HTTPException(409, "No puedes borrar tu propia cuenta desde el panel de admin.")

        # Cascada deliberada: una cuenta borrada no debe dejar perfil ni savegames
        # activos. El historial/estadísticas del jugador viven dentro del perfil.
        deleted_games = await store.delete_games_by_owner(target)
        await pstore.delete_profile(target)
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
