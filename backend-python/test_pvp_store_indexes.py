"""Mongo-specific invariants for War Room PvP persistence."""
from __future__ import annotations

import asyncio

from pymongo.errors import DuplicateKeyError

import pvp_store


class _IndexCollection:
    def __init__(self):
        self.calls = []

    async def create_index(self, keys, **kwargs):
        self.calls.append((keys, kwargs))
        return kwargs.get("name")


def test_pvp_indexes_include_pending_pair_uniqueness_and_hot_queries():
    roster = _IndexCollection()
    challenges = _IndexCollection()
    matches = _IndexCollection()
    pvp_store._indexes_ready = False
    pvp_store._index_lock = None
    pvp_store._index_lock_loop = None

    asyncio.run(pvp_store._ensure_indexes(roster, challenges, matches))

    assert roster.calls == [
        ("last_seen", {
            "expireAfterSeconds": pvp_store.ROSTER_TTL_SECONDS,
            "name": "pvp_roster_last_seen_ttl",
        })
    ]
    names = {kwargs["name"]: (keys, kwargs) for keys, kwargs in challenges.calls + matches.calls}
    unique_keys, unique_kwargs = names["pvp_pending_pair_unique"]
    assert unique_keys == [("pair_key", 1)]
    assert unique_kwargs["unique"] is True
    assert unique_kwargs["partialFilterExpression"] == {
        "status": "pending",
        "pair_key": {"$type": "string"},
    }
    assert "pvp_challenger_status_created" in names
    assert "pvp_opponent_status_created" in names
    assert "pvp_white_status_updated" in names
    assert "pvp_black_status_updated" in names


def test_pair_key_is_unordered_and_distinguishes_pairs():
    assert pvp_store._challenge_pair_key("alice", "bob") == pvp_store._challenge_pair_key("bob", "alice")
    assert pvp_store._challenge_pair_key("alice", "bob") != pvp_store._challenge_pair_key("alice", "carol")


def test_duplicate_pending_challenge_race_reuses_unique_index_winner(monkeypatch):
    now = pvp_store.utcnow()
    pair_key = pvp_store._challenge_pair_key("alice", "bob")

    class _Challenges:
        def __init__(self):
            self.find_calls = 0
            self.insert_calls = 0

        async def find_one(self, query):
            self.find_calls += 1
            if self.find_calls == 1:
                return None
            assert query == {"status": "pending", "pair_key": pair_key}
            return {
                "_id": "winner",
                "challenger": "bob",
                "opponent": "alice",
                "status": "pending",
                "created_at": now,
                "pair_key": pair_key,
            }

        async def insert_one(self, _doc):
            self.insert_calls += 1
            raise DuplicateKeyError("simulated concurrent winner")

    challenges = _Challenges()

    async def fake_collections():
        return object(), challenges, object()

    monkeypatch.setattr(pvp_store, "_collections", fake_collections)

    result = asyncio.run(pvp_store.create_challenge({
        "id": "loser",
        "challenger": "alice",
        "opponent": "bob",
        "status": "pending",
        "created_at": now,
    }))

    assert challenges.insert_calls == 1
    assert result["id"] == "winner"
    assert "pair_key" not in result
