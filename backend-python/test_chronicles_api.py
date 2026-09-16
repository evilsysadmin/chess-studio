from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import chronicles_api


async def _auth(request: Request):
    if request.headers.get("Authorization") != "Bearer test-token":
        raise HTTPException(401, "auth")
    return "tester"


def _client():
    app = FastAPI()
    app.include_router(chronicles_api.build_chronicles_router(auth_dependency=_auth))
    return TestClient(app)


def test_manifest_endpoint_requires_auth():
    response = _client().get("/api/chronicles/maps/crypt-eight-squares")
    assert response.status_code == 401


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
    assert other_seed.json()["manifestRevision"] == payload["manifestRevision"]
    assert other_seed.json()["instanceId"] != payload["instanceId"]


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

    for filename in ("crypt-eight-squares.json", "gallery-of-forks.json", "menagerie-of-ash.json"):
        assert (backend_root / filename).read_bytes() == (frontend_root / filename).read_bytes()


def test_all_shipped_manifests_validate():
    for map_id in ("crypt-eight-squares", "gallery-of-forks", "menagerie-of-ash"):
        manifest, revision = chronicles_api.load_chronicles_manifest(map_id)
        assert manifest["id"] == map_id
        assert revision
