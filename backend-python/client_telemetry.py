"""Bounded frontend telemetry before the external Grafana/Faro export layer.

Only coarse error classes and Web Vitals are retained.  No stack traces, URLs,
input values, chess positions or free-form messages are accepted.
"""
from __future__ import annotations

import json
import logging
import math
import threading
import time
from collections import Counter, defaultdict, deque
from typing import Any

MAX_EVENTS = 1000
_LOCK = threading.Lock()
_EVENTS: deque[dict[str, Any]] = deque(maxlen=MAX_EVENTS)
_logger = logging.getLogger("uvicorn.error")

_ALLOWED_EVENTS = {"frontend_error", "unhandled_rejection", "web_vital"}
_ALLOWED_METRICS = {"FCP", "LCP", "CLS", "TTFB", "INP"}


def _percentile(values: list[float], percentile: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = max(0, math.ceil(len(ordered) * percentile) - 1)
    return round(float(ordered[index]), 2)


def record_client_event(payload: dict[str, Any], *, username: str | None = None) -> bool:
    event_type = str(payload.get("event_type") or payload.get("eventType") or "")[:32]
    if event_type not in _ALLOWED_EVENTS:
        return False
    metric_name = str(payload.get("metric_name") or payload.get("metricName") or "")[:16] or None
    value = payload.get("value")
    if event_type == "web_vital":
        if metric_name not in _ALLOWED_METRICS:
            return False
        try:
            numeric = float(value)
        except (TypeError, ValueError):
            return False
        if not math.isfinite(numeric) or numeric < 0 or numeric > 1_000_000:
            return False
        value = round(numeric, 3)
    else:
        metric_name = None
        value = None

    row = {
        "at": time.time(),
        "event_type": event_type,
        "metric_name": metric_name,
        "value": value,
        "error_name": str(payload.get("error_name") or payload.get("errorName") or "")[:80] or None,
        "context": str(payload.get("context") or "unknown")[:48],
        "release": str(payload.get("release") or "unknown")[:40],
    }
    with _LOCK:
        _EVENTS.append(row)

    # Keep the Admin/Grafana-facing aggregate durable across Render restarts.
    # This path receives only the already-sanitized coarse fields above and is
    # deliberately fail-open: telemetry must never break a product request.
    try:
        from observability_history import record_frontend_event

        record_frontend_event(
            row["event_type"],
            metric_name=row["metric_name"],
            value=row["value"],
            error_name=row["error_name"],
            context=row["context"],
            release=row["release"],
            timestamp=row["at"],
        )
    except Exception:
        pass

    # Human-operational log may identify the authenticated account, while the
    # in-memory aggregate below stays identity-free and low-cardinality.
    log_row = {
        "event": "frontend_telemetry",
        "event_type": row["event_type"],
        "context": row["context"],
        "release": row["release"],
    }
    if row["metric_name"]:
        log_row["metric_name"] = row["metric_name"]
        log_row["value"] = row["value"]
    if row["error_name"]:
        log_row["error_name"] = row["error_name"]
    if username:
        log_row["username"] = str(username)[:64]
    _logger.info(json.dumps(log_row, ensure_ascii=True, separators=(",", ":"), sort_keys=True))
    return True


def get_client_telemetry(window_seconds: int = 24 * 60 * 60) -> dict[str, Any]:
    cutoff = time.time() - max(60, int(window_seconds))
    with _LOCK:
        rows = [row.copy() for row in _EVENTS if row["at"] >= cutoff]
    errors = [row for row in rows if row["event_type"] != "web_vital"]
    vital_values: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        if row["event_type"] == "web_vital" and row.get("metric_name") and row.get("value") is not None:
            vital_values[row["metric_name"]].append(float(row["value"]))
    return {
        "samples": len(rows),
        "errors": len(errors),
        "error_names": dict(Counter(row.get("error_name") or "Error" for row in errors).most_common(8)),
        "vitals_p75": {name: _percentile(values, 0.75) for name, values in sorted(vital_values.items())},
        "scope": "in_memory_identity_free",
    }


def reset_client_telemetry() -> None:
    with _LOCK:
        _EVENTS.clear()
