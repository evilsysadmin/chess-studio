"""Lifecycle regression tests for username-backed account identity."""
from __future__ import annotations

import asyncio

from fastapi.testclient import TestClient

import chronicles_run_store
import feedback_store
import game_store
import matthias_daily_store
import matthias_memory_store
import profile_store
import pvp_store
import user_data_lifecycle
from main import app


client = TestClient(app)


def _seed_orphaned_user_data(username: str) -> None:
    game_store._memory_store[f"game-{username}"] = {"owner": username}
    profile_store._memory_profiles[username] = {"_id": username, "data": {"legacy": "1"}}
    pvp_store._memory_roster[username] = {"username": username}
    pvp_store._memory_challenges[f"challenge-{username}"] = {
        "challenger": username, "opponent": "other", "status": "pending",
    }
    pvp_store._memory_matches[f"match-{username}"] = {
        "white": username, "black": "other", "status": "finished",
    }
    chronicles_run_store._memory_runs[f"run-{username}"] = {
        "_id": f"run-{username}", "owner": username,
    }
    matthias_daily_store._memory[username] = {"_id": username, "day": "2026-09-17", "state": "used"}
    matthias_memory_store._memory[username] = {"_id": username, "schema_version": 5}
    feedback_store._memory_feedback[f"feedback-{username}"] = {
        "id": f"feedback-{username}", "username": username,
    }


def _assert_user_data_gone(username: str) -> None:
    assert all(row.get("owner") != username for row in game_store._memory_store.values())
    assert username not in profile_store._memory_profiles
    assert username not in pvp_store._memory_roster
    assert all(
        username not in {row.get("challenger"), row.get("opponent")}
        for row in pvp_store._memory_challenges.values()
    )
    assert all(
        username not in {row.get("white"), row.get("black")}
        for row in pvp_store._memory_matches.values()
    )
    assert all(row.get("owner") != username for row in chronicles_run_store._memory_runs.values())
    assert username not in matthias_daily_store._memory
    assert username not in matthias_memory_store._memory
    assert all(row.get("username") != username for row in feedback_store._memory_feedback.values())


def test_shared_purge_covers_every_username_owned_store():
    username = "lifecycle-purge"
    _seed_orphaned_user_data(username)

    result = asyncio.run(user_data_lifecycle.purge_user_data(username))

    assert result == {"games": 1, "chroniclesRuns": 1, "feedback": 1}
    _assert_user_data_gone(username)


def test_registering_reused_username_starts_vanilla():
    username = "reused-identity"
    _seed_orphaned_user_data(username)

    response = client.post(
        "/api/auth/register",
        json={"username": username, "password": "clave123456"},
    )

    assert response.status_code == 201
    assert response.json()["username"] == username
    _assert_user_data_gone(username)
