"""game_store.py — Almacenamiento de las partidas activas ("savegames").

Se guarda la lista de jugadas en SAN (no el FEN): el FEN solo describe la
posición actual, no cómo se llegó a ella, así que no sirve para reconstruir
el historial completo (necesario para el botón de deshacer y el cuaderno de
jugadas). Cada handler reconstruye el tablero reproduciendo las jugadas
guardadas.
"""

from datetime import datetime, timezone
from typing import Optional

from db import get_db

COLLECTION = "games"
_memory_store: dict[str, dict] = {}


async def _get_collection():
    db = await get_db()
    return db[COLLECTION] if db is not None else None


async def create_game(game_id: str, data: dict) -> dict:
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    col = await _get_collection()
    if col is not None:
        await col.insert_one(doc)
    else:
        _memory_store[game_id] = doc
    return doc


async def get_game(game_id: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        return await col.find_one({"_id": game_id})
    return _memory_store.get(game_id)


async def update_game(game_id: str, data: dict) -> dict:
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    col = await _get_collection()
    if col is not None:
        await col.replace_one({"_id": game_id}, doc, upsert=True)
    else:
        _memory_store[game_id] = doc
    return doc


async def delete_game(game_id: str) -> bool:
    col = await _get_collection()
    if col is not None:
        result = await col.delete_one({"_id": game_id})
        return result.deleted_count > 0
    if game_id in _memory_store:
        del _memory_store[game_id]
        return True
    return False
