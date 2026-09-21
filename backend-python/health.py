"""Health check endpoint for Chess Studio backend.

Provides a simple `/health` route that can be used by load balancers,
orchestration platforms (OCI, Kubernetes, etc.) and monitoring tools
to verify that the service is up and running.

The endpoint returns a JSON payload with:
- `status`: always `"ok"` when the service is reachable.
- `environment`: the value of the `DEPLOY_TARGET` environment variable,
  defaulting to `"local"` when not set.
- `version`: the git SHA of the current deployment if the `GIT_SHA`
  environment variable is present, otherwise `"unknown"`.

The implementation is deliberately lightweight and async‑compatible,
making it safe to call from any async framework (e.g. FastAPI).
"""

import os
from fastapi import APIRouter, status
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    environment: str
    version: str


@router.get(
    "/health",
    response_model=HealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Health check",
    tags=["monitoring"],
)
async def health_check() -> HealthResponse:
    """
    Return a minimal health payload.

    The function is async to stay consistent with the rest of the API
    and to avoid blocking the event loop if future extensions need
    to perform I/O (e.g., DB ping).
    """
    env = os.getenv("DEPLOY_TARGET", "local")
    sha = os.getenv("GIT_SHA", "unknown")
    return HealthResponse(status="ok", environment=env, version=sha)
