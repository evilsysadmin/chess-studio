"""Server-side one-a-day ledger for Matthias consultations.

The daily audience is reserved atomically before calling Workers AI.  A failed
provider call releases the reservation, so failure does not consume the day;
two tabs cannot spend two Cloudflare calls for the same user/day.
"""
from __future__ import annotations

import asyncio
import secrets
from datetime import datetime
from zoneinfo import ZoneInfo

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "matthias_daily"
_memory: dict[str, dict] = {}
_memory_lock = asyncio.Lock()


def madrid_day() -> str:
    return datetime.now(ZoneInfo("Europe/Madrid")).date().isoformat()


async def _collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para la consulta diaria de Matthias.")
    return None


def _public_status(row: dict | None, day: str) -> dict:
    same_day = bool(row and row.get("day") == day)
    used = bool(same_day and row.get("state") == "used")
    pending = bool(same_day and row.get("state") == "pending")
    return {
        "day": day,
        "used": used,
        "pending": pending,
        "questionKind": row.get("question_kind") if used else None,
        "text": row.get("text") if used else None,
    }


async def status(username: str) -> dict:
    day = madrid_day()
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer la consulta diaria de Matthias.") from exc
    else:
        row = _memory.get(username)
    return _public_status(row, day)


async def reserve(username: str) -> dict:
    """Reserve today's audience exactly once and return an opaque claim token."""
    day = madrid_day()
    token = secrets.token_urlsafe(18)
    doc = {"day": day, "state": "pending", "reservation": token, "question_kind": None, "text": None}
    col = await _collection()
    if col is not None:
        try:
            result = await col.update_one(
                {"_id": username, "day": {"$ne": day}},
                {"$set": doc, "$setOnInsert": {"_id": username}},
                upsert=True,
            )
            if not (result.matched_count or result.upserted_id is not None):
                return {"claimed": False, **await status(username)}
        except DuplicateKeyError:
            # Existing _id for the same day lost the upsert race: another tab won.
            return {"claimed": False, **await status(username)}
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo reservar la consulta diaria de Matthias.") from exc
    else:
        async with _memory_lock:
            row = _memory.get(username)
            if row and row.get("day") == day:
                return {"claimed": False, **_public_status(row, day)}
            _memory[username] = {"_id": username, **doc}
    return {"claimed": True, "day": day, "reservation": token, "used": False, "pending": True}


async def release(username: str, reservation: str) -> None:
    """Release only our still-pending reservation; never erase a committed answer."""
    day = madrid_day()
    col = await _collection()
    if col is not None:
        try:
            await col.delete_one({"_id": username, "day": day, "state": "pending", "reservation": reservation})
        except PyMongoError:
            # Provider failure must remain fail-open; a stale pending reservation is
            # preferable to accidentally deleting a committed answer.
            return
    else:
        async with _memory_lock:
            row = _memory.get(username)
            if row and row.get("day") == day and row.get("state") == "pending" and row.get("reservation") == reservation:
                _memory.pop(username, None)


async def commit(username: str, reservation: str, question_kind: str, text: str) -> dict:
    day = madrid_day()
    update = {
        "state": "used",
        "question_kind": question_kind,
        "text": str(text or "")[:900],
        "reservation": None,
    }
    col = await _collection()
    if col is not None:
        try:
            result = await col.update_one(
                {"_id": username, "day": day, "state": "pending", "reservation": reservation},
                {"$set": update},
            )
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo guardar la consulta diaria de Matthias.") from exc
        if result.matched_count != 1:
            raise PersistentStorageUnavailable("La reserva diaria de Matthias dejó de ser válida antes de guardar la respuesta.")
    else:
        async with _memory_lock:
            row = _memory.get(username)
            if not row or row.get("day") != day or row.get("state") != "pending" or row.get("reservation") != reservation:
                raise PersistentStorageUnavailable("La reserva diaria de Matthias dejó de ser válida antes de guardar la respuesta.")
            row.update(update)
    return {"day": day, "used": True, "pending": False, "questionKind": question_kind, "text": update["text"]}
