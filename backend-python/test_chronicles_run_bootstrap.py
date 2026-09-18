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
