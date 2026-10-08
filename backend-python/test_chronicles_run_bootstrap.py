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
    assert payload["contentPlacementVersion"] == 2
    assert area["manifest"]["generation"]["contentPlacementVersion"] == 2
    assert len(area["manifest"]["generation"]["contentPlacementRevision"]) == 64
    exit_position = area["manifest"]["generation"]["exitPosition"]
    assert area["manifest"]["grid"][exit_position["y"]][exit_position["x"]] == "X"

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

    assert version == 5
    assert map_ids == (
        "crypt-eight-squares",
        "gallery-of-forks",
        "menagerie-of-ash",
        "blind-king-archive",
        "hollow-bell-tower",
    )
    assert set(map_ids) <= set(chronicles_api.chronicles_shipped_map_ids())


def test_expanded_route_pool_can_select_archive_and_tower():
    route = chronicles_api.chronicles_route_plan_for_seed(2, 3)

    assert "blind-king-archive" in route[:-1]
    assert "hollow-bell-tower" in route[:-1]
    assert route[-1] == "echo-cistern"


def test_dungeon_level_route_length_scales_from_three_to_six_areas():
    routes = {
        level: chronicles_api.chronicles_route_plan_for_seed(20261008, level)
        for level in (1, 2, 3, 4, 8)
    }

    assert [len(routes[level]) for level in (1, 2, 3, 4)] == [3, 4, 5, 6]
    assert len(routes[8]) == 6
    assert all(route[-1] == "echo-cistern" for route in routes.values())
    assert all(len(set(route)) == len(route) for route in routes.values())



def test_run_creation_persists_dungeon_level_and_raises_initial_difficulty(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 20261008)

    response = _client().post(
        "/api/chronicles/runs",
        headers={
            "Authorization": "Bearer test-token",
            "X-Chronicles-Party-Level": "4",
        },
        json={"dungeonLevel": 3},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["dungeonLevel"] == 3
    assert payload["dungeonTopologyVersion"] == 1
    assert len(payload["route"]["mapIds"]) == 5
    first_map = payload["route"]["mapIds"][0]
    first_area = next(area for area in payload["areas"] if area["mapId"] == first_map)
    assert first_area["difficulty"]["depth"] == 2

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
    assert payload["route"]["policyVersion"] == 5
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


def test_same_idempotency_key_rejects_a_different_dungeon_level(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-level-idempotency-0001",
    }

    first = client.post("/api/chronicles/runs", headers=headers, json={"dungeonLevel": 2})
    conflict = client.post("/api/chronicles/runs", headers=headers, json={"dungeonLevel": 3})

    assert first.status_code == 201
    assert first.json()["dungeonLevel"] == 2
    assert conflict.status_code == 409



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
    assert stored_route["policyVersion"] == 5
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
    assert repeated.json()["route"]["policyVersion"] == 5
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



def test_run_difficulty_snapshot_scales_encounter_and_persists_party_level(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-difficulty-bootstrap-0001",
        "X-Chronicles-Party-Level": "1",
    }

    response = client.post(
        "/api/chronicles/runs",
        headers=headers,
        json={"mapId": "blind-king-archive"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["partyLevel"] == 1
    assert payload["area"]["difficulty"]["partyLevel"] == 1
    assert payload["area"]["difficulty"]["depth"] == 0
    assert payload["area"]["difficulty"]["targetLevel"] == 1
    assert payload["area"]["difficulty"]["appliedDelta"] == -1

    warden = next(
        enemy
        for enemy in payload["area"]["manifest"]["enemies"]
        if enemy["id"] == "ledger-warden"
    )
    assert warden["maxHp"] == 8
    assert warden["retaliation"] == 1


def test_run_difficulty_snapshot_is_idempotent_when_profile_levels_change(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    client = _client()
    base_headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-difficulty-stable-0001",
    }

    first = client.post(
        "/api/chronicles/runs",
        headers={**base_headers, "X-Chronicles-Party-Level": "2"},
        json={"mapId": "blind-king-archive"},
    )
    replay = client.post(
        "/api/chronicles/runs",
        headers={**base_headers, "X-Chronicles-Party-Level": "9"},
        json={"mapId": "blind-king-archive"},
    )

    assert first.status_code == 201
    assert replay.status_code == 201
    assert first.json()["partyLevel"] == 2
    assert replay.json() == first.json()


def test_route_depth_drives_authoritative_difficulty_metadata(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 2)

    response = _client().post(
        "/api/chronicles/runs",
        headers={
            "Authorization": "Bearer test-token",
            "X-Chronicles-Party-Level": "6",
        },
        json={},
    )

    assert response.status_code == 201
    payload = response.json()
    route = payload["route"]["mapIds"]
    by_id = {area["mapId"]: area for area in payload["areas"]}
    for depth, map_id in enumerate(route):
        difficulty = by_id[map_id]["difficulty"]
        assert difficulty["partyLevel"] == 6
        assert difficulty["depth"] == depth


def test_area_preview_remains_unscaled_without_run_party_snapshot():
    preview = chronicles_api.chronicles_area_envelope(
        "blind-king-archive",
        417,
    )
    warden = next(
        enemy
        for enemy in preview["manifest"]["enemies"]
        if enemy["id"] == "ledger-warden"
    )

    assert "difficulty" not in preview
    assert warden["maxHp"] == 9
    assert warden["retaliation"] == 2



def test_legacy_run_without_placement_version_rehydrates_legacy_manifest():
    seed = 417
    map_id = "black-glass-chapel"
    legacy_area = chronicles_api.chronicles_area_envelope(map_id, seed)
    run = {
        "runId": "legacy-placement-run",
        "seed": seed,
        "currentMapId": map_id,
        "contentVersion": legacy_area["contentVersion"],
        "manifestRevision": legacy_area["manifestRevision"],
        "status": "active",
        "worldVersion": 0,
        "consumedContentIds": [],
        "claimedRewards": [],
        "worldFlags": {},
        "inventory": {},
        "quests": {},
    }

    payload = chronicles_api._run_bootstrap_payload(run)

    assert payload["area"]["manifestRevision"] == legacy_area["manifestRevision"]
    assert payload["area"]["manifest"] == legacy_area["manifest"]
    assert "contentPlacementVersion" not in payload
    assert "dungeonTopologyVersion" not in payload
    assert "contentPlacementVersion" not in payload["area"]["manifest"]["generation"]
    assert "dungeonTopologyVersion" not in payload["area"]["manifest"]["generation"]



def test_v1_run_keeps_authored_exit_after_v2_deploy():
    seed = 417
    map_id = "black-glass-chapel"
    v1_area = chronicles_api.chronicles_area_envelope(
        map_id,
        seed,
        content_placement_version=1,
    )
    run = {
        "runId": "v1-placement-run",
        "seed": seed,
        "contentPlacementVersion": 1,
        "currentMapId": map_id,
        "contentVersion": v1_area["contentVersion"],
        "manifestRevision": v1_area["manifestRevision"],
        "status": "active",
        "worldVersion": 0,
        "consumedContentIds": [],
        "claimedRewards": [],
        "worldFlags": {},
        "inventory": {},
        "quests": {},
    }

    payload = chronicles_api._run_bootstrap_payload(run)

    assert payload["contentPlacementVersion"] == 1
    assert payload["area"]["manifestRevision"] == v1_area["manifestRevision"]
    assert payload["area"]["manifest"] == v1_area["manifest"]
    assert payload["area"]["manifest"]["generation"]["contentPlacementVersion"] == 1
    assert "exitPosition" not in payload["area"]["manifest"]["generation"]
