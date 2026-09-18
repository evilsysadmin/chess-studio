from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI, HTTPException, Request
from fastapi.testclient import TestClient

import pvp_api
import pvp_rating
import pvp_store
import users_store


@pytest.fixture(autouse=True)
def reset_memory(monkeypatch):
    async def memory_collections():
        return None

    async def memory_user_collection():
        return None

    monkeypatch.setattr(pvp_store, "_collections", memory_collections)
    monkeypatch.setattr(users_store, "_get_collection", memory_user_collection)
    pvp_store._memory_roster.clear()
    pvp_store._memory_challenges.clear()
    pvp_store._memory_matches.clear()
    users_store._memory_users.clear()
    users_store._memory_users.update({
        "alice": {"username": "alice"},
        "bob": {"username": "bob"},
    })
    yield
    pvp_store._memory_roster.clear()
    pvp_store._memory_challenges.clear()
    pvp_store._memory_matches.clear()
    users_store._memory_users.clear()


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


def start_match_now(client, match):
    first = as_user(client, match["white"], "post", f"/api/pvp/matches/{match['id']}/ready")
    assert first.status_code == 200
    second = as_user(client, match["black"], "post", f"/api/pvp/matches/{match['id']}/ready")
    assert second.status_code == 200
    assert second.json()["match"]["status"] == "active"
    started = pvp_store.utcnow() - timedelta(seconds=1)
    pvp_store._memory_matches[match["id"]]["start_at"] = started
    pvp_store._memory_matches[match["id"]]["turn_started_at"] = started
    return second.json()["match"]


def test_roster_uses_server_account_rating_and_hides_stale_members():
    users_store._memory_users["alice"]["pvp_rating"] = 1180
    users_store._memory_users["bob"]["pvp_rating"] = 1325
    client = make_client()

    joined = as_user(client, "alice", "post", "/api/pvp/roster")
    assert joined.status_code == 200
    assert joined.json()["member"]["rating"] == 1180
    assert joined.json()["member"]["tier"] == "Intermedio"

    as_user(client, "bob", "post", "/api/pvp/roster")
    lobby = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    assert {row["username"] for row in lobby["roster"]} == {"alice", "bob"}
    assert {row["rating"] for row in lobby["roster"]} == {1180, 1325}

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
    assert match["status"] == "starting"
    assert match["youReady"] is False
    assert match["opponentReady"] is False
    assert match["revision"] == 0
    assert match["whiteRating"] == pvp_api.DEFAULT_RATING
    assert match["blackRating"] == pvp_api.DEFAULT_RATING
    assert match["clock"]["id"] == "10+0"
    assert match["clock"]["runningColor"] is None
    assert 590_000 <= match["clock"]["whiteMs"] <= 600_000
    assert 590_000 <= match["clock"]["blackMs"] <= 600_000
    assert match["id"] == challenge_id

    retried = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge_id}/accept")
    assert retried.status_code == 200
    assert retried.json()["match"]["id"] == match["id"]
    assert retried.json()["match"]["white"] == match["white"]
    assert retried.json()["match"]["black"] == match["black"]

    white = match["white"]
    black = match["black"]
    match_id = match["id"]
    first_ready = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/ready")
    assert first_ready.status_code == 200
    assert first_ready.json()["match"]["status"] == "starting"
    assert first_ready.json()["match"]["youReady"] is True
    assert first_ready.json()["match"]["opponentReady"] is False
    second_ready = as_user(client, black, "post", f"/api/pvp/matches/{match_id}/ready")
    assert second_ready.status_code == 200
    prepared = second_ready.json()["match"]
    assert prepared["status"] == "active"
    assert prepared["youReady"] is True
    assert prepared["opponentReady"] is True
    assert prepared["startsAt"]
    assert prepared["clock"]["runningColor"] is None

    early = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "e2", "to": "e4"})
    assert early.status_code == 409
    started = pvp_store.utcnow() - timedelta(seconds=1)
    pvp_store._memory_matches[match_id]["start_at"] = started
    pvp_store._memory_matches[match_id]["turn_started_at"] = started
    first = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "e2", "to": "e4"})
    assert first.status_code == 200
    assert first.json()["match"]["revision"] == 3
    assert first.json()["match"]["history"][0]["uci"] == "e2e4"

    wrong_turn = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "d2", "to": "d4"})
    assert wrong_turn.status_code == 409

    second = as_user(client, black, "post", f"/api/pvp/matches/{match_id}/move", json={"from": "e7", "to": "e5"})
    assert second.status_code == 200
    assert second.json()["match"]["revision"] == 4
    assert len(second.json()["match"]["history"]) == 2


def test_finished_match_settles_server_elo_once(monkeypatch):
    monkeypatch.setattr(pvp_api.secrets, "randbits", lambda _bits: 1)
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    match = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept").json()["match"]
    assert match["white"] == "alice"
    assert match["black"] == "bob"
    start_match_now(client, match)
    match_id = match["id"]

    sequence = [
        ("alice", "f2", "f3"),
        ("bob", "e7", "e5"),
        ("alice", "g2", "g4"),
        ("bob", "d8", "h4"),
    ]
    last = None
    for user, source, target in sequence:
        last = as_user(
            client,
            user,
            "post",
            f"/api/pvp/matches/{match_id}/move",
            json={"from": source, "to": target},
        )
        assert last.status_code == 200

    assert last.json()["match"]["status"] == "finished"
    assert last.json()["match"]["result"] == "0-1"
    assert last.json()["match"]["ratingChange"] == {"before": 400, "after": 416, "delta": 16}
    assert pvp_rating.next_ratings(400, 400, "0-1") == (384, 416)
    assert users_store._memory_users["alice"]["pvp_rating"] == 384
    assert users_store._memory_users["bob"]["pvp_rating"] == 416
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1

    # GET reintenta la liquidación de forma deliberada; no debe duplicarla.
    for user in ("alice", "bob"):
        response = as_user(client, user, "get", f"/api/pvp/matches/{match_id}")
        assert response.status_code == 200
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1

    alice = as_user(client, "alice", "post", "/api/pvp/roster").json()["member"]
    bob = as_user(client, "bob", "post", "/api/pvp/roster").json()["member"]
    assert alice["rating"] == 384
    assert bob["rating"] == 416


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


def test_outgoing_challenge_cancel_is_idempotent_and_expiry_is_server_factual():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    created = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert created.status_code == 201
    challenge = created.json()["challenge"]
    assert challenge["direction"] == "outgoing"
    created_at = datetime.fromisoformat(challenge["createdAt"].replace("Z", "+00:00"))
    expires_at = datetime.fromisoformat(challenge["expiresAt"].replace("Z", "+00:00"))
    assert (expires_at - created_at).total_seconds() == pvp_store.CHALLENGE_TTL_SECONDS

    wrong_actor = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/cancel")
    assert wrong_actor.status_code == 404

    cancelled = as_user(client, "alice", "post", f"/api/pvp/challenges/{challenge['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["challenge"]["status"] == "cancelled"
    assert cancelled.json()["challenge"]["resolvedAt"]

    repeated = as_user(client, "alice", "post", f"/api/pvp/challenges/{challenge['id']}/cancel")
    assert repeated.status_code == 200
    assert repeated.json()["challenge"]["status"] == "cancelled"

    assert as_user(client, "alice", "get", "/api/pvp/lobby").json()["challenges"] == []
    assert as_user(client, "bob", "get", "/api/pvp/lobby").json()["challenges"] == []


def test_resignation_is_authoritative_and_settles_rating(monkeypatch):
    monkeypatch.setattr(pvp_api.secrets, "randbits", lambda _bits: 1)
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200
    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    match = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept").json()["match"]
    start_match_now(client, match)

    response = as_user(client, "alice", "post", f"/api/pvp/matches/{match['id']}/resign")
    assert response.status_code == 200
    payload = response.json()["match"]
    assert payload["status"] == "finished"
    assert payload["result"] == "0-1"
    assert payload["endReason"] == "resignation"
    assert payload["clock"]["runningColor"] is None
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1

    again = as_user(client, "alice", "post", f"/api/pvp/matches/{match['id']}/resign")
    assert again.status_code == 409
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1


def test_default_10_minute_clock_flags_authoritatively(monkeypatch):
    monkeypatch.setattr(pvp_api.secrets, "randbits", lambda _bits: 1)
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200
    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    match = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept").json()["match"]
    start_match_now(client, match)
    match_id = match["id"]

    # Blancas empiezan: simula una pestaña que deja correr más de los 10 min.
    pvp_store._memory_matches[match_id]["turn_started_at"] = pvp_store.utcnow() - timedelta(seconds=601)
    flagged = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert flagged.status_code == 200
    payload = flagged.json()["match"]
    assert payload["status"] == "finished"
    assert payload["result"] == "0-1"
    assert payload["endReason"] == "timeout"
    assert payload["clock"]["whiteMs"] == 0
    assert payload["clock"]["runningColor"] is None
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1
