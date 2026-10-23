"""Shared in-memory historical-run registry for non-persistent development/tests.

The legacy gameplay store and the account-deletion privacy cascade must see
the SAME records and asyncio lock. Keeping this tiny module free of gameplay
imports lets account deletion outlive the old Chronicles engine.
Production uses Mongo's owner-filtered deletion, not this in-memory fallback.
"""
from __future__ import annotations

import asyncio
from typing import Any

_memory_runs: dict[str, dict[str, Any]] = {}
_memory_lock: asyncio.Lock | None = None
_memory_lock_loop = None


def _memory_guard() -> asyncio.Lock:
    global _memory_lock, _memory_lock_loop
    loop = asyncio.get_running_loop()
    if _memory_lock is None or _memory_lock_loop is not loop:
        _memory_lock = asyncio.Lock()
        _memory_lock_loop = loop
    return _memory_lock
