from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import chronicles_api
import chronicles_run_store


async def _auth(request: Request):
    token = request.headers.get("Authorization")
    if token == "Bearer test-token":
        return "tester"
    if token == "Bearer rival-token":
        return "rival"
    raise HTTPException(401, "auth")


def _client():
    app = FastAPI()
    app.include_router(chronicles_api.build_chronicles_router(auth_dependency=_auth))
    return TestClient(app)


def _force_memory_store(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)


def _shipped_map_paths(root: Path) -> list[Path]:
    return sorted(root.glob("*.json"), key=lambda path: path.name)


def test_manifest_endpoint_requires_auth():
    response = _client().get("/api/chronicles/maps/crypt-eight-squares")
    assert response.status_code == 401

def test_map_code_preview_requires_auth():
    response = _client().post(
        "/api/chronicles/map-code/preview",
        json={
            "mapCode": (
                "CM1|theme=water|size=13x10|verbs=sluice,guardian|"
                "enemies=5|treasures=2|secrets=1|difficulty=3|seed=417"
            )
        },
    )
    assert response.status_code == 401


def test_map_code_preview_is_deterministic_and_versioned():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}
    code = (
        "CM1|theme=water|size=13x10|verbs=sluice,guardian|"
        "enemies=5|treasures=2|secrets=1|difficulty=3|seed=417"
    )

    first = client.post(
        "/api/chronicles/map-code/preview",
        headers=headers,
        json={"mapCode": code},
    )
    repeated = client.post(
        "/api/chronicles/map-code/preview",
        headers=headers,
        json={"mapCode": code},
    )

    assert first.status_code == 200
    assert first.json() == repeated.json()
    payload = first.json()
    assert payload["mapCode"] == code
    assert payload["generatorVersion"] == 1
    assert len(payload["layoutRevision"]) == 64
    assert len(payload["grid"]) == 10
    assert all(len(row) == 13 for row in payload["grid"])
    assert payload["grid"][payload["partyStart"]["y"]][payload["partyStart"]["x"]] == "P"
    assert payload["grid"][payload["exit"]["y"]][payload["exit"]["x"]] == "X"


def test_map_code_preview_rejects_invalid_or_impossible_recipe():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}

    invalid = client.post(
        "/api/chronicles/map-code/preview",
        headers=headers,
        json={
            "mapCode": (
                "CM1|theme=water|size=13x10|verbs=teleport|"
                "enemies=5|treasures=2|secrets=1|difficulty=3|seed=417"
            )
        },
    )
    impossible = client.post(
        "/api/chronicles/map-code/preview",
        headers=headers,
        json={
            "mapCode": (
                "CM1|theme=water|size=7x7|verbs=sluice,keys,puzzle,traps|"
                "enemies=8|treasures=4|secrets=3|difficulty=3|seed=1"
            )
        },
    )

    assert invalid.status_code == 400
    assert impossible.status_code == 400
    assert "unsupported verb" in invalid.json()["detail"]
    assert "walkable slots" in impossible.json()["detail"]



def test_manifest_is_versioned_and_deterministic_by_map_and_seed():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}

    first = client.get("/api/chronicles/maps/crypt-eight-squares?seed=417", headers=headers)
    repeated = client.get("/api/chronicles/maps/crypt-eight-squares?seed=417", headers=headers)
    other_seed = client.get("/api/chronicles/maps/crypt-eight-squares?seed=418", headers=headers)

    assert first.status_code == 200
    payload = first.json()
    assert payload == repeated.json()
    assert payload["schemaVersion"] == chronicles_api.CHRONICLES_MANIFEST_SCHEMA_VERSION
    assert payload["mapId"] == "crypt-eight-squares"
    assert payload["contentVersion"] == payload["manifest"]["version"]
    assert payload["manifest"]["id"] == payload["mapId"]
    assert payload["seed"] == 417
    assert len(payload["manifestRevision"]) == 64
    assert len(payload["instanceId"]) == 24
    assert payload["mapCode"].endswith("|seed=417")
    assert payload["generatorVersion"] == 1
    assert len(payload["layoutRevision"]) == 64
    assert payload["manifest"]["generation"]["mapCode"] == payload["mapCode"]
    assert payload["manifest"]["generation"]["layoutRevision"] == payload["layoutRevision"]
    assert other_seed.json()["manifestRevision"] != payload["manifestRevision"]
    assert other_seed.json()["manifest"]["grid"] != payload["manifest"]["grid"]
    assert other_seed.json()["instanceId"] != payload["instanceId"]


def test_seed_sweep_produces_real_geometry_diversity():
    grids = {
        tuple(
            chronicles_api.chronicles_area_envelope(
                "crypt-eight-squares",
                seed,
            )["manifest"]["grid"]
        )
        for seed in range(16)
    }

    # This guards against a regression where seed metadata changes but the
    # actual dungeon geometry silently collapses back to one authored layout.
    assert len(grids) >= 8


def test_unknown_map_and_invalid_seed_are_rejected():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}

    assert client.get("/api/chronicles/maps/not-a-real-map", headers=headers).status_code == 404
    assert client.get("/api/chronicles/maps/../main.py", headers=headers).status_code in {404, 422}
    assert client.get("/api/chronicles/maps/crypt-eight-squares?seed=-1", headers=headers).status_code == 422


def test_backend_manifests_match_the_frontend_fallbacks_byte_for_byte():
    repo_root = Path(__file__).resolve().parents[1]
    backend_root = Path(__file__).with_name("chronicles_maps")
    frontend_root = repo_root / "frontend" / "src" / "chronicles" / "maps"
    backend_paths = _shipped_map_paths(backend_root)
    frontend_paths = _shipped_map_paths(frontend_root)

    assert [path.name for path in backend_paths] == [path.name for path in frontend_paths]
    assert backend_paths
    for backend_path, frontend_path in zip(backend_paths, frontend_paths, strict=True):
        assert backend_path.read_bytes() == frontend_path.read_bytes()


def test_all_shipped_manifests_validate():
    backend_root = Path(__file__).with_name("chronicles_maps")
    shipped_paths = _shipped_map_paths(backend_root)

    assert shipped_paths
    for path in shipped_paths:
        map_id = path.stem
        manifest, revision = chronicles_api.load_chronicles_manifest(map_id)
        assert manifest["id"] == map_id
        assert revision


def test_run_creation_requires_auth(monkeypatch):
    _force_memory_store(monkeypatch)
    response = _client().post("/api/chronicles/runs", json={"mapId": "crypt-eight-squares"})
    assert response.status_code == 401


def test_run_creation_binds_server_seed_and_manifest_revision(monkeypatch):
    _force_memory_store(monkeypatch)
    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "gallery-of-forks"},
    )
    assert response.status_code == 201
    run = response.json()
    manifest, _authored_revision = chronicles_api.load_chronicles_manifest("gallery-of-forks")
    expected_area = chronicles_api.chronicles_area_envelope("gallery-of-forks", run["seed"])
    assert 0 <= run["seed"] <= 2_147_483_647
    assert run["currentMapId"] == "gallery-of-forks"
    assert run["contentVersion"] == manifest["version"]
    assert run["manifestRevision"] == expected_area["manifestRevision"]
    assert run["area"]["mapCode"] == expected_area["mapCode"]
    assert run["area"]["layoutRevision"] == expected_area["layoutRevision"]
    assert run["worldVersion"] == 0
    assert run["consumedContentIds"] == []
    assert run["claimedRewards"] == []


def test_idempotent_run_creation_replays_same_identity_and_seed(monkeypatch):
    _force_memory_store(monkeypatch)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-run-0001",
    }
    first = client.post("/api/chronicles/runs", headers=headers, json={"mapId": "crypt-eight-squares"})
    repeated = client.post("/api/chronicles/runs", headers=headers, json={"mapId": "crypt-eight-squares"})

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json() == first.json()


def test_idempotency_key_cannot_be_reused_for_different_map(monkeypatch):
    _force_memory_store(monkeypatch)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-run-0002",
    }
    assert client.post("/api/chronicles/runs", headers=headers, json={"mapId": "crypt-eight-squares"}).status_code == 201
    conflict = client.post("/api/chronicles/runs", headers=headers, json={"mapId": "gallery-of-forks"})
    assert conflict.status_code == 409


def test_run_lookup_is_owner_scoped_without_leaking_existence(monkeypatch):
    _force_memory_store(monkeypatch)
    client = _client()
    created = client.post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "crypt-eight-squares"},
    ).json()

    own = client.get(f"/api/chronicles/runs/{created['runId']}", headers={"Authorization": "Bearer test-token"})
    rival = client.get(f"/api/chronicles/runs/{created['runId']}", headers={"Authorization": "Bearer rival-token"})

    assert own.status_code == 200
    assert own.json()["runId"] == created["runId"]
    assert rival.status_code == 404


def test_invalid_idempotency_key_is_rejected(monkeypatch):
    _force_memory_store(monkeypatch)
    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token", "Idempotency-Key": "bad"},
        json={"mapId": "crypt-eight-squares"},
    )
    assert response.status_code == 400
