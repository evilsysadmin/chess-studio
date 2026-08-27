"""Sampled, non-authoritative shadow evaluation for move analysis.

The shadow path never changes the response. It is disabled by default on the
free Render deployment and can be sampled later (or locally/OCI) to compare a
candidate analysis level against production behaviour before promotion.
"""
from __future__ import annotations

import asyncio
import os
import random
import threading
import time
from collections import deque
from typing import Any, Callable

_LOCK = threading.Lock()
_EVENTS: deque[dict[str, Any]] = deque(maxlen=500)
_SEMAPHORE_LOCK = threading.Lock()
_SEMAPHORES: dict[int, asyncio.Semaphore] = {}


def _sample_percent() -> float:
    raw = (os.getenv("SHADOW_EVAL_PERCENT") or "0").strip()
    try:
        return max(0.0, min(float(raw), 25.0))
    except ValueError:
        return 0.0


def _level_delta() -> float:
    raw = (os.getenv("SHADOW_EVAL_LEVEL_DELTA") or "10").strip()
    try:
        return max(1.0, min(float(raw), 30.0))
    except ValueError:
        return 10.0


def shadow_enabled() -> bool:
    return _sample_percent() > 0


def should_sample(random_value: float | None = None) -> bool:
    value = random.random() if random_value is None else float(random_value)
    return shadow_enabled() and value < (_sample_percent() / 100.0)


def _semaphore() -> asyncio.Semaphore:
    loop = asyncio.get_running_loop()
    key = id(loop)
    with _SEMAPHORE_LOCK:
        sem = _SEMAPHORES.get(key)
        if sem is None:
            sem = asyncio.Semaphore(1)
            _SEMAPHORES[key] = sem
        return sem


def _record(primary: dict[str, Any] | None, candidate: dict[str, Any] | None, latency_ms: float, *, error: str | None = None) -> None:
    primary_san = str(primary.get("move", {}).get("san") or "")[:16] if isinstance(primary, dict) else ""
    candidate_san = str(candidate.get("move", {}).get("san") or "")[:16] if isinstance(candidate, dict) else ""
    primary_score = primary.get("score") if isinstance(primary, dict) else None
    candidate_score = candidate.get("score") if isinstance(candidate, dict) else None
    score_delta = None
    try:
        if primary_score is not None and candidate_score is not None:
            score_delta = round(float(candidate_score) - float(primary_score), 3)
    except (TypeError, ValueError, OverflowError):
        score_delta = None
    with _LOCK:
        _EVENTS.append({
            "at": time.time(),
            "same_move": bool(primary_san and primary_san == candidate_san),
            "latency_ms": round(max(0.0, float(latency_ms)), 2),
            "score_delta": score_delta,
            "error": str(error or "")[:40] or None,
        })


async def _run_shadow(board: Any, level: float, primary: dict[str, Any], analyze_fn: Callable[[Any, float], Any]) -> None:
    semaphore = _semaphore()
    if semaphore.locked():
        return
    async with semaphore:
        try:
            from resilience import pressure_state
            if pressure_state()["level"] != "normal":
                return
        except Exception:
            pass
        started = time.perf_counter()
        try:
            candidate_level = min(100.0, max(0.0, float(level)) + _level_delta())
            candidate = await asyncio.to_thread(analyze_fn, board, candidate_level)
            _record(primary, candidate, (time.perf_counter() - started) * 1000)
        except Exception as exc:
            _record(primary, None, (time.perf_counter() - started) * 1000, error=type(exc).__name__)


def maybe_schedule_move_shadow(board: Any, level: float, primary: dict[str, Any], analyze_fn: Callable[[Any, float], Any]) -> bool:
    if not should_sample():
        return False
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        return False
    loop.create_task(_run_shadow(board, level, primary, analyze_fn))
    return True


def get_shadow_metrics() -> dict[str, Any]:
    with _LOCK:
        rows = list(_EVENTS)
    samples = len(rows)
    matches = sum(1 for row in rows if row["same_move"])
    errors = sum(1 for row in rows if row["error"])
    latencies = sorted(float(row["latency_ms"]) for row in rows)
    p95 = latencies[max(0, int((len(latencies) - 1) * 0.95))] if latencies else None
    deltas = [abs(float(row["score_delta"])) for row in rows if row["score_delta"] is not None]
    return {
        "enabled": shadow_enabled(),
        "sample_percent": _sample_percent(),
        "level_delta": _level_delta(),
        "samples": samples,
        "same_move_percent": round(matches * 100 / samples, 1) if samples else None,
        "errors": errors,
        "p95_ms": round(p95, 2) if p95 is not None else None,
        "mean_abs_score_delta": round(sum(deltas) / len(deltas), 3) if deltas else None,
        "authoritative": False,
    }


def reset_shadow_metrics() -> None:
    with _LOCK:
        _EVENTS.clear()
