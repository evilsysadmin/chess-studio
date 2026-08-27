"""Backend release identity kept in lock-step with the client release."""
from __future__ import annotations

import os

APP_RELEASE = "v16.6dm46z"


def backend_release() -> str:
    return (os.getenv("CHESS_RELEASE") or APP_RELEASE).strip()[:40] or APP_RELEASE


def deployment_identity() -> str:
    commit = (os.getenv("RENDER_GIT_COMMIT") or os.getenv("GIT_COMMIT") or "").strip()
    if commit:
        return f"git:{commit[:40]}"
    return f"release:{backend_release()}"
