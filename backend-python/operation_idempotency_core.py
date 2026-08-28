"""Dependency-free idempotency primitives for retry-safe game mutations.

This module intentionally depends only on the Python standard library so local
quality gates can exercise the persistence/replay policy without importing the
FastAPI application stack. HTTP adapters live in ``operation_idempotency.py``.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from typing import Optional

IDEMPOTENCY_NAMESPACE = uuid.UUID("9d10b931-a0b6-4a59-bd1c-816b8797e474")
IDEMPOTENCY_KEY_RE = re.compile(r"^[A-Za-z0-9._:-]{8,96}$")
MAX_OPERATION_LEDGER = 16


class InvalidIdempotencyKey(ValueError):
    """Raised when a supplied Idempotency-Key violates the public contract."""


class IdempotencyConflict(ValueError):
    """Raised when an existing key is reused for different operation data."""


def normalize_idempotency_key(raw: Optional[str]) -> Optional[str]:
    if raw is None:
        return None
    key = raw.strip()
    if not IDEMPOTENCY_KEY_RE.fullmatch(key):
        raise InvalidIdempotencyKey("Idempotency-Key inválida.")
    return key


def operation_fingerprint(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def model_fingerprint(model) -> str:
    return operation_fingerprint(model.model_dump(by_alias=True, exclude_none=False))


def operation_replay(entry: dict, key: Optional[str], fingerprint: str, kind: str) -> bool:
    if not key:
        return False
    for op in reversed(entry.get("operationLedger") or []):
        if op.get("key") != key:
            continue
        if op.get("kind") != kind or op.get("fingerprint") != fingerprint:
            raise IdempotencyConflict(
                "La misma operación idempotente se reutilizó con datos distintos."
            )
        return True
    return False


def remember_operation(entry: dict, key: Optional[str], fingerprint: str, kind: str) -> None:
    if not key:
        return
    ledger = [op for op in (entry.get("operationLedger") or []) if op.get("key") != key]
    ledger.append({"key": key, "kind": kind, "fingerprint": fingerprint})
    entry["operationLedger"] = ledger[-MAX_OPERATION_LEDGER:]


def deterministic_game_id(username: str, key: str) -> str:
    return str(uuid.uuid5(IDEMPOTENCY_NAMESPACE, f"{username}:{key}"))
