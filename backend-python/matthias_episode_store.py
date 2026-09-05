"""Persistence adapter for Matthias episodic memory.

This deliberately writes into the existing ``matthias_memory`` user document.
There is no second memory collection and no independent reset lifecycle.
"""
from __future__ import annotations

from typing import Any

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable
import matthias_episodes as episodes
import matthias_memory_store as memory_store

EPISODIC_SNAPSHOT_FIELD = "episodic_snapshot"
EPISODES_FIELD = "episodes"


def _projection() -> dict[str, int]:
    return {EPISODIC_SNAPSHOT_FIELD: 1, EPISODES_FIELD: 1}


def _next_state(row: dict[str, Any] | None, facts: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    row = row if isinstance(row, dict) else {}
    previous = row.get(EPISODIC_SNAPSHOT_FIELD) if isinstance(row.get(EPISODIC_SNAPSHOT_FIELD), dict) else None
    existing = episodes.merge_episodes(row.get(EPISODES_FIELD), [])
    if previous is None:
        # The first observation establishes a baseline. Existing aggregate
        # counts have no trustworthy occurrence time, so they do not become
        # fake "recent" memories.
        snapshot = episodes.episodic_observation_snapshot(facts)
        return existing, snapshot, []
    created, snapshot = episodes.derive_episodes(previous, facts)
    return episodes.merge_episodes(existing, created), snapshot, created


async def observe(username: str, facts: dict[str, Any]) -> dict[str, Any]:
    if not username or not isinstance(facts, dict):
        return {"created": [], "callbacks": [], "episodeCount": 0}
    col = await memory_store._collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}, _projection()) or {}
            merged, snapshot, created = _next_state(row, facts)
            await col.update_one(
                {"_id": username},
                {
                    "$set": {
                        EPISODIC_SNAPSHOT_FIELD: snapshot,
                        EPISODES_FIELD: merged,
                    },
                    "$setOnInsert": {
                        "created_at": memory_store._now_iso(),
                        "consultation_count": 0,
                    },
                },
                upsert=True,
            )
            return {
                "created": created,
                "callbacks": episodes.eligible_callbacks(merged),
                "episodeCount": len(merged),
            }
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo actualizar la memoria episódica de Matthias.") from exc

    async with memory_store._memory_lock:
        row = memory_store._memory.setdefault(
            username,
            {"_id": username, "consultation_count": 0, "created_at": memory_store._now_iso()},
        )
        merged, snapshot, created = _next_state(row, facts)
        row[EPISODIC_SNAPSHOT_FIELD] = snapshot
        row[EPISODES_FIELD] = merged
        return {
            "created": created,
            "callbacks": episodes.eligible_callbacks(merged),
            "episodeCount": len(merged),
        }


async def context(username: str) -> dict[str, Any]:
    if not username:
        return {"episode_count": 0, "callback_candidates": []}
    col = await memory_store._collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}, {EPISODES_FIELD: 1}) or {}
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo leer la memoria episódica de Matthias.") from exc
    else:
        row = memory_store._memory.get(username) or {}
    merged = episodes.merge_episodes(row.get(EPISODES_FIELD), [])
    return {
        "episode_count": len(merged),
        # The narrative layer receives only the tiny eligible set, not the
        # entire biography. Silence is valid when nothing passes the gate.
        "callback_candidates": episodes.eligible_callbacks(merged),
    }


async def summary(username: str) -> dict[str, Any]:
    if not username:
        return {"episodeCount": 0, "recentEpisodes": [], "callbackCandidates": []}
    col = await memory_store._collection()
    if col is not None:
        try:
            row = await col.find_one({"_id": username}, {EPISODES_FIELD: 1}) or {}
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudo resumir la memoria episódica de Matthias.") from exc
    else:
        row = memory_store._memory.get(username) or {}
    merged = episodes.merge_episodes(row.get(EPISODES_FIELD), [])
    return {
        "episodeCount": len(merged),
        "recentEpisodes": merged[-5:],
        "callbackCandidates": episodes.eligible_callbacks(merged),
    }
