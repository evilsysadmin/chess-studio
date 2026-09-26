"""Persisted global matchmaking tuning owned by the backend."""
from __future__ import annotations

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "runtime_settings"
MATCHMAKING_ID = "matchmaking"
DEFAULT_TARGET_LEAD_ELO = 50
MIN_TARGET_LEAD_ELO = 0
MAX_TARGET_LEAD_ELO = 150
_memory_settings = {
    MATCHMAKING_ID: {"targetLeadElo": DEFAULT_TARGET_LEAD_ELO},
}


def normalize_target_lead_elo(value) -> int:
    try:
        numeric = int(round(float(value)))
    except (TypeError, ValueError):
        numeric = DEFAULT_TARGET_LEAD_ELO
    return max(MIN_TARGET_LEAD_ELO, min(MAX_TARGET_LEAD_ELO, numeric))


async def _collection():
    database = await get_db()
    if database is not None:
        return database[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para ajustes de matchmaking.")
    return None


async def get_matchmaking_settings() -> dict:
    col = await _collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": MATCHMAKING_ID})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para leer ajustes de matchmaking.") from exc
        value = (row or {}).get("targetLeadElo", DEFAULT_TARGET_LEAD_ELO)
    else:
        value = _memory_settings[MATCHMAKING_ID]["targetLeadElo"]
    return {"targetLeadElo": normalize_target_lead_elo(value)}


async def set_matchmaking_target_lead_elo(value) -> dict:
    target = normalize_target_lead_elo(value)
    col = await _collection()
    if col is not None:
        try:
            await col.update_one(
                {"_id": MATCHMAKING_ID},
                {"$set": {"targetLeadElo": target}},
                upsert=True,
            )
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para guardar ajustes de matchmaking.") from exc
    else:
        _memory_settings[MATCHMAKING_ID] = {"targetLeadElo": target}
    return {"targetLeadElo": target}
