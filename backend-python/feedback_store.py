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


def _public_feedback(row: dict) -> dict:
    public = dict(row or {})
    attachments = []
    for index, item in enumerate(public.get("attachments") or []):
        attachments.append({
            "index": index,
            "name": item.get("name") or f"captura-{index + 1}",
            "mime_type": item.get("mime_type") or "application/octet-stream",
            "size": int(item.get("size") or len(item.get("data") or b"")),
        })
    public["attachments"] = attachments
    return public


async def create_feedback(*, username: str, category: str, message: str, context: str | None = None, attachments: list[dict] | None = None) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    feedback_id = uuid.uuid4().hex
    doc = {
        "id": feedback_id,
        "username": username,
        "category": category,
        "message": message,
        "context": context or "Home",
        "attachments": list(attachments or []),
        "status": "new",
        "admin_reply": None,
        "replied_at": None,
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
    return _public_feedback(doc)


async def list_feedback(*, limit: int = 100) -> list[dict]:
    safe_limit = max(1, min(int(limit), 250))
    col = await _get_collection()
    if col is not None:
        try:
            cursor = col.find({}).sort("created_at", -1).limit(safe_limit)
            result = []
            async for row in cursor:
                result.append(_public_feedback({
                    "id": str(row.pop("_id")),
                    **row,
                }))
            return result
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para leer feedback.") from exc
    return [_public_feedback(row) for row in sorted(_memory_feedback.values(), key=lambda row: row.get("created_at", ""), reverse=True)[:safe_limit]]


async def feedback_summary() -> dict[str, int]:
    col = await _get_collection()
    if col is not None:
        try:
            new_count = int(await col.count_documents({"status": "new"}))
            pending_count = int(await col.count_documents({"status": {"$ne": "resolved"}}))
            return {"newCount": new_count, "pendingCount": pending_count}
        except (AttributeError, TypeError):
            # Dobles de colección mínimos en tests pueden no implementar count_documents.
            rows = await list_feedback(limit=250)
            return {
                "newCount": sum(1 for row in rows if row.get("status") == "new"),
                "pendingCount": sum(1 for row in rows if row.get("status") != "resolved"),
            }
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para resumir feedback.") from exc
    rows = list(_memory_feedback.values())
    return {
        "newCount": sum(1 for row in rows if row.get("status") == "new"),
        "pendingCount": sum(1 for row in rows if row.get("status") != "resolved"),
    }


async def list_feedback_for_user(username: str, *, limit: int = 20) -> list[dict]:
    safe_limit = max(1, min(int(limit), 50))
    col = await _get_collection()
    if col is not None:
        try:
            cursor = col.find({"username": username}).sort("created_at", -1).limit(safe_limit)
            result = []
            async for row in cursor:
                result.append(_public_feedback({"id": str(row.pop("_id")), **row}))
            return result
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para leer tu feedback.") from exc
    rows = [row for row in _memory_feedback.values() if row.get("username") == username]
    return [_public_feedback(row) for row in sorted(rows, key=lambda row: row.get("created_at", ""), reverse=True)[:safe_limit]]


async def reply_to_feedback(feedback_id: str, message: str, *, resolve: bool = True) -> dict | None:
    now = datetime.now(timezone.utc).isoformat()
    clean = str(message or "").strip()[:1000]
    if not clean:
        raise ValueError("La respuesta no puede estar vacía.")
    fields = {
        "admin_reply": clean,
        "replied_at": now,
        "updated_at": now,
    }
    if resolve:
        fields["status"] = "resolved"
    col = await _get_collection()
    if col is not None:
        try:
            row = await col.find_one_and_update(
                {"_id": feedback_id},
                {"$set": fields},
                return_document=True,
            )
        except TypeError:
            try:
                await col.update_one({"_id": feedback_id}, {"$set": fields})
                row = await col.find_one({"_id": feedback_id})
            except PyMongoError as exc:
                raise PersistentStorageUnavailable("MongoDB no está disponible para responder al feedback.") from exc
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para responder al feedback.") from exc
        if not row:
            return None
        return _public_feedback({"id": str(row.pop("_id")), **row})

    row = _memory_feedback.get(feedback_id)
    if not row:
        return None
    row = {**row, **fields}
    _memory_feedback[feedback_id] = row
    return _public_feedback(row)


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
        return _public_feedback({"id": str(row.pop("_id")), **row})

    row = _memory_feedback.get(feedback_id)
    if not row:
        return None
    row = {**row, "status": status, "updated_at": now}
    _memory_feedback[feedback_id] = row
    return _public_feedback(row)


async def delete_feedback_for_user(feedback_id: str, username: str) -> bool:
    col = await _get_collection()
    if col is not None:
        try:
            # Propietario e id se validan en la misma operación. Devolver False
            # tanto para id inexistente como para propietario distinto evita que
            # este endpoint pueda usarse para enumerar feedback de otra cuenta.
            result = await col.delete_one({"_id": feedback_id, "username": username})
            return bool(getattr(result, "deleted_count", 0))
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para borrar tu feedback.") from exc

    row = _memory_feedback.get(feedback_id)
    if not row or row.get("username") != username:
        return False
    _memory_feedback.pop(feedback_id, None)
    return True


async def delete_feedback(feedback_id: str) -> bool:
    col = await _get_collection()
    if col is not None:
        try:
            result = await col.delete_one({"_id": feedback_id})
            return bool(getattr(result, "deleted_count", 0))
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para borrar feedback.") from exc
    return _memory_feedback.pop(feedback_id, None) is not None


async def get_feedback_attachment(feedback_id: str, index: int) -> dict | None:
    if index < 0:
        return None
    col = await _get_collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": feedback_id}, {"attachments": 1})
        except TypeError:
            row = await col.find_one({"_id": feedback_id})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para leer el adjunto de feedback.") from exc
    else:
        row = _memory_feedback.get(feedback_id)
    attachments = (row or {}).get("attachments") or []
    if index >= len(attachments):
        return None
    item = attachments[index]
    data = item.get("data") or b""
    if not isinstance(data, (bytes, bytearray)):
        data = bytes(data)
    return {
        "name": item.get("name") or f"captura-{index + 1}",
        "mime_type": item.get("mime_type") or "application/octet-stream",
        "size": int(item.get("size") or len(data)),
        "data": bytes(data),
    }
