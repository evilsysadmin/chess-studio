from datetime import timedelta

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import pvp_api
import pvp_store


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    async def memory_collections():
        return None

    async def profile(username):
        rating = 1180 if username == "alice" else 1325
        return {"data": {pvp_api.RATING_KEY: f'{{"rating": {rating}, "games": 18}}'}}

    monkeypatch.setattr(pvp_store, "_collections", memory_collections)
    monkeypatch.setattr(pvp_api.pstore, "get_profile", profile)
    pvp_store._memory_roster.clear()
    pvp_store._memory_challenges.clear()
    pvp_store._memory_matches.clear()
    yield
    pvp_store._memory_roster.clear()
    pvp_store._memory_challenges.clear()
    pvp_store._memory_matches.clear()


def make_client():
    app = FastAPI()

    class DummyLimiter:
        def limit(self, _rule):
            return lambda fn: fn

    limiter = DummyLimiter()

    async def auth(request: Request):
        username = (request.headers.get("x-test-user") or "").strip().lower()
        if not username:
            raise HTTPException(401, "auth")
        return username

    app.include_router(pvp_api.build_pvp_router(auth_dependency=auth, limiter=limiter))
    return TestClient(app)


def as_user(client, username, method, path, **kwargs):
    return getattr(client, method)(path, headers={"x-test-user": username}, **kwargs)


def test_roster_uses_real_profile_rating_and_hides_stale_members():
    client = make_client()
    joined = as_user(client, "alice", "post", "/api/pvp/roster")
    assert joined.status_code == 200
    assert joined.json()["member"]["rating"] == 1180
    assert joined.json()["member"]["tier"] == "Intermedio"

    as_user(client, "bob", "post", "/api/pvp/roster")
    lobby = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    assert {row["username"] for row in lobby["roster"]} == {"alice", "bob"}

    pvp_store._memory_roster["bob"]["last_seen"] = pvp_store.utcnow() - timedelta(seconds=60)
    lobby = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    assert {row["username"] for row in lobby["roster"]} == {"alice"}


def test_challenge_accept_creates_authoritative_match_and_enforces_turns():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenged = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert challenged.status_code == 201
    challenge_id = challenged.json()["challenge"]["id"]

    incoming = as_user(client, "bob", "get", "/api/pvp/lobby").json()["challenges"]
    assert incoming[0]["direction"] == "incoming"

    accepted = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge_id}/accept")
    assert accepted.status_code == 200
    match = accepted.json()["match"]
    assert {match["white"], match["black"]} == {"alice", "bob"}
    assert match["status"] == "active"
    assert match["revision"] == 0

    white = match["white"]
    black = match["black"]
    match_id = match["id"]
    first = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "e2", "to": "e4"})
    assert first.status_code == 200
    assert first.json()["match"]["revision"] == 1
    assert first.json()["match"]["history"][0]["uci"] == "e2e4"

    wrong_turn = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "d2", "to": "d4"})
    assert wrong_turn.status_code == 409

    second = as_user(client, black, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "e7", "to": "e5"})
    assert second.status_code == 200
    assert second.json()["match"]["revision"] == 2
    assert len(second.json()["match"]["history"]) == 2


def test_challenge_guards_self_absent_opponent_and_wrong_acceptor():
    client = make_client()
    as_user(client, "alice", "post", "/api/pvp/roster")

    self_challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "alice"})
    assert self_challenge.status_code == 400

    absent = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert absent.status_code == 409

    as_user(client, "bob", "post", "/api/pvp/roster")
    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    wrong = as_user(client, "alice", "post", f"/api/pvp/challenges/{challenge['id']}/accept")
    assert wrong.status_code == 404
