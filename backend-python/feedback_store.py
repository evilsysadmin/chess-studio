"""Persistencia simple del feedback enviado desde la aplicación."""

from __future__ import annotations

from datetime import datetime, timezone
import uuid

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "feedback"
_memory_feedback: dict[str, dict] = {}


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para feedback.")
    return None


async def create_feedback(*, username: str, category: str, message: str, context: str | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    feedback_id = uuid.uuid4().hex
    doc = {
        "id": feedback_id,
        "username": username,
        "category": category,
        "message": message,
        "context": context or "Home",
        "status": "new",
        "created_at": now,
        "updated_at": now,
    }
    col = await _get_collection()
    if col is not None:
        try:
            await col.insert_one({"_id": feedback_id, **{k: v for k, v in doc.items() if k != "id"}})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para guardar feedback.") from exc
    else:
        _memory_feedback[feedback_id] = dict(doc)
    return doc


async def list_feedback(*, limit: int = 100) -> list[dict]:
    safe_limit = max(1, min(int(limit), 250))
    col = await _get_collection()
    if col is not None:
        try:
            cursor = col.find({}).sort("created_at", -1).limit(safe_limit)
            result = []
            async for row in cursor:
                result.append({
                    "id": str(row.pop("_id")),
                    **row,
                })
            return result
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para leer feedback.") from exc
    return sorted(_memory_feedback.values(), key=lambda row: row.get("created_at", ""), reverse=True)[:safe_limit]


async def update_feedback_status(feedback_id: str, status: str) -> dict | None:
    now = datetime.now(timezone.utc).isoformat()
    col = await _get_collection()
    if col is not None:
        try:
            row = await col.find_one_and_update(
                {"_id": feedback_id},
                {"$set": {"status": status, "updated_at": now}},
                return_document=True,
            )
        except TypeError:
            # Compatibilidad con dobles/fakes mínimos de colección en tests.
            try:
                await col.update_one({"_id": feedback_id}, {"$set": {"status": status, "updated_at": now}})
                row = await col.find_one({"_id": feedback_id})
            except PyMongoError as exc:
                raise PersistentStorageUnavailable("MongoDB no está disponible para actualizar feedback.") from exc
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para actualizar feedback.") from exc
        if not row:
            return None
        return {"id": str(row.pop("_id")), **row}

    row = _memory_feedback.get(feedback_id)
    if not row:
        return None
    row = {**row, "status": status, "updated_at": now}
    _memory_feedback[feedback_id] = row
    return dict(row)
