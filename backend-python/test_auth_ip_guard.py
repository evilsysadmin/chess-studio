from datetime import datetime, timedelta, timezone
import asyncio

import pytest

import auth_ip_guard as guard


def setup_function():
    guard._memory.clear()
    guard._blocked_cache.clear()


def test_ip_key_is_normalized_keyed_and_does_not_store_ip():
    first = guard.ip_key("2001:0db8:0:0:0:0:0:1", "secret-a")
    second = guard.ip_key("2001:db8::1", "secret-a")
    other_secret = guard.ip_key("2001:db8::1", "secret-b")

    assert first == second
    assert first != other_secret
    assert len(first) == 32
    assert "2001" not in first


def test_ip_key_rejects_invalid_addresses():
    with pytest.raises(ValueError):
        guard.ip_key("not-an-ip", "secret")


def test_tenth_failure_blocks_ip_for_fifteen_minutes():
    now = datetime(2026, 9, 21, 5, 0, tzinfo=timezone.utc)
    state = None
    for offset in range(guard.FAILURE_LIMIT):
        state = guard.state_after_failure(state, now=now + timedelta(seconds=offset))

    assert state["failures"] == guard.FAILURE_LIMIT
    retry = guard.retry_after_seconds(
        state,
        now=now + timedelta(seconds=guard.FAILURE_LIMIT - 1),
    )
    assert guard.BLOCK_SECONDS - 1 <= retry <= guard.BLOCK_SECONDS


def test_expired_window_starts_a_fresh_failure_count():
    now = datetime(2026, 9, 21, 5, 0, tzinfo=timezone.utc)
    expired = {
        "window_started_at": now - timedelta(seconds=guard.WINDOW_SECONDS + 1),
        "failures": guard.FAILURE_LIMIT - 1,
        "blocked_until": None,
        "updated_at": now - timedelta(seconds=guard.WINDOW_SECONDS + 1),
    }

    next_state = guard.state_after_failure(expired, now=now)
    assert next_state["failures"] == 1
    assert next_state["window_started_at"] == now
    assert next_state["blocked_until"] is None


def test_memory_guard_blocks_without_success_reset(monkeypatch):
    async def no_collection():
        return None

    monkeypatch.setattr(guard, "_get_collection", no_collection)
    identity = guard.ip_key("203.0.113.8", "secret")

    for _ in range(guard.FAILURE_LIMIT):
        asyncio.run(guard.record_failure(identity))

    assert asyncio.run(guard.retry_after(identity)) > 0
    assert identity in guard._memory


def test_active_mongo_ban_is_cached_per_process(monkeypatch):
    blocked_until = datetime.now(timezone.utc) + timedelta(seconds=90)

    class FakeCollection:
        def __init__(self):
            self.find_calls = 0

        async def find_one(self, *_args, **_kwargs):
            self.find_calls += 1
            return {"blocked_until": blocked_until}

    collection = FakeCollection()

    async def fake_collection():
        return collection

    async def no_index(_collection):
        return None

    monkeypatch.setattr(guard, "_get_collection", fake_collection)
    monkeypatch.setattr(guard, "_ensure_index", no_index)

    identity = guard.ip_key("203.0.113.44", "secret")
    assert asyncio.run(guard.retry_after(identity)) > 0
    assert asyncio.run(guard.retry_after(identity)) > 0
    assert collection.find_calls == 1


def test_active_block_cache_is_bounded():
    now = datetime.now(timezone.utc)
    for offset in range(guard.BLOCK_CACHE_LIMIT + 50):
        guard._remember_active_block(
            f"ip-{offset}",
            {"blocked_until": now + timedelta(minutes=5)},
        )

    assert len(guard._blocked_cache) == guard.BLOCK_CACHE_LIMIT


def test_block_activation_logs_once_without_identity(monkeypatch):
    async def no_collection():
        return None

    events = []
    monkeypatch.setattr(guard, "_get_collection", no_collection)
    monkeypatch.setattr(
        guard._logger,
        "warning",
        lambda message, *args: events.append((message, args)),
    )
    identity = guard.ip_key("203.0.113.88", "secret")

    for _ in range(guard.FAILURE_LIMIT + 1):
        asyncio.run(guard.record_failure(identity))

    assert len(events) == 1
    message, args = events[0]
    assert args == ()
    payload = __import__("json").loads(message)
    assert payload == {
        "block_seconds": guard.BLOCK_SECONDS,
        "event": "auth_ip_ban_activated",
        "failure_limit": guard.FAILURE_LIMIT,
        "window_seconds": guard.WINDOW_SECONDS,
    }
    assert identity not in message
    assert "203.0.113.88" not in message
