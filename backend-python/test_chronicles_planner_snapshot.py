import asyncio

import chronicles_api
import chronicles_run_store


PLANNER_SNAPSHOT = {
    "version": 1,
    "areas": {
        "echo-cistern": {
            "version": 1,
            "source": "workers-ai",
            "verbs": ["traps", "guardian"],
            "difficulty": 5,
        }
    },
}


def test_planner_snapshot_drives_reproducible_area_manifest():
    first = chronicles_api.chronicles_area_envelope(
        "echo-cistern",
        417,
        planner_snapshot=PLANNER_SNAPSHOT,
    )
    repeated = chronicles_api.chronicles_area_envelope(
        "echo-cistern",
        417,
        planner_snapshot=PLANNER_SNAPSHOT,
    )
    local = chronicles_api.chronicles_area_envelope("echo-cistern", 417)

    assert repeated == first
    assert first["mapCode"] != local["mapCode"]
    generation = first["manifest"]["generation"]
    assert generation["plannerAccepted"] is True
    assert generation["plannerSource"] == "workers-ai"
    assert generation["plannerReason"] == "accepted"


def test_planner_snapshot_rejects_unknown_maps_and_bad_proposals():
    bad_map = {
        "version": 1,
        "areas": {
            "not-a-real-map": {
                "version": 1,
                "source": "workers-ai",
                "difficulty": 4,
            }
        },
    }
    bad_proposal = {
        "version": 1,
        "areas": {
            "echo-cistern": {
                "version": 1,
                "source": "workers-ai",
                "seed": 99,
                "difficulty": 4,
            }
        },
    }

    for snapshot in (bad_map, bad_proposal):
        try:
            chronicles_api.chronicles_area_envelope(
                "echo-cistern",
                417,
                planner_snapshot=snapshot,
            )
        except chronicles_api.ChroniclesManifestError:
            pass
        else:
            raise AssertionError("invalid planner snapshot was accepted")


def test_run_store_persists_first_planner_snapshot_for_idempotent_replay(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)

    async def scenario():
        first = await chronicles_run_store.create_or_replay_run(
            run_id="planner-replay-1",
            owner="tester",
            seed=417,
            map_id="echo-cistern",
            content_version=1,
            manifest_revision="a" * 64,
            create_fingerprint="f" * 64,
            planner_snapshot=PLANNER_SNAPSHOT,
        )
        replay = await chronicles_run_store.create_or_replay_run(
            run_id="planner-replay-1",
            owner="tester",
            seed=999,
            map_id="crypt-eight-squares",
            content_version=99,
            manifest_revision="b" * 64,
            create_fingerprint="f" * 64,
            planner_snapshot={
                "version": 1,
                "areas": {
                    "echo-cistern": {
                        "version": 1,
                        "source": "workers-ai",
                        "difficulty": 1,
                    }
                },
            },
        )
        return first, replay

    first, replay = asyncio.run(scenario())
    assert first["plannerSnapshot"] == PLANNER_SNAPSHOT
    assert replay == first


def test_run_bootstrap_reuses_persisted_planner_snapshot():
    expected = chronicles_api.chronicles_area_envelope(
        "echo-cistern",
        417,
        planner_snapshot=PLANNER_SNAPSHOT,
    )
    run = {
        "runId": "planner-bootstrap-1",
        "seed": 417,
        "currentMapId": "echo-cistern",
        "contentVersion": expected["contentVersion"],
        "manifestRevision": expected["manifestRevision"],
        "status": "active",
        "worldVersion": 0,
        "consumedContentIds": [],
        "claimedRewards": [],
        "plannerSnapshot": PLANNER_SNAPSHOT,
    }

    payload = chronicles_api._run_bootstrap_payload(run)

    assert payload["area"]["mapCode"] == expected["mapCode"]
    assert payload["area"]["manifestRevision"] == expected["manifestRevision"]
    assert payload["area"]["manifest"]["generation"]["plannerAccepted"] is True
