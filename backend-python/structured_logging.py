"""Structured operational HTTP logs for Chess Studio.

Logs may include the authenticated username for operational usage/debugging,
but never IPs, request bodies, FENs, passwords or tokens. Username is kept out
of metrics labels so observability series remain low-cardinality.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any


_UUIDISH_SEGMENT = re.compile(r"^[0-9a-fA-F]{8,}(?:-[0-9a-fA-F]{4,}){2,}$")
_LONG_TOKEN_SEGMENT = re.compile(r"^[A-Za-z0-9_-]{24,}$")
_LONG_NUMBER_SEGMENT = re.compile(r"^\d{4,}$")


def normalize_unmatched_path(value: str | None) -> str | None:
    """Keep 404s actionable without logging likely user/game identifiers."""
    raw = str(value or "").split("?", 1)[0].strip()
    if not raw.startswith("/"):
        return None
    parts = []
    for part in raw.split("/")[1:]:
        clean = re.sub(r"[^A-Za-z0-9._~-]", "-", part)[:80]
        if _UUIDISH_SEGMENT.fullmatch(clean) or _LONG_TOKEN_SEGMENT.fullmatch(clean):
            clean = "{id}"
        elif _LONG_NUMBER_SEGMENT.fullmatch(clean):
            clean = "{n}"
        parts.append(clean)
    normalized = "/" + "/".join(parts)
    return normalized[:200]


def emit_http_event(
    logger: logging.Logger,
    *,
    request_id: str,
    method: str,
    route: str,
    status_code: int,
    duration_ms: float,
    client_release: str | None = None,
    username: str | None = None,
    request_path: str | None = None,
    exception: bool = False,
) -> None:
    payload: dict[str, Any] = {
        "event": "http_request",
        "request_id": str(request_id)[:80],
        "method": str(method or "?").upper()[:8],
        "route": str(route or "unknown")[:160],
        "status": int(status_code or 0),
        "duration_ms": round(max(0.0, float(duration_ms or 0.0)), 2),
    }
    if client_release:
        payload["client_release"] = str(client_release)[:40]
    if exception:
        payload["exception"] = True
    clean_path = normalize_unmatched_path(request_path)
    if clean_path:
        payload["request_path"] = clean_path
    clean_username = str(username or "").strip()[:64]
    if clean_username and clean_username != "-":
        payload["username"] = clean_username
    message = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    if exception:
        logger.exception(message)
    else:
        logger.info(message)
