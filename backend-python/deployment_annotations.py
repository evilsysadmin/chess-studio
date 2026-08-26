"""Low-volume deployment annotations for Admin observability.

A Render cold start of the same commit must not look like a new release.  The
unique deployment identity therefore prefers the provider git commit and only
falls back to the Chess Studio release marker.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

from observability import PROCESS_STARTED_AT
from release_info import backend_release, deployment_identity

COLLECTION_NAME = "deployment_annotations_v1"


def _provider() -> str:
    if os.getenv("RENDER") or os.getenv("RENDER_SERVICE_ID"):
        return "render"
    if os.getenv("OCI_RESOURCE_PRINCIPAL_VERSION"):
        return "oracle"
    return "unknown"


async def ensure_current_deployment_annotation() -> None:
    try:
        from db import get_db

        database = await get_db()
        if database is None:
            return
        collection = database[COLLECTION_NAME]
        identity = deployment_identity()
        await collection.update_one(
            {"deployment_id": identity},
            {
                "$setOnInsert": {
                    "deployment_id": identity,
                    "release": backend_release(),
                    "provider": _provider(),
                    "deployed_at": datetime.fromtimestamp(PROCESS_STARTED_AT, tz=timezone.utc),
                }
            },
            upsert=True,
        )
        try:
            await collection.create_index("deployment_id", unique=True, name="deployment_id_unique")
            await collection.create_index("deployed_at", name="deployment_time")
        except Exception:
            pass
    except Exception:
        # Annotations are diagnostic only; they can never make Admin or gameplay fail.
        return


async def list_deployment_annotations(limit: int = 30) -> list[dict[str, Any]]:
    try:
        from db import get_db

        database = await get_db()
        if database is None:
            return []
        cursor = database[COLLECTION_NAME].find({}, {"_id": 0}).sort("deployed_at", -1).limit(max(1, min(limit, 100)))
        rows: list[dict[str, Any]] = []
        async for row in cursor:
            at = row.get("deployed_at")
            rows.append({
                "release": str(row.get("release") or "unknown")[:40],
                "provider": str(row.get("provider") or "unknown")[:24],
                "deploymentId": str(row.get("deployment_id") or "")[:80],
                "at": at.isoformat() if hasattr(at, "isoformat") else str(at or ""),
            })
        return rows
    except Exception:
        return []
