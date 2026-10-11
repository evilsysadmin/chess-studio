#!/usr/bin/env python3
"""One real human-vs-human API match across staging blue/green, stdlib-only.

Requires the existing signed ephemeral ci_smoke account; the workflow janitor
must remove both the primary and its deterministic companion even on failure.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import re
import time

CI_USER = re.compile(r"^ci_smoke_[0-9a-f]{16}$")
OPENING = ("e2e4", "e7e5")
RESUME = ("g1f3", "b8c6")


def companion_username(primary: str) -> str:
    if not CI_USER.fullmatch(primary):
        raise ValueError("PvP continuity restricted to ci_smoke identity")
    digest = hashlib.sha256(f"chess-pvp-drill:{primary}".encode()).hexdigest()[:16]
    companion = "ci_smoke_" + digest
    if companion == primary:
        raise ValueError("PvP companion username collision")
    return companion


def assert_match(match: dict, match_id: str, users: set[str], moves: tuple[str, ...], fen: str) -> None:
    if match.get("id") != match_id or {match.get("white"), match.get("black")} != users:
        raise RuntimeError("PvP match identity/players changed during deploy")
    if match.get("status") != "active" or (match.get("clock") or {}).get("id") != "30+0":
        raise RuntimeError("PvP active match or clock lost during deploy")
    history = match.get("history")
    if not isinstance(history, list) or tuple(item.get("uci") for item in history) != moves:
        raise RuntimeError("PvP history lost, reordered or duplicated during deploy")
    if not fen or match.get("fen") != fen:
        raise RuntimeError("PvP board FEN changed during deploy")


def get_match(api, match_id, token, request, expect):
    status, body, elapsed = request(
        "GET", f"{api}/pvp/matches/{match_id}", token=token, timeout=12
    )
    expect(status, 200, body, "PvP match GET")
    match = body.get("match")
    if not isinstance(match, dict):
        raise RuntimeError("PvP GET has no authoritative match")
    return match, elapsed


def play(api, match_id, token, uci, request, expect):
    status, body, _ = request(
        "POST", f"{api}/pvp/matches/{match_id}/move",
        {"from": uci[:2], "to": uci[2:4]}, token=token,
    )
    expect(status, 200, body, "PvP move " + uci)
    match = body.get("match")
    if not isinstance(match, dict):
        raise RuntimeError("PvP move has no authoritative match")
    return match


def create(api, primary, password, invite, secret, primary_token, request, expect, signed_headers):
    companion = companion_username(primary)
    status, data, _ = request(
        "POST", f"{api}/auth/register",
        {
            "username": companion, "password": password,
            "email": companion + "@example.invalid", "inviteCode": invite,
        },
        extra_headers=signed_headers(companion, secret),
    )
    expect(status, 201, data, "register PvP companion")
    other_token = data.get("token")
    if not isinstance(other_token, str) or not other_token:
        raise RuntimeError("PvP companion missing authentication token")

    tokens = {primary: primary_token, companion: other_token}
    for name in (primary, companion):
        status, data, _ = request("POST", f"{api}/pvp/roster", token=tokens[name])
        expect(status, 200, data, "PvP roster " + name)

    status, data, _ = request(
        "POST", f"{api}/pvp/challenges",
        {"opponent": companion}, token=primary_token,
    )
    expect(status, 201, data, "PvP challenge")
    challenge_id = (data.get("challenge") or {}).get("id")
    if not isinstance(challenge_id, str) or not challenge_id:
        raise RuntimeError("PvP challenge returned no ID")
    status, data, _ = request(
        "POST", f"{api}/pvp/challenges/{challenge_id}/accept", token=other_token
    )
    expect(status, 200, data, "PvP accept")
    match = data.get("match") or {}
    if match.get("id") != challenge_id or {match.get("white"), match.get("black")} != set(tokens):
        raise RuntimeError("PvP challenge handoff gave a different match")
    if match.get("status") != "starting":
        raise RuntimeError("PvP match did not begin in starting state")
    for name in (match["white"], match["black"]):
        status, data, _ = request(
            "POST", f"{api}/pvp/matches/{challenge_id}/ready", token=tokens[name]
        )
        expect(status, 200, data, "PvP ready " + name)
        match = data.get("match") or {}
    if match.get("status") != "active" or not match.get("startsAt"):
        raise RuntimeError("PvP dual-ready did not activate")

    try:
        begins = datetime.fromisoformat(match["startsAt"].replace("Z", "+00:00"))
        delay = (begins - datetime.now(timezone.utc)).total_seconds()
    except (ValueError, TypeError) as exc:
        raise RuntimeError("PvP startsAt timestamp malformed") from exc
    if delay > 30:
        raise RuntimeError("PvP initial countdown too long for smoke")
    if delay > 0:
        time.sleep(delay + 0.4)
    for uci, name in zip(OPENING, (match["white"], match["black"])):
        match = play(api, challenge_id, tokens[name], uci, request, expect)
    fen = match.get("fen")
    assert_match(match, challenge_id, set(tokens), OPENING, fen)
    return {
        "id": challenge_id, "white": match["white"], "black": match["black"],
        "tokens": tokens, "users": set(tokens), "moves": OPENING, "fen": fen,
        "reads": 0,
    }


def sample(api, sentinel, request, expect):
    user = sentinel["white"] if sentinel["reads"] % 2 == 0 else sentinel["black"]
    match, ms = get_match(api, sentinel["id"], sentinel["tokens"][user], request, expect)
    assert_match(match, sentinel["id"], sentinel["users"], sentinel["moves"], sentinel["fen"])
    sentinel["reads"] += 1
    return ms


def resume(api, sentinel, request, expect):
    match_id = sentinel["id"]
    white, black = sentinel["tokens"][sentinel["white"]], sentinel["tokens"][sentinel["black"]]
    before, _ = get_match(api, match_id, white, request, expect)
    assert_match(before, match_id, sentinel["users"], OPENING, sentinel["fen"])
    first = play(api, match_id, white, RESUME[0], request, expect)
    assert_match(first, match_id, sentinel["users"], OPENING + RESUME[:1], first.get("fen"))

    # Repeating the same stale white intent must not create an extra ply.
    status, _, _ = request(
        "POST", f"{api}/pvp/matches/{match_id}/move",
        {"from": "g1", "to": "f3"}, token=white,
    )
    if status != 409:
        raise RuntimeError(f"PvP duplicate ply accepted: HTTP {status}")
    second = play(api, match_id, black, RESUME[1], request, expect)
    expected = OPENING + RESUME
    assert_match(second, match_id, sentinel["users"], expected, second.get("fen"))
    for token in (white, black):
        stored, _ = get_match(api, match_id, token, request, expect)
        assert_match(stored, match_id, sentinel["users"], expected, second["fen"])
    return {"pvp_match_resumed_plies": 2, "pvp_duplicate_rejected": True,
            "pvp_reads_during_deploy": sentinel["reads"]}


def self_test() -> None:
    one = "ci_smoke_0123456789abcdef"
    two = companion_username(one)
    assert CI_USER.fullmatch(two) and two != one and two == companion_username(one)
    for bad in ("alice", "ci_smoke_short", "ci_smoke_0123456789abcdeg"):
        try:
            companion_username(bad)
        except ValueError:
            pass
        else:
            raise AssertionError("unsafe PvP companion identity accepted")
    good = {
        "id": "m", "white": one, "black": two, "status": "active",
        "clock": {"id": "30+0"}, "history": [{"uci": move} for move in OPENING],
        "fen": "correct",
    }
    assert_match(good, "m", {one, two}, OPENING, "correct")
    for broken in (
        {**good, "id": "other"}, {**good, "black": "intruder"},
        {**good, "status": "finished"}, {**good, "fen": "stale"},
        {**good, "history": good["history"] + [{"uci": "e2e4"}]},
    ):
        try:
            assert_match(broken, "m", {one, two}, OPENING, "correct")
        except RuntimeError:
            pass
        else:
            raise AssertionError("PvP continuity accepted corrupt snapshot")
    print("staging-pvp-continuity self-test: OK")
