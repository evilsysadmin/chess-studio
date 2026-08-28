"""game_store.py — Almacenamiento de las partidas activas ("savegames").

Se guarda la lista de jugadas en SAN (no el FEN): el FEN solo describe la
posición actual, no cómo se llegó a ella, así que no sirve para reconstruir
el historial completo (necesario para el botón de deshacer y el cuaderno de
jugadas). Cada handler reconstruye el tablero reproduciendo las jugadas
guardadas.
"""

from copy import deepcopy
from datetime import datetime, timezone
from typing import Optional

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "games"
_memory_store: dict[str, dict] = {}


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.")
    return None


async def create_game(game_id: str, data: dict) -> dict:
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    col = await _get_collection()
    if col is not None:
        try:
            await col.insert_one(doc)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc
    else:
        _memory_store[game_id] = deepcopy(doc)
    return deepcopy(doc)


async def create_game_once(game_id: str, data: dict) -> tuple[dict, bool]:
    """Create a game exactly once for an idempotent client operation.

    Returns ``(document, created)``. Concurrent retries use the same deterministic
    game id; the loser of the insert race reads the winner instead of creating a
    second savegame.
    """
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    col = await _get_collection()
    if col is not None:
        try:
            await col.insert_one(doc)
            return deepcopy(doc), True
        except DuplicateKeyError:
            try:
                existing = await col.find_one({"_id": game_id})
            except PyMongoError as exc:
                raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc
            if existing is not None:
                return deepcopy(existing), False
            raise PersistentStorageUnavailable("La creación idempotente no pudo recuperar la partida concurrente.")
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc

    existing = _memory_store.get(game_id)
    if existing is not None:
        return deepcopy(existing), False
    _memory_store[game_id] = deepcopy(doc)
    return deepcopy(doc), True


async def get_game(game_id: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        try:
            return await col.find_one({"_id": game_id})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc
    row = _memory_store.get(game_id)
    return deepcopy(row) if row is not None else None


async def update_game(game_id: str, data: dict) -> dict:
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    col = await _get_collection()
    if col is not None:
        try:
            await col.replace_one({"_id": game_id}, doc, upsert=True)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc
    else:
        _memory_store[game_id] = deepcopy(doc)
    return deepcopy(doc)


async def update_game_if_moves(game_id: str, data: dict, expected_moves: list[str]) -> bool:
    """CAS ligero para mutaciones de partida.

    Dos requests de move/undo pueden leer la misma posición casi a la vez. La
    primera que persiste gana; la segunda sólo escribe si el historial SAN
    sigue siendo exactamente el que leyó. Evita doble movimiento, undo contra
    estado viejo y pérdida silenciosa de actualizaciones.
    """
    doc = {"_id": game_id, **data, "updatedAt": datetime.now(timezone.utc)}
    expected = list(expected_moves or [])
    col = await _get_collection()
    if col is not None:
        try:
            result = await col.replace_one({"_id": game_id, "moves": expected}, doc, upsert=False)
            return bool(result.matched_count)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc

    current = _memory_store.get(game_id)
    if current is None or list(current.get("moves") or []) != expected:
        return False
    _memory_store[game_id] = deepcopy(doc)
    return True


async def delete_game(game_id: str) -> bool:
    col = await _get_collection()
    if col is not None:
        try:
            result = await col.delete_one({"_id": game_id})
            return result.deleted_count > 0
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc
    if game_id in _memory_store:
        del _memory_store[game_id]
        return True
    return False


async def delete_games_by_owner(username: str) -> int:
    """Elimina savegames activos de una cuenta borrada."""
    col = await _get_collection()
    if col is not None:
        try:
            result = await col.delete_many({"owner": username})
            return int(result.deleted_count)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para partidas.") from exc

    owned = [game_id for game_id, doc in _memory_store.items() if doc.get("owner") == username]
    for game_id in owned:
        _memory_store.pop(game_id, None)
    return len(owned)
