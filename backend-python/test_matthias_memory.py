import asyncio

import pytest

import matthias_memory_store as store


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    store._memory.clear()

    async def no_collection():
        return None

    monkeypatch.setattr(store, "_collection", no_collection)
    yield
    store._memory.clear()


def test_memory_evolves_only_from_grounded_snapshots_and_reset_really_forgets():
    async def scenario():
        first = await store.context("tester", {"total_games": 8, "puzzles_solved": 2, "question_kind": "improve"})
        assert first["consultation_count"] == 0
        assert first["prior_advice"] == []

        recorded = await store.record_consultation(
            "tester", "improve", "En las próximas partidas, revisa dos candidatas antes de mover.",
            {"total_games": 8, "puzzles_solved": 2, "record": {"wins": 3, "losses": 5}},
            consultation_id="consult-1",
        )
        assert recorded is True
        context = await store.context(
            "tester",
            {"total_games": 11, "puzzles_solved": 4, "record": {"wins": 5, "losses": 6}, "question_kind": "improve"},
        )
        assert context["consultation_count"] == 1
        assert context["prior_advice"][0]["question_kind"] == "improve"
        assert context["progress_since_last"] == {
            "total_games": 3,
            "puzzles_solved": 2,
            "record": {"wins": 2, "losses": 1},
        }
        assert context["schema_version"] == store.MEMORY_SCHEMA_VERSION
        assert "username" not in context

        await store.delete_user_memory("tester")
        forgotten = await store.context(
            "tester", {"total_games": 11, "puzzles_solved": 4, "record": {"wins": 5, "losses": 6}, "question_kind": "improve"},
        )
        assert forgotten["consultation_count"] == 0
        assert forgotten["prior_advice"] == []
        assert forgotten["progress_since_last"] == {}

    asyncio.run(scenario())


def test_consultation_id_is_idempotent_and_failed_or_empty_advice_never_pollutes_memory():
    async def scenario():
        assert await store.record_consultation(
            "alice", "tactics", "Compara jaques, capturas y amenazas.", {"total_games": 4}, consultation_id="same-id",
        ) is True
        assert await store.record_consultation(
            "alice", "tactics", "Texto repetido por retry.", {"total_games": 4}, consultation_id="same-id",
        ) is False
        assert await store.record_consultation(
            "alice", "tactics", "   ", {"total_games": 4}, consultation_id="empty",
        ) is False
        summary = await store.user_summary("alice")
        assert summary["consultations"] == 1
        assert store._memory["alice"]["main_advice"]["text"] == "Compara jaques, capturas y amenazas."
        replay = await store.replay_consultation("alice", "same-id")
        assert replay["text"] == "Compara jaques, capturas y amenazas."
        assert replay["questionKind"] == "tactics"

    asyncio.run(scenario())


def test_memory_is_compacted_versioned_and_admin_advice_is_aggregate_not_private_text():
    async def scenario():
        for index in range(store.MAX_RECENT_ADVICE + 5):
            await store.record_consultation(
                "alice",
                "tactics",
                f"Consejo privado {index}",
                {
                    "total_games": index + 1,
                    "noteworthy_incidents": [{"key": "cpu:KNIGHT_FORK", "count": 3}],
                },
                consultation_id=f"alice-{index}",
            )
        await store.record_consultation("bob", "openings", "Trabaja tu apertura más repetida.", {"total_games": 4}, consultation_id="bob-1")

        row = store._memory["alice"]
        assert row["schema_version"] == store.MEMORY_SCHEMA_VERSION
        assert len(row["recent_advice"]) == store.MAX_RECENT_ADVICE
        assert len(row["recent_consultation_ids"]) <= store.MAX_RECENT_CONSULTATION_IDS
        assert row["recent_advice"][0]["text"] == "Consejo privado 5"

        status = await store.admin_status()
        assert status["consultations"] == store.MAX_RECENT_ADVICE + 6
        assert status["usersWithMemory"] == 2
        assert status["topQuestionKind"] == "tactics"
        assert status["dominantAdvice"] == {
            "topic": "forks",
            "label": "Horquillas y dobles ataques",
            "consultations": store.MAX_RECENT_ADVICE + 5,
            "usersAffected": 1,
        }
        assert "Consejo privado" not in str(status)
        assert "alice" not in str(status)
        assert status["recentAdviceCap"] == store.MAX_RECENT_ADVICE
        assert status["memorySchemaVersion"] == store.MEMORY_SCHEMA_VERSION
        assert status["storage"] == "memory"

    asyncio.run(scenario())

def test_observed_facts_build_relationship_goals_opening_memory_and_bounded_milestones():
    async def scenario():
        facts = {
            "total_games": 12,
            "record": {"wins": 4, "draws": 1, "losses": 7},
            "longest_win_streak": 3,
            "puzzles_solved": 11,
            "openings": [
                {"name": "Siciliana", "games": 5, "wins": 1, "draws": 1, "losses": 3, "win_pct": 20},
                {"name": "Italiana", "games": 4, "wins": 3, "draws": 0, "losses": 1, "win_pct": 75},
            ],
            "noteworthy_incidents": [
                {"key": "human:MISSED_MATE", "count": 2},
                {"key": "human:QUEEN_EN_PRISE_TO_PAWN", "count": 1},
            ],
            "cpu_rivalry": {"games": 6, "wins": 1, "draws": 1, "losses": 4},
        }
        await store.observe_facts("coach", facts)
        summary = await store.user_summary("coach")
        assert summary["schemaVersion"] == store.MEMORY_SCHEMA_VERSION
        assert summary["relationship"]["tier"] in {"acquainted", "regular"}
        assert summary["nemesisOpening"]["name"] == "Siciliana"
        assert len(summary["activeGoals"]) <= store.MAX_ACTIVE_GOALS
        assert any(goal["topic"] == "mate_awareness" for goal in summary["activeGoals"])
        assert any(goal["topic"] == "openings" for goal in summary["activeGoals"])
        assert any(item["fingerprint"] == "first-win-vs-matthias" for item in summary["hallOfFame"])
        assert any(item["fingerprint"] == "missed-mate" for item in summary["hallOfShame"])
        assert "Siciliana" in store.briefing_text_from_summary(summary) or summary["activeGoals"][0]["label"] in store.briefing_text_from_summary(summary)

    asyncio.run(scenario())


def test_opening_goal_can_be_completed_only_from_later_real_stats():
    async def scenario():
        initial = {
            "total_games": 10,
            "record": {"wins": 3, "losses": 7},
            "openings": [{"name": "Francesa", "games": 4, "wins": 1, "draws": 0, "losses": 3, "win_pct": 25}],
        }
        await store.observe_facts("open", initial)
        summary = await store.user_summary("open")
        assert any(goal["id"] == "opening:Francesa" for goal in summary["activeGoals"])

        improved = {
            "total_games": 15,
            "record": {"wins": 7, "losses": 8},
            "openings": [{"name": "Francesa", "games": 7, "wins": 4, "draws": 0, "losses": 3, "win_pct": 57}],
        }
        await store.observe_facts("open", improved)
        summary = await store.user_summary("open")
        assert not any(goal["id"] == "opening:Francesa" for goal in summary["activeGoals"])
        assert any(item["kind"] == "goal_completed" and "Francesa" in item["label"] for item in summary["hallOfFame"])

    asyncio.run(scenario())


def test_challenge_closes_only_after_three_real_clean_games_and_earns_a_milestone():
    async def scenario():
        base = {
            "total_games": 10,
            "record": {"wins": 3, "losses": 7},
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
        }
        await store.observe_facts("challenge", base)
        first = await store.user_summary("challenge")
        assert first["activeChallenge"]["target_games"] == store.ACTIVE_CHALLENGE_GAMES
        assert first["activeChallenge"]["baseline_count"] == 2

        for total_games in (11, 12):
            await store.observe_facts("challenge", {**base, "total_games": total_games})
            assert (await store.user_summary("challenge"))["activeChallenge"] is not None

        await store.observe_facts("challenge", {**base, "total_games": 13})
        finished = await store.user_summary("challenge")
        assert finished["activeChallenge"] is None
        assert any(item["kind"] == "challenge_completed" for item in finished["hallOfFame"])
        assert finished["respect"]["score"] > first["respect"]["score"]

    asyncio.run(scenario())


def test_return_context_is_grounded_in_a_real_absence_and_expires():
    from datetime import datetime, timedelta, timezone

    async def scenario():
        await store.observe_facts("returner", {"total_games": 20, "record": {"wins": 8, "losses": 12}})
        old = datetime.now(timezone.utc) - timedelta(days=21)
        store._memory["returner"]["last_observed_at"] = old.isoformat()

        await store.observe_facts("returner", {"total_games": 20, "record": {"wins": 8, "losses": 12}})
        summary = await store.user_summary("returner")
        assert summary["returnContext"]["days"] >= store.RETURN_AFTER_DAYS
        assert "Has vuelto" in store.briefing_text_from_summary(summary)

        expired = dict(store._memory["returner"]["return_context"])
        expired["returned_at"] = (datetime.now(timezone.utc) - timedelta(days=store.RETURN_CONTEXT_TTL_DAYS + 1)).isoformat()
        store._memory["returner"]["return_context"] = expired
        assert (await store.user_summary("returner"))["returnContext"] is None

    asyncio.run(scenario())


def test_emblematic_positions_are_bounded_and_only_exact_fen_is_recognized():
    async def scenario():
        for index in range(store.MAX_EMBLEMATIC_POSITIONS + 2):
            fen = f"8/8/8/8/8/8/8/K6k w - - 0 {index + 1}"
            assert await store.record_emblematic_position("pos", {
                "fen": fen,
                "played": f"a{(index % 8) + 1}",
                "suggested": "Ka2",
                "loss_cp": 220 + index,
                "severity": "mistake",
                "move_number": index + 1,
            }) is True

        summary = await store.user_summary("pos")
        assert len(summary["emblematicPositions"]) == store.MAX_EMBLEMATIC_POSITIONS
        remembered_fen = summary["emblematicPositions"][-1]["fen"]
        same = await store.context("pos", {"fen": remembered_fen, "question_kind": "position"})
        assert same["remembered_position"]["fen"] == remembered_fen
        other = await store.context("pos", {"fen": "8/8/8/8/8/8/K7/7k w - - 0 1", "question_kind": "position"})
        assert other["remembered_position"] is None

    asyncio.run(scenario())


def test_recent_wording_is_bounded_and_exposed_only_as_anti_repetition_guidance():
    async def scenario():
        for index in range(store.MAX_RESPONSE_SIGNATURES + 3):
            await store.record_consultation(
                "phrases", "improve", f"Consejo único número {index}: revisa dos candidatas antes de mover.",
                {"total_games": index + 1}, consultation_id=f"phrase-{index}",
            )
        row = store._memory["phrases"]
        assert len(row["recent_response_signatures"]) == store.MAX_RESPONSE_SIGNATURES
        context = await store.context("phrases", {"total_games": 99, "question_kind": "improve"})
        assert 1 <= len(context["avoid_phrases"]) <= 5
        assert all(len(text) <= 90 for text in context["avoid_phrases"])
        assert "recent_response_signatures" not in context

    asyncio.run(scenario())


def test_matthias_mood_reacts_to_real_performance_with_inertia():
    async def scenario():
        await store.observe_facts("mood", {"total_games": 10, "record": {"wins": 4, "losses": 4, "draws": 2}, "puzzles_solved": 2})
        assert (await store.user_summary("mood"))["mood"] == "observant"

        await store.observe_facts("mood", {"total_games": 12, "record": {"wins": 6, "losses": 4, "draws": 2}, "puzzles_solved": 2})
        assert (await store.user_summary("mood"))["mood"] == "pleased"

        await store.observe_facts("mood", {"total_games": 15, "record": {"wins": 6, "losses": 7, "draws": 2}, "puzzles_solved": 2})
        summary = await store.user_summary("mood")
        assert summary["mood"] == "annoyed"
        assert "paciencia" in store.briefing_text_from_summary(summary).lower()

    asyncio.run(scenario())


def test_admin_status_aggregates_mood_without_exposing_advice_text():
    async def scenario():
        await store.observe_facts("happy", {"total_games": 4, "record": {"wins": 2, "losses": 1, "draws": 1}, "puzzles_solved": 0})
        await store.record_consultation("happy", "tactics", "Texto privado que no debe salir.", {"total_games": 4}, consultation_id="happy-1")
        status = await store.admin_status()
        assert sum(status["moodCounts"].values()) >= 1
        assert status["questionCounts"]["tactics"] >= 1
        assert "Texto privado" not in str(status)

    asyncio.run(scenario())
