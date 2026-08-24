"""Rutas de sistema: liveness, readiness y estado público autenticado."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

import os

import db
import users_store as ustore


def build_system_router(*, auth_dependency, is_admin_check, limiter) -> APIRouter:
    router = APIRouter()

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

    @router.get("/api/ready")
    @limiter.exempt
    async def ready():
        # En desarrollo sin MONGO_URL explícito el modo memoria es válido. Si
        # hay persistencia configurada, readiness exige un ping real.
        storage_required = db.persistent_storage_required()
        if storage_required and await db.get_db() is None:
            raise HTTPException(503, "MongoDB no está lista.")
        payload = {"ok": True, "storage": "mongo" if storage_required else "memory"}
        # Render expone el SHA del deploy en runtime. Publicarlo aquí permite
        # que CI no despliegue un frontend nuevo contra un backend todavía viejo.
        render_commit = os.getenv("RENDER_GIT_COMMIT", "").strip()
        if render_commit:
            payload["commit"] = render_commit
        return payload

    @router.get("/api/status")
    async def public_status(_username: str = Depends(auth_dependency)):
        try:
            online_users = await ustore.count_online_users(window_seconds=150)
            if is_admin_check(_username):
                online_users = max(0, online_users - 1)
            return {"ok": True, "onlineUsers": online_users, "presenceAvailable": True}
        except db.PersistentStorageUnavailable:
            return {"ok": True, "onlineUsers": None, "presenceAvailable": False}

    return router
