"""Runtime resilience controls for Chess Studio.

The goal is to protect the chess-critical path before optional work.  Pressure
signals are deliberately coarse and in-memory: they influence shedding and AI
degradation, but never game state or persistence.
"""
from __future__ import annotations

import asyncio
import os
import threading
import time
from contextlib import asynccontextmanager
from collections import deque
from typing import Any, AsyncIterator

_LOCK = threading.Lock()
_INFLIGHT = 0
_SHED_EVENTS: deque[float] = deque(maxlen=500)
_BULKHEAD_REJECTIONS: deque[tuple[float, str]] = deque(maxlen=500)

_OPTIONAL_PATHS = frozenset({
    "/api/narrative",
    "/api/analyze",
    "/api/analyze-move",
    "/api/admin/observability",
    "/api/admin/ai-metrics",
    "/api/client-telemetry",
})


def _env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = (os.getenv(name) or "").strip()
    try:
        return max(minimum, min(int(raw), maximum)) if raw else default
    except ValueError:
        return default


def _optional_inflight_limit() -> int:
    return _env_int("CHESS_OPTIONAL_INFLIGHT_LIMIT", 16, 2, 512)


def _degraded_inflight_threshold() -> int:
    return _env_int("CHESS_DEGRADED_INFLIGHT", 12, 1, 512)


def _critical_inflight_threshold() -> int:
    return _env_int("CHESS_CRITICAL_INFLIGHT", 32, 2, 1024)


def request_enter() -> int:
    global _INFLIGHT
    with _LOCK:
        _INFLIGHT += 1
        return _INFLIGHT


def request_exit() -> None:
    global _INFLIGHT
    with _LOCK:
        _INFLIGHT = max(0, _INFLIGHT - 1)


def _recent_count(rows: deque[Any], seconds: float, *, channel: str | None = None) -> int:
    cutoff = time.monotonic() - max(1.0, float(seconds))
    if channel is None:
        # Some resilience signals are plain timestamps (shed events) while
        # bulkhead rejects retain the channel as ``(timestamp, channel)``.
        # Count both shapes without making the pressure dashboard itself a
        # failure mode after a rejection.
        return sum(
            1
            for item in rows
            if float(item[0] if isinstance(item, (tuple, list)) else item) >= cutoff
        )
    return sum(1 for at, item_channel in rows if float(at) >= cutoff and item_channel == channel)


def pressure_state() -> dict[str, Any]:
    with _LOCK:
        inflight = _INFLIGHT
        shed_5m = _recent_count(_SHED_EVENTS, 300)
        bulkhead_5m = _recent_count(_BULKHEAD_REJECTIONS, 300)

    level = "normal"
    reasons: list[str] = []
    if inflight >= _critical_inflight_threshold():
        level = "critical"
        reasons.append("inflight_critical")
    elif inflight >= _degraded_inflight_threshold():
        level = "degraded"
        reasons.append("inflight_high")

    # HTTP history is a secondary signal. Import lazily to keep this module
    # usable in tests and to avoid a dependency cycle during app startup.
    try:
        from observability import get_http_metrics

        recent = (get_http_metrics() or {}).get("last_15m") or {}
        samples = int(recent.get("samples") or 0)
        p95_ms = recent.get("p95_ms")
        error_pct = recent.get("error_5xx_percent")
        if samples >= 20:
            p95 = float(p95_ms) if p95_ms is not None else 0.0
            errors = float(error_pct) if error_pct is not None else 0.0
            if p95 >= 3000 or errors >= 10.0:
                level = "critical"
                reasons.append("http_critical")
            elif level == "normal" and (p95 >= 1500 or errors >= 3.0):
                level = "degraded"
                reasons.append("http_degraded")
    except Exception:
        pass

    return {
        "level": level,
        "reasons": reasons,
        "inflight": inflight,
        "optional_inflight_limit": _optional_inflight_limit(),
        "degraded_inflight_threshold": _degraded_inflight_threshold(),
        "critical_inflight_threshold": _critical_inflight_threshold(),
        "shed_last_5m": shed_5m,
        "bulkhead_rejections_last_5m": bulkhead_5m,
    }


def should_shed(path: str, inflight: int | None = None) -> bool:
    clean_path = str(path or "").split("?", 1)[0]
    if clean_path not in _OPTIONAL_PATHS:
        return False
    count = int(inflight if inflight is not None else pressure_state()["inflight"])
    pressure = pressure_state()
    return count > _optional_inflight_limit() or pressure["level"] == "critical"


def record_shed() -> None:
    with _LOCK:
        _SHED_EVENTS.append(time.monotonic())


def adaptive_ai_mode(channel: str) -> str:
    """normal | local_only | shed.

    Rich/slow AI work is sacrificed before short move comments.  Under critical
    pressure all remote AI is removed from the path; local deterministic copy
    remains available to the user.
    """
    level = pressure_state()["level"]
    if level == "critical":
        return "shed"
    if level == "degraded" and channel in {"analysis", "player_portrait"}:
        return "local_only"
    return "normal"


_BULKHEAD_LOCK = threading.Lock()
_BULKHEADS: dict[tuple[int, str], asyncio.Semaphore] = {}
_BULKHEAD_LIMITS = {"comments": 4, "analysis": 2, "player_portrait": 1}


def _bulkhead_limit(channel: str) -> int:
    env_name = f"CHESS_AI_BULKHEAD_{channel.upper()}"
    return _env_int(env_name, _BULKHEAD_LIMITS.get(channel, 2), 1, 32)


def _bulkhead(channel: str) -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    key = (id(loop), channel)
    with _BULKHEAD_LOCK:
        semaphore = _BULKHEADS.get(key)
        if semaphore is None:
            semaphore = asyncio.Semaphore(_bulkhead_limit(channel))
            _BULKHEADS[key] = semaphore
        return semaphore


async def try_enter_ai_bulkhead(channel: str, wait_seconds: float = 0.05) -> asyncio.Semaphore | None:
    semaphore = _bulkhead(channel)
    try:
        await asyncio.wait_for(semaphore.acquire(), timeout=max(0.001, wait_seconds))
        return semaphore
    except asyncio.TimeoutError:
        with _LOCK:
            _BULKHEAD_REJECTIONS.append((time.monotonic(), channel))
        return None


def leave_ai_bulkhead(semaphore: asyncio.Semaphore | None) -> None:
    if semaphore is not None:
        semaphore.release()


@asynccontextmanager
async def ai_bulkhead(channel: str, wait_seconds: float = 0.05) -> AsyncIterator[bool]:
    semaphore = await try_enter_ai_bulkhead(channel, wait_seconds)
    try:
        yield semaphore is not None
    finally:
        leave_ai_bulkhead(semaphore)


def reset_resilience_state() -> None:
    global _INFLIGHT
    with _LOCK:
        _INFLIGHT = 0
        _SHED_EVENTS.clear()
        _BULKHEAD_REJECTIONS.clear()
    with _BULKHEAD_LOCK:
        _BULKHEADS.clear()
