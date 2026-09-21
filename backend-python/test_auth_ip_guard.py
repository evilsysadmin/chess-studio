from datetime import datetime, timedelta, timezone
import asyncio

import pytest

import auth_ip_guard as guard


def setup_function():
    guard._memory.clear()


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
