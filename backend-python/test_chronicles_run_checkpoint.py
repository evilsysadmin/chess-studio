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


def _create_run(client):
    response = client.post(
        "/api/chronicles/runs",
        headers={
            "Authorization": "Bearer test-token",
            "Idempotency-Key": "checkpoint-contract-run",
        },
        json={"mapId": "crypt-eight-squares"},
    )
    assert response.status_code == 201
    return response.json()


def _checkpoint(client, run_id, *, version, map_id="crypt-eight-squares", consumed=None, rewards=None, flags=None):
    return client.put(
        f"/api/chronicles/runs/{run_id}/checkpoint",
        headers={"Authorization": "Bearer test-token"},
        json={
            "expectedWorldVersion": version,
            "currentMapId": map_id,
            "worldFlags": flags or {},
            "consumedContentIds": consumed or [],
            "claimedRewards": rewards or [],
        },
    )


def test_checkpoint_persists_world_state_and_increments_version(monkeypatch):
    _memory_store(monkeypatch)
    client = _client()
    run = _create_run(client)

    response = _checkpoint(
        client,
        run["runId"],
        version=0,
        flags={"sigilAwake": True, "runeCacheOpened": True},
        consumed=["crypt-lever"],
        rewards=["reward:first-cache"],
    )

    assert response.status_code == 200
    saved = response.json()
    assert saved["worldVersion"] == 1
    assert saved["currentMapId"] == "crypt-eight-squares"
    assert saved["worldFlags"] == {"sigilAwake": True, "runeCacheOpened": True}
    assert saved["consumedContentIds"] == ["crypt-lever"]
    assert saved["claimedRewards"] == ["reward:first-cache"]

    stored = client.get(
        f"/api/chronicles/runs/{run['runId']}",
        headers={"Authorization": "Bearer test-token"},
    )
    assert stored.status_code == 200
    assert stored.json()["worldVersion"] == 1
    assert stored.json()["worldFlags"]["sigilAwake"] is True


def test_checkpoint_is_compare_and_swap_and_never_unconsumes(monkeypatch):
    _memory_store(monkeypatch)
    client = _client()
    run = _create_run(client)

    first = _checkpoint(
        client,
        run["runId"],
        version=0,
        consumed=["crypt-lever"],
        rewards=["reward:first-cache"],
    )
    assert first.status_code == 200

    stale = _checkpoint(client, run["runId"], version=0, flags={"sigilAwake": True})
    assert stale.status_code == 409

    second = _checkpoint(
        client,
        run["runId"],
        version=1,
        consumed=[],
        rewards=[],
        flags={"runeCacheOpened": True},
    )
    assert second.status_code == 200
    payload = second.json()
    assert payload["worldVersion"] == 2
    assert payload["consumedContentIds"] == ["crypt-lever"]
    assert payload["claimedRewards"] == ["reward:first-cache"]
    assert payload["worldFlags"] == {"runeCacheOpened": True}


def test_checkpoint_rejects_teleport_to_unreachable_map(monkeypatch):
    _memory_store(monkeypatch)
    client = _client()
    run = _create_run(client)

    response = _checkpoint(
        client,
        run["runId"],
        version=0,
        map_id="echo-cistern",
    )

    assert response.status_code == 409
    stored = client.get(
        f"/api/chronicles/runs/{run['runId']}",
        headers={"Authorization": "Bearer test-token"},
    ).json()
    assert stored["worldVersion"] == 0
    assert stored["currentMapId"] == "crypt-eight-squares"


def test_checkpoint_bounds_client_owned_payload(monkeypatch):
    _memory_store(monkeypatch)
    client = _client()
    run = _create_run(client)

    response = _checkpoint(
        client,
        run["runId"],
        version=0,
        flags={"nested": {"no": "thanks"}},
    )

    assert response.status_code == 400


def test_checkpoint_rejects_unauthored_world_flags(monkeypatch):
    _memory_store(monkeypatch)
    client = _client()
    run = _create_run(client)

    response = _checkpoint(
        client,
        run["runId"],
        version=0,
        flags={"totallyInventedRuntimeFlag": True},
    )

    assert response.status_code == 400
    assert "no está autorizado" in response.json()["detail"]
