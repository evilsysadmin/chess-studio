#!/usr/bin/env python3
"""Fail-closed live-game probe for an OCI blue/green deploy drill.

The workflow arms this probe only after staging already serves the target SHA,
then forces a second deployment of that same SHA. The probe keeps one sentinel
game alive and sends real CPU turns on disposable sibling games while the edge
switches slots. Any network error or non-2xx response fails the drill.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import pathlib
import time
import urllib.error
import urllib.request

SOURCE = "staging-capacity"


# 60 s / 0.6 s = 100 sentinel reads per minute at most, under the API's
# 120/minute default limit per account.
MIN_INTERVAL_S = 0.6


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"missing {name}")
    return value


def signed_headers(username: str, secret: str) -> dict[str, str]:
    message = f"chess-studio:synthetic:{SOURCE}\x00{username.lower()}".encode()
    signature = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return {
        "X-Chess-Synthetic-Source": SOURCE,
        "X-Chess-Synthetic-Identity": username.lower(),
        "X-Chess-Synthetic-Signature": signature,
    }


def request_json(method: str, url: str, payload=None, token: str = "", extra_headers=None, timeout=20):
    data = None if payload is None else json.dumps(payload).encode()
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "ChessStudioDeployContinuity/1",
    }
    if data is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.monotonic()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8", "replace")
            body = json.loads(raw) if raw else {}
            return int(response.status), body, (time.monotonic() - started) * 1000
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", "replace")
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"detail": raw[:200]}
        return int(exc.code), body, (time.monotonic() - started) * 1000


def expect(status: int, wanted: int, body: dict, action: str) -> None:
    if status != wanted:
        raise RuntimeError(f"{action}: HTTP {status}: {str(body)[:240]}")


def create_game(api: str, token: str) -> dict:
    status, body, _ = request_json(
        "POST", f"{api}/games", {"difficulty": 0, "color": "w"}, token=token
    )
    expect(status, 201, body, "create game")
    if not body.get("id"):
        raise RuntimeError("create game returned no id")
    return body


def move_e2e4(api: str, token: str, game_id: str) -> dict:
    status, body, _ = request_json(
        "POST",
        f"{api}/games/{game_id}/move",
        {"from": "e2", "to": "e4"},
        token=token,
        timeout=30,
    )
    expect(status, 200, body, f"move {game_id}")
    return body


def get_game(api: str, token: str, game_id: str) -> tuple[dict, float]:
    status, body, latency = request_json(
        "GET", f"{api}/games/{game_id}", token=token, timeout=10
    )
    expect(status, 200, body, f"get game {game_id}")
    return body, latency


def wait_file(path: pathlib.Path, timeout: float) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if path.exists():
            return
        time.sleep(0.1)
    raise RuntimeError(f"timed out waiting for {path}")


def self_test() -> None:
    headers = signed_headers("ci_smoke_0123456789abcdef", "test-secret")
    assert headers["X-Chess-Synthetic-Source"] == SOURCE
    assert len(headers["X-Chess-Synthetic-Signature"]) == 64
    assert "test-secret" not in "".join(headers.values())
    print("deploy-continuity probe self-test: OK")


def run(args: argparse.Namespace) -> dict:
    api = required("STAGING_API_URL").rstrip("/")
    username = required("STAGING_E2E_USERNAME").lower()
    password = required("STAGING_E2E_PASSWORD")
    invite = required("STAGING_INVITE_CODE")
    secret = required("STAGING_SYNTHETIC_SECRET")
    if not username.startswith("ci_smoke_") or len(username) != len("ci_smoke_") + 16:
        raise RuntimeError("refusing non-ci_smoke identity")

    register_body = {
        "username": username,
        "password": password,
        "email": f"{username}@example.invalid",
        "inviteCode": invite,
    }
    status, registered, _ = request_json(
        "POST",
        f"{api}/auth/register",
        register_body,
        extra_headers=signed_headers(username, secret),
    )
    expect(status, 201, registered, "register")
    token = str(registered.get("token") or "")
    if not token:
        raise RuntimeError("registration returned no token")

    sentinel = create_game(api, token)
    sentinel_id = str(sentinel["id"])
    sentinel_after_move = move_e2e4(api, token, sentinel_id)
    expected_fen = str(sentinel_after_move.get("fen") or "")
    if not expected_fen:
        raise RuntimeError("sentinel move returned no FEN")

    traffic_ids = [str(create_game(api, token)["id"]) for _ in range(args.traffic_games)]
    pathlib.Path(args.arm_file).write_text(
        json.dumps({"game_id": sentinel_id, "traffic_games": len(traffic_ids)}),
        encoding="utf-8",
    )
    wait_file(pathlib.Path(args.trigger_file), args.arm_timeout)

    probe_count = 0
    move_count = 0
    max_get_ms = 0.0
    traffic_index = 0
    started = time.monotonic()
    done = pathlib.Path(args.done_file)

    while not done.exists():
        if time.monotonic() - started > args.max_seconds:
            raise RuntimeError("deploy drill exceeded max duration before done signal")

        game, latency = get_game(api, token, sentinel_id)
        probe_count += 1
        max_get_ms = max(max_get_ms, latency)
        if str(game.get("id") or "") != sentinel_id:
            raise RuntimeError("sentinel game id changed during deploy")
        if str(game.get("fen") or "") != expected_fen:
            raise RuntimeError("sentinel FEN changed during deploy")

        if traffic_index < len(traffic_ids):
            move_e2e4(api, token, traffic_ids[traffic_index])
            traffic_index += 1
            move_count += 1
        time.sleep(args.interval)

    final_game, final_latency = get_game(api, token, sentinel_id)
    probe_count += 1
    max_get_ms = max(max_get_ms, final_latency)
    if str(final_game.get("id") or "") != sentinel_id:
        raise RuntimeError("sentinel game id changed after deploy")
    if str(final_game.get("fen") or "") != expected_fen:
        raise RuntimeError("sentinel FEN changed after deploy")
    if str(final_game.get("status") or "") != "playing":
        raise RuntimeError(f"sentinel status changed: {final_game.get('status')!r}")
    if probe_count < 3:
        raise RuntimeError(f"too few continuity probes: {probe_count}")
    if move_count < min(2, args.traffic_games):
        raise RuntimeError(f"too few real turns during deploy: {move_count}")

    return {
        "ok": True,
        "game_id": sentinel_id,
        "probes": probe_count,
        "real_turns": move_count,
        "max_get_ms": round(max_get_ms, 1),
        "duration_s": round(time.monotonic() - started, 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--arm-file", default="/tmp/chess-continuity-armed.json")
    parser.add_argument("--trigger-file", default="/tmp/chess-continuity-trigger")
    parser.add_argument("--done-file", default="/tmp/chess-continuity-done")
    parser.add_argument("--result-file", default="/tmp/chess-continuity-result.json")
    parser.add_argument("--traffic-games", type=int, default=8)
    # The sentinel GET shares the API's 120/minute per-user limit with every
    # other read of the probe identity: 0.6 s keeps it under 100/minute even
    # at zero latency (0.35 s tripped the limit whenever latency dropped).
    parser.add_argument("--interval", type=float, default=0.6)
    parser.add_argument("--arm-timeout", type=float, default=120)
    parser.add_argument("--max-seconds", type=float, default=600)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not 2 <= args.traffic_games <= 12:
        raise SystemExit("traffic-games must be 2..12")
    if args.interval < MIN_INTERVAL_S:
        raise SystemExit(f"interval must be at least {MIN_INTERVAL_S}s to stay within the API's 120/minute read limit")
    result = run(args)
    pathlib.Path(args.result_file).write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("DEPLOY_CONTINUITY_OK " + json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
