import asyncio

import pytest
from fastapi import HTTPException

import matthias_daily_store as store
from matthias_daily_api import _safe_facts
from narrative_cloudflare import validate_matthias_daily_contract


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    store._memory.clear()

    async def no_collection():
        return None

    monkeypatch.setattr(store, "_collection", no_collection)
    yield
    store._memory.clear()


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
