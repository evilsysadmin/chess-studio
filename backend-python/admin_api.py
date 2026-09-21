"""Main admin API router for Chess Studio.

This module aggregates all sub‑routers (auth, insights, health, …)
and exposes a single FastAPI `APIRouter` that can be included in the
application entry‑point.

The file previously only imported `auth` and `admin_insights`.  The
health endpoint is now added to give operators a reliable liveness
probe.
"""

from fastapi import APIRouter

# Existing sub‑routers
from . import auth, admin_insights

# New health router
from .health import router as health_router

router = APIRouter()

# Register sub‑routers under their respective prefixes
router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(admin_insights.router, prefix="/insights", tags=["insights"])
router.include_router(health_router, prefix="", tags=["monitoring"])
