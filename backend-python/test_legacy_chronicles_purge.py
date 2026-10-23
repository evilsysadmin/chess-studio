"""Legacy account-data cleanup must survive removal of Chronicles gameplay."""
from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from pymongo.errors import PyMongoError

import legacy_chronicles_memory
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
    legacy_chronicles_memory._memory_runs[ours] = {"owner": "former-player"}
    legacy_chronicles_memory._memory_runs[another] = {"owner": "someone-else"}
    try:
        assert asyncio.run(purge.delete_legacy_chronicles_runs("former-player")) == 1
        assert ours not in legacy_chronicles_memory._memory_runs
        assert another in legacy_chronicles_memory._memory_runs
    finally:
        legacy_chronicles_memory._memory_runs.pop(ours, None)
        legacy_chronicles_memory._memory_runs.pop(another, None)


def test_memory_purge_does_not_import_legacy_game_store(monkeypatch):
    """Account deletion must remain independent if legacy runtime is retired."""
    import builtins

    original_import = builtins.__import__

    def reject_game_store(name, *args, **kwargs):
        if name == "chronicles_run_store":
            raise AssertionError("privacy purge imported retired game persistence")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(purge, "get_db", _as_async(None))
    monkeypatch.setattr(purge, "persistent_storage_required", lambda: False)
    monkeypatch.setattr(builtins, "__import__", reject_game_store)
    legacy_chronicles_memory._memory_runs["privacy-isolated"] = {"owner": "former-player"}
    try:
        assert asyncio.run(purge.delete_legacy_chronicles_runs("former-player")) == 1
        assert "privacy-isolated" not in legacy_chronicles_memory._memory_runs
    finally:
        legacy_chronicles_memory._memory_runs.pop("privacy-isolated", None)
