"""Feedback Mongo query shape and index regressions."""
from __future__ import annotations

import asyncio

import feedback_store


class _IndexCollection:
    def __init__(self):
        self.calls = []

    async def create_index(self, keys, **kwargs):
        self.calls.append((keys, kwargs))
        return kwargs.get("name")


def test_feedback_indexes_match_real_query_shapes():
    col = _IndexCollection()
    feedback_store._indexes_ready = False

    asyncio.run(feedback_store._ensure_indexes(col))

    names = {kwargs["name"]: keys for keys, kwargs in col.calls}
    assert names == {
        "feedback_created_desc": [("created_at", -1)],
        "feedback_username_created_desc": [("username", 1), ("created_at", -1)],
        "feedback_status": [("status", 1)],
    }


class _Cursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, *_args):
        return self

    def limit(self, *_args):
        return self

    def __aiter__(self):
        self._iter = iter(self.rows)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class _ListCollection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def find(self, query, projection=None):
        self.calls.append((query, projection))
        return _Cursor([dict(row) for row in self.rows])


def test_admin_feedback_list_excludes_binary_attachment_payload(monkeypatch):
    col = _ListCollection([{
        "_id": "f1",
        "username": "alice",
        "created_at": "2026-09-18T05:00:00+00:00",
        "attachments": [{"name": "shot.png", "mime_type": "image/png", "size": 99}],
    }])

    async def fake_collection():
        return col

    monkeypatch.setattr(feedback_store, "_get_collection", fake_collection)
    rows = asyncio.run(feedback_store.list_feedback(limit=20))

    assert col.calls == [({}, {"attachments.data": 0})]
    assert rows[0]["attachments"] == [{
        "index": 0,
        "name": "shot.png",
        "mime_type": "image/png",
        "size": 99,
    }]


def test_user_feedback_list_excludes_binary_attachment_payload(monkeypatch):
    col = _ListCollection([{
        "_id": "f2",
        "username": "alice",
        "created_at": "2026-09-18T05:00:00+00:00",
        "attachments": [],
    }])

    async def fake_collection():
        return col

    monkeypatch.setattr(feedback_store, "_get_collection", fake_collection)
    rows = asyncio.run(feedback_store.list_feedback_for_user("alice", limit=20))

    assert col.calls == [({"username": "alice"}, {"attachments.data": 0})]
    assert rows[0]["id"] == "f2"
