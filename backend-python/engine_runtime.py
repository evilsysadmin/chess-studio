"""Bounded execution boundary for CPU-heavy chess searches.

FastAPI routes are asynchronous because storage and network work are I/O bound,
but the pure-Python chess engine is deliberately synchronous and CPU bound. A
single dedicated worker keeps that search off Uvicorn's event-loop thread while
also preventing concurrent requests from making several searches fight for the
same small production CPU and returning shallower, timing-dependent moves.
"""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any, Callable, TypeVar


ResultT = TypeVar("ResultT")
_ENGINE_EXECUTOR = ThreadPoolExecutor(max_workers=1, thread_name_prefix="chess-engine")


async def run_engine_work(function: Callable[..., ResultT], *args: Any, **kwargs: Any) -> ResultT:
    """Run one engine operation without occupying the HTTP event-loop thread."""
    loop = asyncio.get_running_loop()
    operation = partial(function, *args, **kwargs)
    return await loop.run_in_executor(_ENGINE_EXECUTOR, operation)
