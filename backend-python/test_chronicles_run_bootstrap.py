from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import chronicles_api
import chronicles_run_store


async def _auth(request: Request):
    if request.headers.get("Authorization") != "Bearer test-token":
        raise HTTPException(401, "auth")
    return "tester"


def _client():
    app = FastAPI()
    app.include_router(chronicles_api.build_chronicles_router(auth_dependency=_auth))
    return TestClient(app)


def test_run_creation_returns_bound_area_in_same_response(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)

    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "gallery-of-forks"},
    )

    assert response.status_code == 201
    payload = response.json()
    area = payload["area"]
    assert area["mapId"] == payload["currentMapId"]
    assert area["seed"] == payload["seed"]
    assert area["contentVersion"] == payload["contentVersion"]
    assert area["manifestRevision"] == payload["manifestRevision"]
    assert area["manifest"]["id"] == payload["currentMapId"]
    assert area["mapCode"].endswith(f"|seed={payload['seed']}")
    assert area["generatorVersion"] == 2
    assert area["manifest"]["generation"]["layoutRevision"] == area["layoutRevision"]

    areas = payload["areas"]
    expected_ids = list(chronicles_api.chronicles_shipped_map_ids())
    assert [entry["mapId"] for entry in areas] == expected_ids
    assert len({entry["mapId"] for entry in areas}) == len(expected_ids)
    assert all(entry["seed"] == payload["seed"] for entry in areas)
    assert all(entry["generatorVersion"] == 2 for entry in areas)
    assert next(entry for entry in areas if entry["mapId"] == payload["currentMapId"]) == area
    assert len(response.content) < 256_000


def test_entry_catalog_is_versioned_and_references_shipped_maps():
    version, map_ids = chronicles_api.chronicles_entry_catalog()

    assert version == 4
    assert map_ids == (
        "crypt-eight-squares",
        "gallery-of-forks",
        "menagerie-of-ash",
        "blind-king-archive",
        "hollow-bell-tower",
    )
    assert set(map_ids) <= set(chronicles_api.chronicles_shipped_map_ids())


def test_expanded_route_pool_can_select_archive_and_tower():
    archive_route = chronicles_api.chronicles_route_plan_for_seed(2)
    tower_route = chronicles_api.chronicles_route_plan_for_seed(0)

    assert "blind-king-archive" in archive_route[:-1]
    assert "hollow-bell-tower" in tower_route[:-1]
    assert archive_route[-1] == "echo-cistern"
    assert tower_route[-1] == "echo-cistern"


def test_seeded_route_length_varies_between_three_and_four_areas():
    short_route = chronicles_api.chronicles_route_plan_for_seed(0)
    long_route = chronicles_api.chronicles_route_plan_for_seed(2)

    assert len(short_route) == 3
    assert len(long_route) == 4
    assert short_route[-1] == "echo-cistern"
    assert long_route[-1] == "echo-cistern"
    assert len(set(short_route)) == len(short_route)
    assert len(set(long_route)) == len(long_route)


def test_run_creation_without_map_uses_seeded_safe_entry(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 918273)

    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={},
    )

    assert response.status_code == 201
    payload = response.json()
    route_plan = chronicles_api.chronicles_route_plan_for_seed(payload["seed"])
    expected_map_id = route_plan[0]
    assert payload["seed"] == 918273
    assert payload["currentMapId"] == expected_map_id
    assert expected_map_id in chronicles_api.chronicles_entry_map_ids()
    assert payload["area"]["mapId"] == expected_map_id
    assert payload["area"]["mapCode"].endswith("|seed=918273")
    assert payload["route"]["policyVersion"] == 4
    assert payload["route"]["mapIds"] == list(route_plan)
    assert route_plan[-1] == "echo-cistern"


def test_distinct_run_keys_create_fresh_seed_route_and_world(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    seeds = iter((0, 2))
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: next(seeds))
    client = _client()
    auth = {"Authorization": "Bearer test-token"}

    first = client.post(
        "/api/chronicles/runs",
        headers={**auth, "Idempotency-Key": "fresh-expedition-a"},
        json={},
    )
    second = client.post(
        "/api/chronicles/runs",
        headers={**auth, "Idempotency-Key": "fresh-expedition-b"},
        json={},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    first_payload = first.json()
    second_payload = second.json()

    assert first_payload["runId"] != second_payload["runId"]
    assert first_payload["seed"] == 0
    assert second_payload["seed"] == 2
    assert first_payload["route"]["mapIds"] == list(chronicles_api.chronicles_route_plan_for_seed(0))
    assert second_payload["route"]["mapIds"] == list(chronicles_api.chronicles_route_plan_for_seed(2))
    assert first_payload["route"]["mapIds"] != second_payload["route"]["mapIds"]
    assert first_payload["area"]["mapCode"] != second_payload["area"]["mapCode"]
    assert first_payload["area"]["layoutRevision"] != second_payload["area"]["layoutRevision"]


def test_seeded_route_rewrites_only_primary_exits_and_finishes_in_cistern():
    seed = 20260918
    route_snapshot = chronicles_api.chronicles_route_snapshot_for_seed(seed)
    route_plan = route_snapshot["mapIds"]

    assert len(route_plan) == 3
    assert len(set(route_plan)) == 3
    assert route_plan[-1] == "echo-cistern"

    for index, map_id in enumerate(route_plan[:-1]):
        envelope = chronicles_api.chronicles_area_envelope(
            map_id,
            seed,
            route_snapshot=route_snapshot,
        )
        manifest = envelope["manifest"]
        exit_id = route_snapshot["primaryExitIds"][map_id]
        exit_entry = next(entry for entry in manifest["exits"] if entry["id"] == exit_id)
        transitions = [
            effect
            for effect in exit_entry["action"]["effects"]
            if effect.get("type") == "transition-map"
        ]
        assert transitions == [{"type": "transition-map", "mapId": route_plan[index + 1]}]
        assert manifest["generation"]["route"]["index"] == index
        assert manifest["generation"]["route"]["nextMapId"] == route_plan[index + 1]

    final_envelope = chronicles_api.chronicles_area_envelope(
        "echo-cistern",
        seed,
        route_snapshot=route_snapshot,
    )
    final_manifest = final_envelope["manifest"]
    assert final_manifest["generation"]["route"]["index"] == 2
    assert final_manifest["generation"]["route"]["nextMapId"] is None
    final_transitions = [
        effect
        for exit_entry in final_manifest["exits"]
        for effect in exit_entry["action"]["effects"]
        if effect.get("type") == "transition-map"
    ]
    assert final_transitions == []


def test_idempotent_seeded_route_replays_persisted_snapshot_across_policy_change(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    seeds = iter((111, 999999))
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: next(seeds))
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-route-bootstrap-0001",
    }

    first = client.post("/api/chronicles/runs", headers=headers, json={})
    assert first.status_code == 201
    first_payload = first.json()
    first_route = list(first_payload["route"]["mapIds"])

    stored = client.get(
        f"/api/chronicles/runs/{first_payload['runId']}",
        headers={"Authorization": "Bearer test-token"},
    )
    assert stored.status_code == 200
    stored_route = stored.json()["route"]
    assert stored_route["policyVersion"] == 4
    assert stored_route["mapIds"] == first_route
    assert set(stored_route["primaryExitIds"]) == set(first_route[:-1])

    original_policy = chronicles_api.chronicles_route_policy()
    changed_policy = {
        **original_policy,
        "version": 999,
        "mapIds": tuple(reversed(original_policy["mapIds"])),
    }
    monkeypatch.setattr(chronicles_api, "chronicles_route_policy", lambda: changed_policy)

    repeated = client.post("/api/chronicles/runs", headers=headers, json={})

    assert repeated.status_code == 201
    assert repeated.json() == first_payload
    assert repeated.json()["seed"] == 111
    assert repeated.json()["route"]["policyVersion"] == 4
    assert repeated.json()["route"]["mapIds"] == first_route


def test_idempotent_run_bootstrap_replays_identical_area(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-bootstrap-0001",
    }

    first = client.post("/api/chronicles/runs", headers=headers, json={"mapId": "crypt-eight-squares"})
    repeated = client.post("/api/chronicles/runs", headers=headers, json={"mapId": "crypt-eight-squares"})

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json() == first.json()
