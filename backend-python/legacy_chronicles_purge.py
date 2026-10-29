"""Delete historical Chronicles saves without importing the retired game API.

This privacy cascade deliberately outlives the old /api/chronicles endpoints.
The standalone Chronicles API owns its own current saves. Do not replace this
deletion with a no-op while Chess Studio may still hold legacy documents.
"""
from __future__ import annotations

from pymongo.errors import PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required
from legacy_chronicles_memory import _memory_guard, _memory_runs


async def delete_legacy_chronicles_runs(owner: str) -> int:
    database = await get_db()
    if database is not None:
        try:
            result = await database["chronicles_runs"].delete_many({"owner": owner})
            return int(result.deleted_count)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable(
                "No se pudieron borrar las runs históricas de Chronicles."
            ) from exc
    if persistent_storage_required():
        raise PersistentStorageUnavailable(
            "MongoDB no está disponible para borrar las runs históricas de Chronicles."
        )

    # Non-persistent test/dev fallback shares only a lightweight state holder.
    # Account deletion must never import the legacy game engine or run store.
    async with _memory_guard():
        doomed = [key for key, row in _memory_runs.items() if row.get("owner") == owner]
        for key in doomed:
            _memory_runs.pop(key, None)
        return len(doomed)
