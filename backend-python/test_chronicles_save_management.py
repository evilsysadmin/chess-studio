"""The save selector must never leak or delete a different user's run."""
import asyncio

import chronicles_run_store


def test_authoritative_save_inventory_and_deletion_are_owner_scoped(monkeypatch):
    async def no_collection():
        return None

    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    chronicles_run_store._memory_runs.clear()

    async def scenario():
        for run_id, owner in (
            ("alice-one", "alice"), ("alice-two", "alice"), ("bob-one", "bob")
        ):
            await chronicles_run_store.create_or_replay_run(
                run_id=run_id,
                owner=owner,
                seed=12,
                map_id="swordhaven-square",
                content_version=1,
                manifest_revision="a" * 64,
                create_fingerprint="b" * 64,
            )
        result = await chronicles_run_store.list_active_runs("alice")
        assert len(result) == 2
        assert {save["runId"] for save in result} == {"alice-one", "alice-two"}
        assert all(set(save) == {
            "runId", "currentMapId", "status", "worldVersion", "updatedAtMs",
        } for save in result)
        assert all(save["currentMapId"] == "swordhaven-square" for save in result)
        assert all(save["updatedAtMs"] > 0 for save in result)
        assert not await chronicles_run_store.delete_owned_run("bob-one", "alice")
        assert await chronicles_run_store.delete_owned_run("alice-one", "alice")
        assert not await chronicles_run_store.delete_owned_run("alice-one", "alice")
        assert await chronicles_run_store.get_run("bob-one", "bob")
        assert await chronicles_run_store.get_run("alice-two", "alice")
        assert await chronicles_run_store.get_run("alice-one", "alice") is None
        assert [save["runId"] for save in await chronicles_run_store.list_active_runs("alice")] == [
            "alice-two"
        ]
        assert len(await chronicles_run_store.list_active_runs("bob")) == 1

    asyncio.run(scenario())
