"""Persistencia de cuentas de usuario."""

from datetime import datetime, timezone
from typing import Optional

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "users"
_memory_users: dict[str, dict] = {}


class UserAlreadyExists(RuntimeError):
    """La creación perdió una carrera contra otro registro del mismo username."""


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.")
    return None


async def get_user(username: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        try:
            doc = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        if doc:
            doc.pop("_id", None)
            doc["username"] = username
        return doc
    return _memory_users.get(username)


async def create_user(username: str, password_hash: str) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    doc = {"username": username, "password_hash": password_hash, "created_at": created_at}
    col = await _get_collection()
    if col is not None:
        try:
            await col.insert_one({"_id": username, "password_hash": password_hash, "created_at": created_at})
        except DuplicateKeyError as exc:
            # El GET previo del endpoint evita el caso normal, pero dos POST
            # simultáneos todavía pueden llegar al INSERT. Eso es un 409 de
            # negocio, no una falsa caída de Mongo.
            raise UserAlreadyExists(username) from exc
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
    else:
        _memory_users[username] = doc
    return doc


async def list_usernames() -> list[str]:
    col = await _get_collection()
    if col is not None:
        try:
            cursor = col.find({}, {"_id": 1})
            return [doc["_id"] async for doc in cursor]
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
    return list(_memory_users.keys())
