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


def _memory_store(monkeypatch):
    async def no_collection():
        return None

    chronicles_run_store._memory_runs.clear()
    monkeypatch.setattr(chronicles_run_store, "_collection", no_collection)


def test_explicit_runtime_bootstrap_is_planner_free(monkeypatch):
    _memory_store(monkeypatch)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 417)

    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "echo-cistern"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["seed"] == 417
    assert "plannerSnapshot" not in payload
    generation = payload["area"]["manifest"]["generation"]
    assert generation["plannerAccepted"] is False
    assert generation["plannerReason"] == "no-proposal"


def test_seeded_default_entry_is_planner_free(monkeypatch):
    _memory_store(monkeypatch)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 918273)

    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={},
    )

    assert response.status_code == 201
    payload = response.json()
    route_plan = chronicles_api.chronicles_route_plan_for_seed(918273)
    assert payload["currentMapId"] == route_plan[0]
    assert payload["route"]["mapIds"] == list(route_plan)
    assert "plannerSnapshot" not in payload
    generation = payload["area"]["manifest"]["generation"]
    assert generation["plannerAccepted"] is False
    assert generation["plannerReason"] == "no-proposal"
