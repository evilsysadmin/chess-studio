"""HTTP adapter for dependency-free idempotency primitives.

The mutation policy lives in ``operation_idempotency_core`` so it can be tested
without importing FastAPI. This module only translates core validation errors
into the HTTP contract consumed by game routes.
"""
from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, Request

from operation_idempotency_core import (
    IDEMPOTENCY_KEY_RE,
    IDEMPOTENCY_NAMESPACE,
    MAX_OPERATION_LEDGER,
    IdempotencyConflict,
    InvalidIdempotencyKey,
    deterministic_game_id,
    model_fingerprint,
    normalize_idempotency_key,
    operation_fingerprint,
    operation_replay as _operation_replay,
    remember_operation,
)


def idempotency_key(request: Request) -> Optional[str]:
    try:
        return normalize_idempotency_key(request.headers.get("Idempotency-Key"))
    except InvalidIdempotencyKey as exc:
        raise HTTPException(400, str(exc)) from exc


def operation_replay(entry: dict, key: Optional[str], fingerprint: str, kind: str) -> bool:
    try:
        return _operation_replay(entry, key, fingerprint, kind)
    except IdempotencyConflict as exc:
        raise HTTPException(409, str(exc)) from exc


__all__ = [
    "IDEMPOTENCY_KEY_RE",
    "IDEMPOTENCY_NAMESPACE",
    "MAX_OPERATION_LEDGER",
    "deterministic_game_id",
    "idempotency_key",
    "model_fingerprint",
    "operation_fingerprint",
    "operation_replay",
    "remember_operation",
]
