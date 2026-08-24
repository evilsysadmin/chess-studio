"""Feedback and admin HTTP routes.

The router owns transport concerns; profile aggregation stays in
``admin_insights`` and authentication is injected by ``main``.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request

import feedback_store as fstore
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
    AdminFeedbackStatusRequest,
    AdminInsightsRequest,
    FeedbackRequest,
)
from observability import get_database_metrics, get_http_metrics
from observability_history import get_history as get_observability_history


def build_admin_router(*, auth_dependency, admin_dependency, limiter) -> APIRouter:
    router = APIRouter()
    @router.post("/api/feedback", status_code=201)
    @limiter.limit("10/hour")
    async def submit_feedback(request: Request, body: FeedbackRequest, username: str = Depends(auth_dependency)):
        category = (body.category or "other").strip().lower()
        allowed_categories = {"bug", "idea", "ux", "other"}
        if category not in allowed_categories:
            raise HTTPException(400, "Categoría de feedback inválida.")
        message = (body.message or "").strip()
        if len(message) < 3:
            raise HTTPException(400, "Cuéntanos un poco más para poder usar el feedback.")
        context = (body.context or "Home").strip() or "Home"
        created = await fstore.create_feedback(
            username=username,
            category=category,
            message=message,
            context=context,
        )
        return {"feedback": created}


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
        return {
            "http": get_http_metrics(),
            "database": await get_database_metrics(),
            "history": history,
        }


    @router.get("/api/admin/feedback")
    async def admin_list_feedback(username: str = Depends(admin_dependency)):
        rows = await fstore.list_feedback(limit=100)
        return {
            "feedback": rows,
            "newCount": sum(1 for row in rows if row.get("status") == "new"),
        }


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


    @router.get("/api/admin/users")
    async def admin_list_users(username: str = Depends(admin_dependency)):

        usernames = await ustore.list_usernames()
        result = []
        for uname in usernames:
            user = await ustore.get_user(uname)
            profile = await pstore.get_profile(uname)
            user_doc = user or {}
            # Cuentas antiguas podían no tener `last_activity`. Desde V16.6 el
            # login fuerza también `last_login`; mientras migran, created_at es
            # mejor fallback que mostrar “Sin actividad” como si nunca hubieran
            # existido. El siguiente login/heartbeat reemplaza enseguida ese dato.
            activity_anchor = user_doc.get("last_activity") or user_doc.get("last_login") or user_doc.get("created_at")
            result.append({
                "username": uname,
                "createdAt": user_doc.get("created_at"),
                "currentActivity": user_doc.get("current_activity"),
                "clientRelease": user_doc.get("client_release"),
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
