"""One-shot Workers AI planner adapter for Chronicles run bootstrap.

The provider may suggest only the tiny topology intent already whitelisted by
chronicles_map_planner. Any local fallback, malformed JSON or provider failure
returns None so the deterministic generator remains authoritative.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx

from narrative_cloudflare import generate_narrative


planner_logger = logging.getLogger("uvicorn.error")
CHRONICLES_PLANNER_EVENT_TYPE = "chronicles_planner"
CHRONICLES_PLANNER_TIMEOUT_SECONDS = 2.5


async def request_chronicles_planner_snapshot(
    areas: list[dict[str, Any]],
    *,
    request_id: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any] | None:
    if not areas:
        return None

    try:
        result = await asyncio.wait_for(
            generate_narrative(
                CHRONICLES_PLANNER_EVENT_TYPE,
                {
                    "requested_areas": len(areas),
                    "areas": areas,
                },
                tone="technical",
                locale="es-ES",
                request_kind="chronicles_bootstrap",
                request_id=request_id,
                client=client,
            ),
            timeout=CHRONICLES_PLANNER_TIMEOUT_SECONDS,
        )
    except asyncio.TimeoutError:
        planner_logger.warning(
            "chronicles_planner_rejected request_id=%s reason=timeout",
            request_id or "-",
        )
        return None
    if result.get("provider") != "cloudflare":
        return None

    text = result.get("text")
    if not isinstance(text, str) or not text.strip():
        return None
    try:
        payload = json.loads(text)
    except (json.JSONDecodeError, TypeError, ValueError):
        planner_logger.warning(
            "chronicles_planner_rejected request_id=%s reason=invalid_json",
            request_id or "-",
        )
        return None
    if not isinstance(payload, dict):
        planner_logger.warning(
            "chronicles_planner_rejected request_id=%s reason=invalid_root",
            request_id or "-",
        )
        return None
    return payload
