"""Structured operational HTTP logs for Chess Studio.

Logs may include the authenticated username for operational usage/debugging,
but never IPs, request bodies, FENs, passwords or tokens. Username is kept out
of metrics labels so observability series remain low-cardinality.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from grafana_telemetry import record_http_log


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
    clean_username = str(username or "").strip()[:64]
    if clean_username and clean_username != "-":
        payload["username"] = clean_username
    message = json.dumps(payload, ensure_ascii=True, separators=(",", ":"), sort_keys=True)
    if exception:
        logger.exception(message)
    else:
        logger.info(message)
    # El log local anterior conserva username para soporte de Render. Loki usa
    # un contrato más reducido: no pasamos esa identidad ni el traceback.
    record_http_log(
        request_id=request_id,
        method=method,
        route=route,
        status_code=status_code,
        duration_ms=duration_ms,
        client_release=client_release,
    )
