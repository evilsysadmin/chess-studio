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
    assert area["generatorVersion"] == 1
    assert area["manifest"]["generation"]["layoutRevision"] == area["layoutRevision"]

    areas = payload["areas"]
    expected_ids = list(chronicles_api.chronicles_shipped_map_ids())
    assert [entry["mapId"] for entry in areas] == expected_ids
    assert len({entry["mapId"] for entry in areas}) == len(expected_ids)
    assert all(entry["seed"] == payload["seed"] for entry in areas)
    assert all(entry["generatorVersion"] == 1 for entry in areas)
    assert next(entry for entry in areas if entry["mapId"] == payload["currentMapId"]) == area
    assert len(response.content) < 256_000


def test_entry_catalog_is_versioned_and_references_shipped_maps():
    version, map_ids = chronicles_api.chronicles_entry_catalog()

    assert version == 2
    assert map_ids == (
        "crypt-eight-squares",
        "gallery-of-forks",
        "menagerie-of-ash",
    )
    assert set(map_ids) <= set(chronicles_api.chronicles_shipped_map_ids())


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
    assert payload["route"]["policyVersion"] == 2
    assert payload["route"]["mapIds"] == list(route_plan)
    assert route_plan[-1] == "echo-cistern"


def test_seeded_route_rewrites_only_primary_exits_and_finishes_in_cistern():
    seed = 20260918
    route_plan = chronicles_api.chronicles_route_plan_for_seed(seed)

    assert len(route_plan) == 3
    assert len(set(route_plan)) == 3
    assert route_plan[-1] == "echo-cistern"

    policy = chronicles_api.chronicles_route_policy()
    for index, map_id in enumerate(route_plan[:-1]):
        envelope = chronicles_api.chronicles_area_envelope(
            map_id,
            seed,
            route_plan=route_plan,
        )
        manifest = envelope["manifest"]
        exit_id = policy["primaryExitIds"][map_id]
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
        route_plan=route_plan,
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


def test_idempotent_seeded_route_replays_original_seed_and_route(monkeypatch):
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
    repeated = client.post("/api/chronicles/runs", headers=headers, json={})

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json() == first.json()
    assert first.json()["seed"] == 111
    assert first.json()["route"]["mapIds"] == list(chronicles_api.chronicles_route_plan_for_seed(111))


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
