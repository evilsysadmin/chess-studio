"""Legacy account-data cleanup must survive removal of Chronicles gameplay."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pymongo.errors import PyMongoError

import chronicles_run_store
import legacy_chronicles_purge as purge
from db import PersistentStorageUnavailable


def _as_async(value):
    async def result():
        return value
    return result


def test_legacy_run_purge_deletes_only_authenticated_owner_in_mongo(monkeypatch):
    queries = []

    class Collection:
        async def delete_many(self, query):
            queries.append(query)
            return SimpleNamespace(deleted_count=2)

    class Database:
        def __getitem__(self, collection):
            assert collection == "chronicles_runs"
            return Collection()

    monkeypatch.setattr(purge, "get_db", _as_async(Database()))
    assert asyncio.run(purge.delete_legacy_chronicles_runs("former-player")) == 2
    assert queries == [{"owner": "former-player"}]


def test_legacy_run_purge_fails_closed_if_required_storage_unavailable(monkeypatch):
    monkeypatch.setattr(purge, "get_db", _as_async(None))
    monkeypatch.setattr(purge, "persistent_storage_required", lambda: True)
    with pytest.raises(PersistentStorageUnavailable):
        asyncio.run(purge.delete_legacy_chronicles_runs("former-player"))


def test_legacy_run_purge_preserves_persistent_delete_errors(monkeypatch):
    class Collection:
        async def delete_many(self, _query):
            raise PyMongoError("mongo inaccessible")

    monkeypatch.setattr(purge, "get_db", _as_async({"chronicles_runs": Collection()}))
    with pytest.raises(PersistentStorageUnavailable):
        asyncio.run(purge.delete_legacy_chronicles_runs("former-player"))


def test_legacy_run_purge_keeps_memory_fallback_compatible(monkeypatch):
    monkeypatch.setattr(purge, "get_db", _as_async(None))
    monkeypatch.setattr(purge, "persistent_storage_required", lambda: False)
    ours, another = "legacy-purge-ours", "legacy-purge-other"
    chronicles_run_store._memory_runs[ours] = {"owner": "former-player"}
    chronicles_run_store._memory_runs[another] = {"owner": "someone-else"}
    try:
        assert asyncio.run(purge.delete_legacy_chronicles_runs("former-player")) == 1
        assert ours not in chronicles_run_store._memory_runs
        assert another in chronicles_run_store._memory_runs
    finally:
        chronicles_run_store._memory_runs.pop(ours, None)
        chronicles_run_store._memory_runs.pop(another, None)
