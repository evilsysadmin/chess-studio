"""Persistencia del perfil, un documento por username autenticado."""

from typing import Optional

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "profile"
_memory_profiles: dict[str, dict] = {}


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.")
    return None


async def get_profile(username: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        try:
            doc = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc
        if doc:
            doc.pop("_id", None)
        return doc
    return _memory_profiles.get(username)


async def save_profile(username: str, data: dict) -> dict:
    # `_id` es propiedad del servidor. Aunque el endpoint acepte un dict
    # flexible para poder evolucionar el perfil sin migraciones, el cliente
    # nunca puede elegir el dueño del documento.
    safe_data = {key: value for key, value in data.items() if key != "_id"}
    col = await _get_collection()
    if col is not None:
        doc = {**safe_data, "_id": username}
        try:
            await col.replace_one({"_id": username}, doc, upsert=True)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc
    else:
        _memory_profiles[username] = safe_data
    return safe_data
