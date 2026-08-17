"""users_store.py — Cuentas de usuario (registro abierto: cualquiera con el
link se puede crear una). Mismo patrón de respaldo en memoria que
profile_store.py/game_store.py si Mongo no está disponible — con la
salvedad de que en memoria los usuarios no sobreviven a un reinicio del
proceso, así que en producción de verdad hace falta Mongo corriendo.
"""

from typing import Optional

from db import get_db

COLLECTION = "users"
_memory_users: dict[str, dict] = {}  # username -> {username, password_hash}


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
    doc = {"username": username, "password_hash": password_hash}
    col = await _get_collection()
    if col is not None:
        await col.insert_one({"_id": username, "password_hash": password_hash})
    else:
        _memory_users[username] = doc
    return doc
