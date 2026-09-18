"""Authoritative persistence for Chronicles runs.

Chronicles keeps frame-critical simulation in the browser. This store owns the
stable identity and world-binding metadata that must survive retries/reloads and
must never be trusted solely to client storage.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required


COLLECTION = "chronicles_runs"
_memory_runs: dict[str, dict[str, Any]] = {}
_memory_lock: asyncio.Lock | None = None
_memory_lock_loop = None


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _memory_guard() -> asyncio.Lock:
    global _memory_lock, _memory_lock_loop
    loop = asyncio.get_running_loop()
    if _memory_lock is None or _memory_lock_loop is not loop:
        _memory_lock = asyncio.Lock()
        _memory_lock_loop = loop
    return _memory_lock


async def _collection():
    database = await get_db()
    if database is not None:
        return database[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para Chronicles.")
    return None


def _public(row: dict[str, Any] | None) -> dict[str, Any] | None:
    if not row:
        return None
    route_map_ids = list(row.get("routeMapIds") or [])
    route = None
    if route_map_ids:
        route = {
            "policyVersion": int(row.get("routePolicyVersion", 0)),
            "mapIds": route_map_ids,
            "primaryExitIds": dict(row.get("routePrimaryExitIds") or {}),
        }
    payload = {
        "runId": str(row.get("_id") or row.get("runId")),
        "seed": int(row["seed"]),
        "currentMapId": row["currentMapId"],
        "contentVersion": int(row["contentVersion"]),
        "manifestRevision": row["manifestRevision"],
        "status": row.get("status", "active"),
        "worldVersion": int(row.get("worldVersion", 0)),
        "consumedContentIds": list(row.get("consumedContentIds") or []),
        "claimedRewards": list(row.get("claimedRewards") or []),
        "createdAt": row.get("createdAt"),
        "updatedAt": row.get("updatedAt"),
    }
    if route is not None:
        payload["route"] = route
    return payload


async def create_or_replay_run(
    *,
    run_id: str,
    owner: str,
    seed: int,
    map_id: str,
    content_version: int,
    manifest_revision: str,
    create_fingerprint: str,
    route_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = utcnow()
    document = {
        "_id": run_id,
        "owner": owner,
        "seed": int(seed),
        "currentMapId": map_id,
        "contentVersion": int(content_version),
        "manifestRevision": manifest_revision,
        "status": "active",
        "worldVersion": 0,
        "consumedContentIds": [],
        "claimedRewards": [],
        "createdAt": now,
        "updatedAt": now,
        "createFingerprint": create_fingerprint,
    }
    if route_snapshot is not None:
        document["routePolicyVersion"] = int(route_snapshot["policyVersion"])
        document["routeMapIds"] = list(route_snapshot["mapIds"])
        document["routePrimaryExitIds"] = dict(route_snapshot["primaryExitIds"])
    collection = await _collection()
    if collection is None:
        async with _memory_guard():
            existing = _memory_runs.get(run_id)
            if existing is not None:
                if existing.get("owner") != owner or existing.get("createFingerprint") != create_fingerprint:
                    raise ValueError("idempotency-conflict")
                return _public(existing) or {}
            _memory_runs[run_id] = document
            return _public(document) or {}

    try:
        await collection.update_one(
            {"_id": run_id},
            {"$setOnInsert": document},
            upsert=True,
        )
        stored = await collection.find_one({"_id": run_id})
        if not stored or stored.get("owner") != owner or stored.get("createFingerprint") != create_fingerprint:
            raise ValueError("idempotency-conflict")
        return _public(stored) or {}
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo crear la run de Chronicles.") from exc


async def get_run(run_id: str, owner: str) -> dict[str, Any] | None:
    collection = await _collection()
    if collection is None:
        async with _memory_guard():
            row = _memory_runs.get(run_id)
            if not row or row.get("owner") != owner:
                return None
            return _public(row)
    try:
        return _public(await collection.find_one({"_id": run_id, "owner": owner}))
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo cargar la run de Chronicles.") from exc


async def delete_user_runs(owner: str) -> int:
    collection = await _collection()
    if collection is None:
        async with _memory_guard():
            doomed = [run_id for run_id, row in _memory_runs.items() if row.get("owner") == owner]
            for run_id in doomed:
                _memory_runs.pop(run_id, None)
            return len(doomed)
    try:
        result = await collection.delete_many({"owner": owner})
        return int(result.deleted_count)
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudieron borrar las runs de Chronicles.") from exc
