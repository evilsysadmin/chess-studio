"""Bounded execution boundary for CPU-heavy chess searches.

FastAPI routes are asynchronous because storage and network work are I/O bound,
but the pure-Python chess engine is deliberately synchronous and CPU bound. A
a small dedicated pool keeps that search off Uvicorn's event-loop thread while
bounding concurrent CPU work. Production defaults to one worker; staging can
raise the bound deliberately for measured capacity experiments.
"""
from __future__ import annotations

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar


ResultT = TypeVar("ResultT")


def configured_engine_workers() -> int:
    """Return the bounded engine parallelism for this process.

    Production remains conservative by default. Staging may opt into a small
    evidence-gathering increase through CHESS_ENGINE_WORKERS.
    """
    raw = (os.getenv("CHESS_ENGINE_WORKERS") or "").strip()
    if not raw:
        return 1
    try:
        return max(1, min(int(raw), 4))
    except ValueError:
        return 1


_ENGINE_EXECUTOR = ThreadPoolExecutor(
    max_workers=configured_engine_workers(),
    thread_name_prefix="chess-engine",
)


async def run_engine_work(function: Callable[..., ResultT], *args: Any, **kwargs: Any) -> ResultT:
    """Run one engine operation without occupying the HTTP event-loop thread."""
    loop = asyncio.get_running_loop()
    operation = partial(function, *args, **kwargs)
    return await loop.run_in_executor(_ENGINE_EXECUTOR, operation)
