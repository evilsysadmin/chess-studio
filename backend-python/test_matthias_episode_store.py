import asyncio

import pytest

import matthias_episode_store as episode_store
import matthias_memory_store as memory_store


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    memory_store._memory.clear()

    async def no_collection():
        return None

    monkeypatch.setattr(memory_store, "_collection", no_collection)
    yield
    memory_store._memory.clear()


def test_first_observation_is_baseline_not_fake_recent_history():
    async def scenario():
        first = await episode_store.observe("player", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 4}],
            "cpu_rivalry": {"games": 12, "wins": 4, "draws": 1, "losses": 7},
        })
        assert first == {"created": [], "callbacks": [], "episodeCount": 0}
        assert memory_store._memory["player"]["episodic_snapshot"]["noteworthy_incidents"] == {
            "human:MISSED_MATE": 4,
        }

    asyncio.run(scenario())


def test_later_real_delta_is_persisted_in_same_memory_document_and_retrievable():
    async def scenario():
        await episode_store.observe("player", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 1}],
            "cpu_rivalry": {"games": 4, "wins": 1, "draws": 1, "losses": 2},
        })
        observed = await episode_store.observe("player", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
            "cpu_rivalry": {"games": 5, "wins": 1, "draws": 1, "losses": 3},
        })

        assert observed["episodeCount"] == 2
        assert {item["kind"] for item in observed["created"]} == {"incident", "rivalry_result"}
        row = memory_store._memory["player"]
        assert "episodes" in row
        assert "episodic_snapshot" in row
        assert not hasattr(episode_store, "_memory")

        ctx = await episode_store.context("player")
        assert ctx["episode_count"] == 2
        assert any(
            item["episode"]["fingerprint"] == "incident:human:MISSED_MATE:2"
            for item in ctx["callback_candidates"]
        )
        summary = await episode_store.summary("player")
        assert summary["episodeCount"] == 2
        assert len(summary["recentEpisodes"]) == 2

    asyncio.run(scenario())


def test_persisted_document_survives_f5_equivalent_runtime_reads_without_duplicate_episode():
    async def scenario():
        await episode_store.observe("f5", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 1}],
        })
        await episode_store.observe("f5", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
        })
        before = await episode_store.summary("f5")
        assert before["episodeCount"] == 1

        # F5 does not run a reset endpoint or create a new identity. A fresh
        # read against the same persisted document must see the same biography.
        after_reload = await episode_store.context("f5")
        assert after_reload["episode_count"] == 1
        assert after_reload["callback_candidates"][0]["episode"]["fingerprint"] == "incident:human:MISSED_MATE:2"

        # Re-observing the same aggregate after reload advances no evidence and
        # must not mint a duplicate memory.
        repeated = await episode_store.observe("f5", {
            "noteworthy_incidents": [{"key": "human:MISSED_MATE", "count": 2}],
        })
        assert repeated["created"] == []
        assert repeated["episodeCount"] == 1

    asyncio.run(scenario())


def test_existing_reset_contract_removes_episodic_memory_too():
    async def scenario():
        await episode_store.observe("reset-me", {
            "noteworthy_incidents": [{"key": "human:ALLOWED_MATE", "count": 1}],
        })
        await episode_store.observe("reset-me", {
            "noteworthy_incidents": [{"key": "human:ALLOWED_MATE", "count": 2}],
        })
        assert (await episode_store.summary("reset-me"))["episodeCount"] == 1

        await memory_store.delete_user_memory("reset-me")
        assert (await episode_store.summary("reset-me"))["episodeCount"] == 0
        assert "reset-me" not in memory_store._memory

    asyncio.run(scenario())
