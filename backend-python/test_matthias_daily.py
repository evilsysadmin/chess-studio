import asyncio

import pytest
from fastapi import HTTPException

import matthias_daily_store as store
import matthias_memory_store as memory_store
import matthias_daily_api as daily_api
from matthias_daily_api import _safe_facts
from narrative_cloudflare import validate_matthias_daily_contract


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    store._memory.clear()
    memory_store._memory.clear()

    async def no_daily_collection():
        return None

    async def no_memory_collection():
        return None

    monkeypatch.setattr(store, "_collection", no_daily_collection)
    monkeypatch.setattr(memory_store, "_collection", no_memory_collection)
    yield
    store._memory.clear()
    memory_store._memory.clear()


def test_daily_question_is_closed_and_fact_payload_is_whitelisted():
    facts = _safe_facts("tactics", {"total_games": 8, "record": {"losses": 3}, "password": "nope", "random": "nope"})
    assert facts["question_kind"] == "tactics"
    assert facts["total_games"] == 8
    assert "password" not in facts
    assert "random" not in facts

    with pytest.raises(HTTPException) as exc:
        _safe_facts("write_me_a_poem", {"total_games": 8})
    assert exc.value.status_code == 400


def test_daily_audience_is_reserved_once_and_failure_can_release_it():
    async def scenario():
        first = await store.reserve("tester")
        assert first["claimed"] is True
        second = await store.reserve("tester")
        assert second["claimed"] is False
        assert second["pending"] is True

        await store.release("tester", first["reservation"])
        retry = await store.reserve("tester")
        assert retry["claimed"] is True

    asyncio.run(scenario())


def test_committed_daily_audience_cannot_be_spent_again():
    async def scenario():
        claim = await store.reserve("tester")
        result = await store.commit(
            "tester",
            claim["reservation"],
            "action",
            "Tienes 8 partidas registradas. Haz una pausa antes de cada jugada crítica. Achtung: una tarea, no doce.",
        )
        assert result["used"] is True
        status = await store.status("tester")
        assert status["used"] is True
        assert status["questionKind"] == "action"
        assert (await store.reserve("tester"))["claimed"] is False

    asyncio.run(scenario())


def test_daily_response_requires_real_evidence_anchor():
    facts = {"total_games": 8, "question_kind": "improve"}
    good = "Has jugado 8 partidas y tu siguiente mejora debe salir de ahí. Antes de cada jugada crítica compara dos candidatas y anota cuál evita más pérdidas."
    bad = "Achtung, estás jugando fatal últimamente. Trabaja más duro y quizá algún día dejes de regalar posiciones sin saber por qué."
    assert validate_matthias_daily_contract(good, facts)[0] is True
    assert validate_matthias_daily_contract(bad, facts)[0] is False


def _client(monkeypatch, *, cloud=True):
    from fastapi import FastAPI, Header, HTTPException
    from fastapi.testclient import TestClient

    async def auth(authorization: str | None = Header(default=None)):
        return "admin" if authorization == "Bearer admin" else "player"

    async def admin(authorization: str | None = Header(default=None)):
        if authorization != "Bearer admin":
            raise HTTPException(403, "Admin only")
        return "admin"

    calls = []

    async def generated(event_type, facts, **kwargs):
        calls.append((event_type, facts, kwargs))
        if cloud:
            return {"text": f"Has jugado {facts['total_games']} partidas. Compara dos candidatas antes de mover.", "provider": "cloudflare", "latencyMs": 42}
        return {"text": "fallback", "provider": "local", "latencyMs": 5000}

    monkeypatch.setattr(daily_api, "generate_narrative", generated)
    app = FastAPI()
    app.include_router(daily_api.build_matthias_daily_router(auth_dependency=auth, admin_dependency=admin, is_admin_check=lambda name: name == "admin"))
    return TestClient(app), calls


def test_admin_has_unlimited_daily_consultations_but_replayed_id_does_not_double_memory(monkeypatch):
    client, calls = _client(monkeypatch)
    headers = {"Authorization": "Bearer admin"}
    payload = {"questionKind": "tactics", "facts": {"total_games": 8}, "consultationId": "admin-query-1"}

    first = client.post("/api/matthias/daily", headers=headers, json=payload)
    second = client.post("/api/matthias/daily", headers=headers, json=payload)
    third = client.post("/api/matthias/daily", headers=headers, json={**payload, "consultationId": "admin-query-2"})

    assert [first.status_code, second.status_code, third.status_code] == [200, 200, 200]
    assert all(response.json()["unlimited"] is True for response in (first, second, third))
    # The replayed id returns the persisted answer without spending Workers AI.
    assert len(calls) == 2
    assert second.json()["replayed"] is True
    summary = asyncio.run(memory_store.user_summary("admin"))
    assert summary["consultations"] == 2


def test_fallback_does_not_consume_daily_or_write_memory(monkeypatch):
    client, _ = _client(monkeypatch, cloud=False)
    response = client.post(
        "/api/matthias/daily",
        headers={"Authorization": "Bearer player"},
        json={"questionKind": "improve", "facts": {"total_games": 5}, "consultationId": "retry-me"},
    )
    assert response.status_code == 200
    assert response.json()["retryable"] is True
    assert asyncio.run(memory_store.user_summary("player"))["consultations"] == 0
    assert asyncio.run(store.status("player"))["used"] is False


def test_user_can_reset_matthias_memory_without_resetting_daily_quota(monkeypatch):
    client, _ = _client(monkeypatch)
    headers = {"Authorization": "Bearer player"}
    ask = client.post(
        "/api/matthias/daily", headers=headers,
        json={"questionKind": "action", "facts": {"total_games": 6}, "consultationId": "first"},
    )
    assert ask.status_code == 200
    assert asyncio.run(memory_store.user_summary("player"))["consultations"] == 1
    assert asyncio.run(store.status("player"))["used"] is True

    reset = client.post("/api/matthias/reset-memory", headers=headers)
    assert reset.status_code == 200
    assert asyncio.run(memory_store.user_summary("player"))["consultations"] == 0
    # No back door around the one-a-day audience.
    assert asyncio.run(store.status("player"))["used"] is True


def test_admin_can_read_aggregate_matthias_status_and_players_cannot(monkeypatch):
    client, _ = _client(monkeypatch)
    asyncio.run(memory_store.record_consultation(
        "player", "tactics", "Compara dos candidatas.",
        {"total_games": 5, "noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 2}]},
        consultation_id="p-1",
    ))

    denied = client.get("/api/admin/matthias-status", headers={"Authorization": "Bearer player"})
    assert denied.status_code == 403
    allowed = client.get("/api/admin/matthias-status", headers={"Authorization": "Bearer admin"})
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["consultations"] == 1
    assert body["usersWithMemory"] == 1
    assert body["dominantAdvice"]["topic"] == "forks"
    assert "Compara dos candidatas" not in str(body)
    assert "aiToday" in body


def test_briefing_uses_persistent_grounded_memory_without_spending_ai(monkeypatch):
    client, calls = _client(monkeypatch)
    asyncio.run(memory_store.observe_facts("player", {
        "total_games": 9,
        "record": {"wins": 3, "losses": 5, "draws": 1},
        "openings": [{"name": "Siciliana", "games": 5, "wins": 1, "draws": 1, "losses": 3, "win_pct": 20}],
        "noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 3}],
    }))

    response = client.get("/api/matthias/briefing", headers={"Authorization": "Bearer player"})

    assert response.status_code == 200
    body = response.json()
    assert body["text"]
    assert body["memory"]["schemaVersion"] == memory_store.MEMORY_SCHEMA_VERSION
    assert body["memory"]["activeGoals"]
    assert len(calls) == 0
