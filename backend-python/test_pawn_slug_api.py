from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import pawn_slug_api


async def _auth(request: Request):
    if request.headers.get("Authorization") == "Bearer test-token":
        return "tester"
    raise HTTPException(401, "auth")


def _client():
    app = FastAPI()
    app.include_router(pawn_slug_api.build_pawn_slug_router(auth_dependency=_auth))
    return TestClient(app)


def test_stage_manifest_requires_auth():
    response = _client().get("/api/pawn-slug/stages/pawn-slug-v1")
    assert response.status_code == 401


def test_stage_manifest_is_versioned_and_deterministic_by_stage_and_seed():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}

    first = client.get("/api/pawn-slug/stages/pawn-slug-v1?seed=417", headers=headers)
    repeated = client.get("/api/pawn-slug/stages/pawn-slug-v1?seed=417", headers=headers)
    other_seed = client.get("/api/pawn-slug/stages/pawn-slug-v1?seed=418", headers=headers)

    assert first.status_code == 200
    payload = first.json()
    assert payload == repeated.json()
    assert payload["schemaVersion"] == pawn_slug_api.PAWN_SLUG_MANIFEST_SCHEMA_VERSION
    assert payload["stageId"] == "pawn-slug-v1"
    assert payload["contentVersion"] == payload["manifest"]["version"]
    assert payload["manifest"]["id"] == payload["stageId"]
    assert payload["seed"] == 417
    assert len(payload["manifestRevision"]) == 64
    assert len(payload["instanceId"]) == 24
    assert other_seed.json()["manifestRevision"] == payload["manifestRevision"]
    assert other_seed.json()["instanceId"] != payload["instanceId"]


def test_stage_manifest_preserves_current_vertical_slice_contract():
    manifest, revision = pawn_slug_api.load_pawn_slug_manifest("pawn-slug-v1")

    assert revision
    assert manifest["world"] == {
        "width": 5200,
        "groundY": 420,
        "bossX": 4580,
        "extractionX": 5050,
    }
    assert len(manifest["spawns"]) == 23
    assert manifest["spawns"][2] == {"id": "pawn-2", "x": 1200, "type": "pawn"}
    assert manifest["spawns"][13] == {"id": "knight-13", "x": 3110, "type": "knight"}
    assert manifest["enemyProfiles"]["bishop"]["midBoss"] is True
    assert manifest["enemyProfiles"]["boss"]["hp"] == 780


def test_unknown_stage_and_invalid_seed_are_rejected():
    client = _client()
    headers = {"Authorization": "Bearer test-token"}

    assert client.get("/api/pawn-slug/stages/not-a-real-stage", headers=headers).status_code == 404
    assert client.get("/api/pawn-slug/stages/../main.py", headers=headers).status_code in {404, 422}
    assert client.get("/api/pawn-slug/stages/pawn-slug-v1?seed=-1", headers=headers).status_code == 422


def test_loader_rejects_invalid_repository_content(tmp_path: Path):
    (tmp_path / "broken.json").write_text(
        '{"id":"broken","version":1,"world":{"width":100,"groundY":0,"bossX":90,"extractionX":110},'
        '"enemyProfiles":{"pawn":{"hp":1,"speed":0,"score":0,"xp":0,"width":1,"height":1}},"spawns":[]}',
        encoding="utf-8",
    )

    try:
        pawn_slug_api.load_pawn_slug_manifest("broken", root=tmp_path)
    except HTTPException as exc:
        assert exc.status_code == 500
    else:
        raise AssertionError("invalid manifest should fail closed")


def test_loader_returns_a_copy_not_the_cached_object():
    first, _revision = pawn_slug_api.load_pawn_slug_manifest("pawn-slug-v1")
    first["world"]["width"] = 1
    second, _revision = pawn_slug_api.load_pawn_slug_manifest("pawn-slug-v1")
    assert second["world"]["width"] == 5200
