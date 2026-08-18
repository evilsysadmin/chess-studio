"""users_store.py — Cuentas de usuario (registro abierto: cualquiera con el
link se puede crear una). Mismo patrón de respaldo en memoria que
profile_store.py/game_store.py si Mongo no está disponible — con la
salvedad de que en memoria los usuarios no sobreviven a un reinicio del
proceso, así que en producción de verdad hace falta Mongo corriendo.
"""

from datetime import datetime, timezone
from typing import Optional

from db import get_db

COLLECTION = "users"
_memory_users: dict[str, dict] = {}  # username -> {username, password_hash, created_at}


async def _get_collection():
    db = await get_db()
    return db[COLLECTION] if db is not None else None


async def get_user(username: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        doc = await col.find_one({"_id": username})
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
        await col.insert_one({"_id": username, "password_hash": password_hash, "created_at": created_at})
    else:
        _memory_users[username] = doc
    return doc


async def list_usernames() -> list[str]:
    """Todos los usuarios registrados — para el panel de administración
    nada más (`is_admin`), no se expone en ninguna ruta pública."""
    col = await _get_collection()
    if col is not None:
        cursor = col.find({}, {"_id": 1})
        return [doc["_id"] async for doc in cursor]
    return list(_memory_users.keys())
