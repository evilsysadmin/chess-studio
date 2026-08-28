"""Single backend release and deployment identity used by diagnostics.

The public application release changes with every packaged Chess Studio build.
A deployment identity should be more stable: Render cold starts of the same git
commit must resolve to the same value so observability does not invent a fresh
deployment annotation after every process restart.
"""
from __future__ import annotations

import os
import re

APP_RELEASE = "v16.6dm46zeo"

_COMMIT_ENV_KEYS = (
    "RENDER_GIT_COMMIT",
    "GITHUB_SHA",
    "GIT_COMMIT_SHA",
    "COMMIT_SHA",
)


def backend_release() -> str:
    return APP_RELEASE


def _safe_identity_component(value: str, *, limit: int = 80) -> str:
    """Normalize provider metadata before persisting it as a diagnostic key."""
    normalized = re.sub(r"[^A-Za-z0-9._:-]+", "-", str(value or "").strip()).strip("-")
    return normalized[:limit]


def deployment_identity() -> str:
    """Return a stable, non-secret identity for the current deployed build.

    Prefer a provider/CI commit SHA when one is available.  This makes repeated
    cold starts of the same Render deploy idempotent.  Local runs and providers
    without commit metadata fall back to the packaged application release.
    """
    for key in _COMMIT_ENV_KEYS:
        component = _safe_identity_component(os.getenv(key, ""))
        if component:
            return f"git:{component}"
    return f"release:{APP_RELEASE}"
