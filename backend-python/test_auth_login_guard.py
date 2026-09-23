from datetime import datetime, timedelta, timezone
import asyncio
import json

import auth_login_guard as guard


def setup_function():
    guard._memory.clear()


def test_identity_key_is_normalized_keyed_and_does_not_store_username():
    first = guard.identity_key("  AdminUser  ", "secret-a")
    second = guard.identity_key("adminuser", "secret-a")
    other_secret = guard.identity_key("adminuser", "secret-b")

    assert first == second
    assert first != other_secret
    assert len(first) == 32
    assert "adminuser" not in first


def test_twentieth_failure_blocks_identity_for_five_minutes():
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


def test_expired_block_starts_a_fresh_failure_window():
    now = datetime(2026, 9, 21, 5, 0, tzinfo=timezone.utc)
    expired = {
        "window_started_at": now - timedelta(minutes=8),
        "failures": guard.FAILURE_LIMIT,
        "blocked_until": now - timedelta(seconds=1),
        "updated_at": now - timedelta(seconds=1),
    }

    next_state = guard.state_after_failure(expired, now=now)
    assert next_state["failures"] == 1
    assert next_state["window_started_at"] == now
    assert next_state["blocked_until"] is None


def test_memory_guard_blocks_and_success_clear_removes_identity(monkeypatch):
    async def no_collection():
        return None

    monkeypatch.setattr(guard, "_get_collection", no_collection)
    identity = guard.identity_key("distributed_target", "secret")

    for _ in range(guard.FAILURE_LIMIT):
        asyncio.run(guard.record_failure(identity))

    assert asyncio.run(guard.retry_after(identity)) > 0
    asyncio.run(guard.clear(identity))
    assert asyncio.run(guard.retry_after(identity)) == 0
    assert identity not in guard._memory


def test_memory_guard_logs_identity_block_once_without_clear_username(monkeypatch):
    messages = []

    class FakeLogger:
        def warning(self, message):
            messages.append(message)

    async def no_collection():
        return None

    monkeypatch.setattr(guard, "_get_collection", no_collection)
    monkeypatch.setattr(guard, "_logger", FakeLogger())
    identity = guard.identity_key("Distributed_Target", "secret")

    for _ in range(guard.FAILURE_LIMIT + 2):
        asyncio.run(guard.record_failure(identity))

    assert len(messages) == 1
    payload = json.loads(messages[0])
    assert payload["event"] == "auth_login_identity_ban_activated"
    assert payload["identity_fingerprint"] == identity
    assert payload["failure_limit"] == guard.FAILURE_LIMIT
    assert payload["window_seconds"] == guard.WINDOW_SECONDS
    assert payload["block_seconds"] == guard.BLOCK_SECONDS
    assert "distributed_target" not in messages[0].lower()
