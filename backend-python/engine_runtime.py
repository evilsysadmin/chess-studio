"""Bounded execution boundary for CPU-heavy chess searches.

FastAPI routes are asynchronous because storage and network work are I/O bound,
but the pure-Python chess engine is deliberately synchronous and CPU bound. A
small dedicated pool keeps that search off Uvicorn's event-loop thread while
bounding concurrent CPU work.

Critical gameplay work is never rejected here. Optional analysis has its own
small admission gate so it cannot build an unbounded FIFO queue in front of
moves and hints.
"""
from __future__ import annotations

import asyncio
import os
import threading
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar


ResultT = TypeVar("ResultT")


class EngineBackpressureError(RuntimeError):
    """Raised when optional engine work is shed before entering the executor."""


def configured_engine_workers() -> int:
    """Return the bounded engine parallelism for this process."""
    raw = (os.getenv("CHESS_ENGINE_WORKERS") or "").strip()
    if not raw:
        return 1
    try:
        return max(1, min(int(raw), 4))
    except ValueError:
        return 1


def configured_optional_engine_limit() -> int:
    """Bound optional work to at most the active worker count by default.

    With the production default of one engine worker this means optional
    analysis never forms a queue: one request may be running, later optional
    requests are shed immediately while critical gameplay remains admissible.
    """
    raw = (os.getenv("CHESS_ENGINE_OPTIONAL_INFLIGHT_LIMIT") or "").strip()
    default = configured_engine_workers()
    if not raw:
        return default
    try:
        return max(1, min(int(raw), 8))
    except ValueError:
        return default


_ENGINE_EXECUTOR = ThreadPoolExecutor(
    max_workers=configured_engine_workers(),
    thread_name_prefix="chess-engine",
)
_ENGINE_STATE_LOCK = threading.Lock()
_OPTIONAL_INFLIGHT = 0
_OPTIONAL_REJECTIONS = 0


def engine_optional_pressure() -> dict[str, int]:
    with _ENGINE_STATE_LOCK:
        return {
            "optional_inflight": _OPTIONAL_INFLIGHT,
            "optional_limit": configured_optional_engine_limit(),
            "optional_rejections": _OPTIONAL_REJECTIONS,
        }


async def run_engine_work(function: Callable[..., ResultT], *args: Any, **kwargs: Any) -> ResultT:
    """Run critical engine work without occupying the HTTP event-loop thread."""
    loop = asyncio.get_running_loop()
    operation = partial(function, *args, **kwargs)
    return await loop.run_in_executor(_ENGINE_EXECUTOR, operation)


async def run_optional_engine_work(function: Callable[..., ResultT], *args: Any, **kwargs: Any) -> ResultT:
    """Admit optional work only when it cannot create a backlog.

    This gate intentionally sits before ThreadPoolExecutor's unbounded internal
    queue. Critical calls continue to use run_engine_work() and are never
    rejected by this optional admission policy.
    """
    global _OPTIONAL_INFLIGHT, _OPTIONAL_REJECTIONS
    with _ENGINE_STATE_LOCK:
        limit = configured_optional_engine_limit()
        if _OPTIONAL_INFLIGHT >= limit:
            _OPTIONAL_REJECTIONS += 1
            raise EngineBackpressureError("optional engine capacity is busy")
        _OPTIONAL_INFLIGHT += 1
    try:
        return await run_engine_work(function, *args, **kwargs)
    finally:
        with _ENGINE_STATE_LOCK:
            _OPTIONAL_INFLIGHT = max(0, _OPTIONAL_INFLIGHT - 1)


def reset_engine_pressure_state() -> None:
    """Test/diagnostic helper; never changes executor worker ownership."""
    global _OPTIONAL_INFLIGHT, _OPTIONAL_REJECTIONS
    with _ENGINE_STATE_LOCK:
        _OPTIONAL_INFLIGHT = 0
        _OPTIONAL_REJECTIONS = 0
