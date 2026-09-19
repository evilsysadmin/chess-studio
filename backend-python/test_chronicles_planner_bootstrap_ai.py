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


def test_ai_planner_runs_once_and_idempotent_retry_reuses_snapshot(monkeypatch):
    _memory_store(monkeypatch)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 417)
    calls = []

    async def fake_planner(areas, **kwargs):
        calls.append((areas, kwargs))
        assert len(areas) == 1
        assert areas[0]["map_id"] == "echo-cistern"
        assert areas[0]["theme"] == "water"
        assert isinstance(areas[0]["allowed_verbs"], str)
        return {
            "version": 1,
            "areas": {
                "echo-cistern": {
                    "version": 1,
                    "source": "workers-ai",
                    "verbs": ["guardian", "sluice"],
                    "difficulty": 5,
                }
            },
        }

    monkeypatch.setattr(chronicles_api, "request_chronicles_planner_snapshot", fake_planner)
    client = _client()
    headers = {
        "Authorization": "Bearer test-token",
        "Idempotency-Key": "chronicles-ai-bootstrap-0001",
    }

    first = client.post(
        "/api/chronicles/runs",
        headers=headers,
        json={"mapId": "echo-cistern"},
    )
    repeated = client.post(
        "/api/chronicles/runs",
        headers=headers,
        json={"mapId": "echo-cistern"},
    )

    assert first.status_code == 201
    assert repeated.status_code == 201
    assert repeated.json() == first.json()
    assert len(calls) == 1

    payload = first.json()
    assert payload["seed"] == 417
    assert payload["plannerSnapshot"]["areas"]["echo-cistern"]["source"] == "workers-ai"
    generation = payload["area"]["manifest"]["generation"]
    assert generation["plannerAccepted"] is True
    assert generation["plannerSource"] == "workers-ai"
    assert generation["plannerReason"] == "accepted"


def test_ai_planner_unauthorized_area_is_discarded_without_breaking_run(monkeypatch):
    _memory_store(monkeypatch)
    monkeypatch.setattr(chronicles_api.secrets, "randbelow", lambda _limit: 99)

    async def fake_planner(_areas, **_kwargs):
        return {
            "version": 1,
            "areas": {
                "blind-king-archive": {
                    "version": 1,
                    "source": "workers-ai",
                    "difficulty": 5,
                }
            },
        }

    monkeypatch.setattr(chronicles_api, "request_chronicles_planner_snapshot", fake_planner)
    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "echo-cistern"},
    )

    assert response.status_code == 201
    payload = response.json()
    assert "plannerSnapshot" not in payload
    assert payload["area"]["manifest"]["generation"]["plannerAccepted"] is False
    assert payload["area"]["manifest"]["generation"]["plannerReason"] == "no-proposal"


def test_ai_planner_source_spoof_is_discarded(monkeypatch):
    _memory_store(monkeypatch)

    async def fake_planner(_areas, **_kwargs):
        return {
            "version": 1,
            "areas": {
                "echo-cistern": {
                    "version": 1,
                    "source": "definitely-not-workers",
                    "difficulty": 4,
                }
            },
        }

    monkeypatch.setattr(chronicles_api, "request_chronicles_planner_snapshot", fake_planner)
    response = _client().post(
        "/api/chronicles/runs",
        headers={"Authorization": "Bearer test-token"},
        json={"mapId": "echo-cistern"},
    )
    assert response.status_code == 201
    assert "plannerSnapshot" not in response.json()
