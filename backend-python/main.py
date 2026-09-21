"""Application entry‑point for Chess Studio backend.

Creates the FastAPI app, registers the admin API router, and configures
any global middleware required for production.

This file existed previously; the only change is the import of the
`admin_api.router` which now includes the health endpoint.
"""

from fastapi import FastAPI
from .admin_api import router as admin_router

app = FastAPI(
    title="Chess Studio Admin API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# Mount the admin router at the root path.
app.include_router(admin_router)
