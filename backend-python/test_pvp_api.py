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


def test_lobby_exposes_head_to_head_only_from_persisted_finished_matches():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    now = pvp_store.utcnow()
    pvp_store._memory_matches.update({
        "finished-win": {
            "id": "finished-win", "white": "alice", "black": "bob",
            "status": "finished", "result": "1-0", "updated_at": now - timedelta(minutes=2),
        },
        "finished-draw": {
            "id": "finished-draw", "white": "bob", "black": "alice",
            "status": "finished", "result": "1/2-1/2", "updated_at": now - timedelta(minutes=1),
        },
        "unfinished-ignore": {
            "id": "unfinished-ignore", "white": "alice", "black": "bob",
            "status": "finished", "result": None, "updated_at": now,
        },
    })

    lobby = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    alice = next(row for row in lobby["roster"] if row["username"] == "alice")
    bob = next(row for row in lobby["roster"] if row["username"] == "bob")

    assert "headToHead" not in alice
    assert bob["headToHead"] == {
        "games": 2,
        "wins": 1,
        "draws": 1,
        "losses": 0,
        "lastPlayedAt": (now - timedelta(minutes=1)).isoformat().replace("+00:00", "Z"),
    }


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

    # F5/retry del mismo jugador no duplica ni adelanta el arranque.
    repeated_ready = as_user(client, white, "post", f"/api/pvp/matches/{match_id}/ready")
    assert repeated_ready.status_code == 200
    assert repeated_ready.json()["match"]["status"] == "starting"
    assert repeated_ready.json()["match"]["youReady"] is True
    assert repeated_ready.json()["match"]["opponentReady"] is False
    assert repeated_ready.json()["match"]["revision"] == first_ready.json()["match"]["revision"]

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


def test_active_match_presence_uses_existing_poll_without_revision_churn():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    match = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept").json()["match"]
    start_match_now(client, match)
    match_id = match["id"]
    stored = pvp_store._memory_matches[match_id]
    revision = stored["revision"]

    alice_color = "white" if stored["white"] == "alice" else "black"
    bob_seen_key = "black_seen_at" if alice_color == "white" else "white_seen_at"

    online = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert online.status_code == 200
    assert online.json()["match"]["opponentPresence"] == "online"
    assert online.json()["match"]["opponentSeenAt"]
    assert pvp_store._memory_matches[match_id]["revision"] == revision

    pvp_store._memory_matches[match_id][bob_seen_key] = pvp_store.utcnow() - timedelta(seconds=6)
    reconnecting = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert reconnecting.json()["match"]["opponentPresence"] == "reconnecting"
    assert pvp_store._memory_matches[match_id]["revision"] == revision

    pvp_store._memory_matches[match_id][bob_seen_key] = pvp_store.utcnow() - timedelta(seconds=13)
    disconnected = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    disconnected_payload = disconnected.json()["match"]
    assert disconnected_payload["opponentPresence"] == "disconnected"
    assert disconnected_payload["opponentDisconnectDeadline"]
    grace_deadline = datetime.fromisoformat(disconnected_payload["opponentDisconnectDeadline"].replace("Z", "+00:00"))
    assert 58 <= (grace_deadline - pvp_store.utcnow()).total_seconds() <= pvp_api.PVP_DISCONNECT_GRACE_SECONDS
    assert pvp_store._memory_matches[match_id]["revision"] == revision

    # El propio polling/GET de Bob lo vuelve a declarar vivo, limpia su gracia
    # en esa misma escritura y Alice lo ve recuperado sin heartbeat adicional.
    bob_poll = as_user(client, "bob", "get", f"/api/pvp/matches/{match_id}")
    assert bob_poll.status_code == 200
    restored = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert restored.json()["match"]["opponentPresence"] == "online"
    assert restored.json()["match"]["opponentDisconnectDeadline"] is None
    assert pvp_store._memory_matches[match_id]["revision"] == revision


def test_disconnect_grace_does_not_award_instant_win_when_both_players_were_absent(monkeypatch):
    monkeypatch.setattr(pvp_api.secrets, "randbits", lambda _bits: 1)
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    match = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept").json()["match"]
    start_match_now(client, match)
    match_id = match["id"]
    stored = pvp_store._memory_matches[match_id]
    revision = stored["revision"]
    stale = pvp_store.utcnow() - timedelta(minutes=2)
    stored["white_seen_at"] = stale
    stored["black_seen_at"] = stale
    # Bob ya tenía una gracia antigua, pero Alice también desapareció. Al
    # volver Alice, esa reclamación vieja debe reiniciarse en vez de cobrar win.
    stored["black_disconnect_grace_started_at"] = stale
    stored.pop("white_disconnect_grace_started_at", None)

    returned = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert returned.status_code == 200
    payload = returned.json()["match"]
    assert payload["status"] == "active"
    assert payload["opponentPresence"] == "disconnected"
    assert payload["opponentDisconnectDeadline"]
    deadline = datetime.fromisoformat(payload["opponentDisconnectDeadline"].replace("Z", "+00:00"))
    assert 58 <= (deadline - pvp_store.utcnow()).total_seconds() <= pvp_api.PVP_DISCONNECT_GRACE_SECONDS
    assert pvp_store._memory_matches[match_id]["revision"] == revision
    assert "pvp_rating_games" not in users_store._memory_users["alice"]
    assert "pvp_rating_games" not in users_store._memory_users["bob"]


def test_disconnect_grace_forfeits_after_deadline_and_settles_rating_once(monkeypatch):
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
    now = pvp_store.utcnow()
    stored = pvp_store._memory_matches[match_id]
    stored["black_seen_at"] = now - timedelta(seconds=pvp_api.PVP_PRESENCE_RECONNECTING_SECONDS + 1)
    stored["black_disconnect_grace_started_at"] = now - timedelta(seconds=pvp_api.PVP_DISCONNECT_GRACE_SECONDS + 1)

    forfeited = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert forfeited.status_code == 200
    payload = forfeited.json()["match"]
    assert payload["status"] == "finished"
    assert payload["result"] == "1-0"
    assert payload["endReason"] == "disconnect"
    assert payload["opponentDisconnectDeadline"] is None
    assert payload["clock"]["runningColor"] is None
    assert payload["ratingChange"] == {"before": 400, "after": 416, "delta": 16}
    assert users_store._memory_users["alice"]["pvp_rating"] == 416
    assert users_store._memory_users["bob"]["pvp_rating"] == 384
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1

    # Releer una partida ya cerrada no duplica liquidación ni cambia el motivo.
    repeated = as_user(client, "alice", "get", f"/api/pvp/matches/{match_id}")
    assert repeated.status_code == 200
    assert repeated.json()["match"]["endReason"] == "disconnect"
    assert users_store._memory_users["alice"]["pvp_rating_games"] == 1
    assert users_store._memory_users["bob"]["pvp_rating_games"] == 1


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


def test_explicit_cancel_and_decline_apply_short_pair_cooldown_only():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    first = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    cancelled = as_user(client, "alice", "post", f"/api/pvp/challenges/{first['id']}/cancel")
    assert cancelled.status_code == 200

    blocked = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert blocked.status_code == 429
    assert int(blocked.headers["retry-after"]) <= pvp_store.CHALLENGE_PAIR_COOLDOWN_SECONDS
    assert "antes de volver a retar" in blocked.json()["detail"]

    lobby_during_cooldown = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    alice_row = next(row for row in lobby_during_cooldown["roster"] if row["username"] == "alice")
    bob_row = next(row for row in lobby_during_cooldown["roster"] if row["username"] == "bob")
    assert "challengeCooldownUntil" not in alice_row
    cooldown_until = datetime.fromisoformat(bob_row["challengeCooldownUntil"].replace("Z", "+00:00"))
    assert cooldown_until > pvp_store.utcnow()

    # El cooldown es por pareja, así que tampoco permite el ping-pong inmediato
    # desde la otra dirección.
    reverse = as_user(client, "bob", "post", "/api/pvp/challenges", json={"opponent": "alice"})
    assert reverse.status_code == 429

    pvp_store._memory_challenges[first["id"]]["cooldown_until"] = pvp_store.utcnow() - timedelta(seconds=1)
    lobby_after_cooldown = as_user(client, "alice", "get", "/api/pvp/lobby").json()
    bob_after = next(row for row in lobby_after_cooldown["roster"] if row["username"] == "bob")
    assert "challengeCooldownUntil" not in bob_after

    second = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert second.status_code == 201
    second_id = second.json()["challenge"]["id"]

    declined = as_user(client, "bob", "post", f"/api/pvp/challenges/{second_id}/decline")
    assert declined.status_code == 200
    blocked_after_decline = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert blocked_after_decline.status_code == 429


def test_roster_leave_cancellation_does_not_create_pair_cooldown():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    assert as_user(client, "alice", "delete", "/api/pvp/roster").status_code == 204
    assert pvp_store._memory_challenges[challenge["id"]]["status"] == "cancelled"
    assert "cooldown_until" not in pvp_store._memory_challenges[challenge["id"]]

    assert as_user(client, "alice", "post", "/api/pvp/roster").status_code == 200
    retried = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"})
    assert retried.status_code == 201


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



def test_starting_handoff_expires_without_result_or_rating():
    client = make_client()
    for user in ("alice", "bob"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    challenge = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    accepted = as_user(client, "bob", "post", f"/api/pvp/challenges/{challenge['id']}/accept")
    assert accepted.status_code == 200
    match = accepted.json()["match"]
    assert match["status"] == "starting"
    assert match["readyDeadline"]

    # Aceptar ya no expulsa del roster: sólo una partida realmente activa lo hace.
    assert {row["username"] for row in as_user(client, "alice", "get", "/api/pvp/lobby").json()["roster"]} == {"alice", "bob"}

    pvp_store._memory_matches[match["id"]]["ready_deadline"] = pvp_store.utcnow() - timedelta(seconds=1)
    expired = as_user(client, "alice", "get", f"/api/pvp/matches/{match['id']}")
    assert expired.status_code == 200
    payload = expired.json()["match"]
    assert payload["status"] == "cancelled"
    assert payload["result"] is None
    assert payload["endReason"] == "handoff_timeout"
    assert payload["ratingChange"] is None
    assert "pvp_rating_games" not in users_store._memory_users["alice"]
    assert "pvp_rating_games" not in users_store._memory_users["bob"]
    assert as_user(client, "alice", "get", "/api/pvp/lobby").json()["activeMatch"] is None


def test_accept_rejects_second_concurrent_duel_for_same_player():
    users_store._memory_users["carol"] = {"username": "carol"}
    client = make_client()
    for user in ("alice", "bob", "carol"):
        assert as_user(client, user, "post", "/api/pvp/roster").status_code == 200

    first = as_user(client, "alice", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]
    second = as_user(client, "carol", "post", "/api/pvp/challenges", json={"opponent": "bob"}).json()["challenge"]

    accepted = as_user(client, "bob", "post", f"/api/pvp/challenges/{first['id']}/accept")
    assert accepted.status_code == 200
    assert accepted.json()["match"]["status"] == "starting"

    duplicate = as_user(client, "bob", "post", f"/api/pvp/challenges/{second['id']}/accept")
    assert duplicate.status_code == 409
    assert "duelo 1v1 en curso" in duplicate.json()["detail"]
