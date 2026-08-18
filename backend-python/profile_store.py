"""profile_store.py — Guarda el perfil de cada usuario (torneo, ejército de
combate, rating, logros...) en Mongo, un documento por usuario (antes de
la cuenta de usuarios, era un único documento fijo compartido por
cualquiera que corriera la app — con cuentas, cada quien tiene el suyo).
Mismo patrón de respaldo en memoria que game_store.py si Mongo no está
disponible.

El backend no necesita entender la FORMA de este JSON — es un passthrough
puro. La forma la define el frontend (`profileBackup.js`, la misma que ya
usa para exportar/importar a un archivo): acá solo se guarda y se devuelve
tal cual, bajo la clave del usuario dueño.
"""

from typing import Optional

from db import get_db

COLLECTION = "profile"
_memory_profiles: dict[str, dict] = {}


async def _get_collection():
    db = await get_db()
    return db[COLLECTION] if db is not None else None


async def get_profile(username: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        doc = await col.find_one({"_id": username})
        if doc:
            doc.pop("_id", None)
        return doc
    return _memory_profiles.get(username)


async def save_profile(username: str, data: dict) -> dict:
    col = await _get_collection()
    if col is not None:
        doc = {"_id": username, **data}
        await col.replace_one({"_id": username}, doc, upsert=True)
    else:
        _memory_profiles[username] = data
    return data


async def delete_profile(username: str) -> None:
    col = await _get_collection()
    if col is not None:
        await col.delete_one({"_id": username})
    else:
        _memory_profiles.pop(username, None)
