import asyncio

import pytest
from fastapi import FastAPI, Header, HTTPException
from fastapi.testclient import TestClient

import matthias_daily_api as daily_api
import matthias_daily_store as daily_store
import matthias_episode_store as episode_store
import matthias_memory_store as memory_store


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    daily_store._memory.clear()
    memory_store._memory.clear()

    async def no_daily_collection():
        return None

    async def no_memory_collection():
        return None

    monkeypatch.setattr(daily_store, "_collection", no_daily_collection)
    monkeypatch.setattr(memory_store, "_collection", no_memory_collection)
    yield
    daily_store._memory.clear()
    memory_store._memory.clear()


def _client(monkeypatch):
    async def auth(authorization: str | None = Header(default=None)):
        return "admin" if authorization == "Bearer admin" else "player"

    async def admin(authorization: str | None = Header(default=None)):
        if authorization != "Bearer admin":
            raise HTTPException(403, "Admin only")
        return "admin"

    calls = []

    async def generated(event_type, facts, **kwargs):
        calls.append((event_type, facts, kwargs))
        return {
            "text": f"Has jugado {facts['total_games']} partidas. Compara dos candidatas antes de mover.",
            "provider": "cloudflare",
            "latencyMs": 42,
        }

    monkeypatch.setattr(daily_api, "generate_narrative", generated)
    app = FastAPI()
    app.include_router(daily_api.build_matthias_daily_router(
        auth_dependency=auth,
        admin_dependency=admin,
        is_admin_check=lambda name: name == "admin",
    ))
    return TestClient(app), calls


def test_daily_audience_establishes_baseline_then_sends_only_eligible_callbacks(monkeypatch):
    client, calls = _client(monkeypatch)
    headers = {"Authorization": "Bearer admin"}

    first = client.post("/api/matthias/daily", headers=headers, json={
        "questionKind": "tactics",
        "consultationId": "episode-1",
        "facts": {
            "total_games": 8,
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 1}],
            "cpu_rivalry": {"games": 4, "wins": 1, "draws": 1, "losses": 2},
        },
    })
    second = client.post("/api/matthias/daily", headers=headers, json={
        "questionKind": "tactics",
        "consultationId": "episode-2",
        "facts": {
            "total_games": 9,
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
            "cpu_rivalry": {"games": 5, "wins": 1, "draws": 1, "losses": 3},
        },
    })

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["memory"]["episodicMemory"]["episodeCount"] == 0
    assert second.json()["memory"]["episodicMemory"]["episodeCount"] == 2
    assert len(calls) == 2

    first_context = calls[0][1]["matthias_memory"]["episodic"]
    assert first_context == {"episode_count": 0, "callback_candidates": []}

    second_context = calls[1][1]["matthias_memory"]["episodic"]
    assert second_context["episode_count"] == 2
    candidates = second_context["callback_candidates"]
    assert 1 <= len(candidates) <= 3
    assert any(
        row["episode"]["fingerprint"] == "incident:human:MISSED_MATE:2"
        for row in candidates
    )
    # The AI sees evidence records only, never the full persisted episode list.
    assert "recentEpisodes" not in second_context


def test_daily_status_and_briefing_expose_bounded_episode_summary_without_extra_ai(monkeypatch):
    client, calls = _client(monkeypatch)
    asyncio.run(episode_store.observe("player", {
        "noteworthy_incidents": [{"key": "human:ALLOWED_MATE", "count": 1}],
    }))
    asyncio.run(episode_store.observe("player", {
        "noteworthy_incidents": [{"key": "human:ALLOWED_MATE", "count": 2}],
    }))

    daily = client.get("/api/matthias/daily", headers={"Authorization": "Bearer player"})
    briefing = client.get("/api/matthias/briefing", headers={"Authorization": "Bearer player"})

    assert daily.status_code == 200
    assert daily.json()["memory"]["episodicMemory"]["episodeCount"] == 1
    assert len(daily.json()["memory"]["episodicMemory"]["recentEpisodes"]) == 1
    assert briefing.status_code == 200
    assert briefing.json()["memory"]["episodicMemory"]["episodeCount"] == 1
    assert calls == []


def test_existing_reset_endpoint_clears_episodes_and_baseline_but_not_daily_quota(monkeypatch):
    client, _ = _client(monkeypatch)
    headers = {"Authorization": "Bearer player"}

    asked = client.post("/api/matthias/daily", headers=headers, json={
        "questionKind": "action",
        "consultationId": "reset-episode",
        "facts": {
            "total_games": 5,
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 1}],
        },
    })
    assert asked.status_code == 200
    assert asyncio.run(daily_store.status("player"))["used"] is True
    assert "episodic_snapshot" in memory_store._memory["player"]

    reset = client.post("/api/matthias/reset-memory", headers=headers)

    assert reset.status_code == 200
    assert "player" not in memory_store._memory
    assert asyncio.run(episode_store.summary("player"))["episodeCount"] == 0
    assert asyncio.run(daily_store.status("player"))["used"] is True
