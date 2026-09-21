from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import chronicles_api
import chronicles_planner_cloudflare
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


def test_runtime_bootstrap_never_calls_workers_ai(monkeypatch):
    _memory_store(monkeypatch)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 417)

    async def forbidden_planner(*_args, **_kwargs):
        raise AssertionError("runtime bootstrap must not call Workers AI")

    monkeypatch.setattr(
        chronicles_planner_cloudflare,
        "request_chronicles_planner_snapshot",
        forbidden_planner,
    )

    response = _client().post(
        "/api/chronicles/runs",
        headers={
            "Authorization": "Bearer test-token",
            "Idempotency-Key": "chronicles-deterministic-bootstrap-0001",
        },
        json={"mapId": "echo-cistern"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["seed"] == 417
    assert "plannerSnapshot" not in payload
    generation = payload["area"]["manifest"]["generation"]
    assert generation["plannerAccepted"] is False
    assert generation["plannerReason"] == "no-proposal"


def test_idempotent_runtime_retry_reuses_same_deterministic_world(monkeypatch):
    _memory_store(monkeypatch)
    seeds = iter((417, 999))
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: next(seeds))
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-deterministic-replay-0001",
    }

    client = _client()
    first = client.post("/api/chronicles/runs", headers=headers, json={})
    replay = client.post("/api/chronicles/runs", headers=headers, json={})

    assert first.status_code == 201
    assert replay.status_code == 201
    assert replay.json() == first.json()
    assert first.json()["seed"] == 417
    assert "plannerSnapshot" not in first.json()


def test_new_runtime_runs_still_vary_by_seed_without_ai(monkeypatch):
    _memory_store(monkeypatch)
    seeds = iter((417, 733))
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: next(seeds))
    client = _client()

    first = client.post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token", "Idempotency-Key": "run-a"},
        json={},
    )
    second = client.post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token", "Idempotency-Key": "run-b"},
        json={},
    )

    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["seed"] == 417
    assert second.json()["seed"] == 733
    assert first.json()["area"]["instanceId"] != second.json()["area"]["instanceId"]
