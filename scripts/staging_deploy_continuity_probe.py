#!/usr/bin/env python3
"""Fail-closed live-game probe for an OCI blue/green deploy drill.

The workflow arms this probe only after staging already serves the target SHA,
then forces a second deployment of that same SHA. The probe keeps one sentinel
game alive and sends real CPU turns on disposable sibling games while the edge
switches slots. It also tracks a real Chronicles checkpoint through the switch.
Unexpected HTTP responses, stale snapshots or duplicate writes fail the drill.
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

import staging_pvp_continuity_probe as pvp

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


def resume_game_once(api: str, token: str, game_id: str, operation_id: str) -> dict:
    # g1-f3 remains a legal white developing move after 1.e4 and the CPU's
    # first reply; the resume must exercise the same server-owned game ID.
    status, body, _ = request_json(
        "POST",
        f"{api}/games/{game_id}/move",
        {"from": "g1", "to": "f3"},
        token=token,
        extra_headers={"Idempotency-Key": operation_id},
        timeout=30,
    )
    expect(status, 200, body, f"resume game {game_id}")
    return body


def assert_resume_consistent(before: dict, after: dict, replay: dict, persisted: dict) -> int:
    game_id = before.get("id")
    original = before.get("history")
    continued = after.get("history")
    if not game_id or not isinstance(original, list) or len(original) < 2:
        raise RuntimeError("sentinel baseline has no authoritative move history")
    if not isinstance(continued, list) or len(continued) != len(original) + 2:
        raise RuntimeError("sentinel resume did not commit exactly one human+CPU turn")
    if continued[:len(original)] != original:
        raise RuntimeError("sentinel previous history changed across deployment")
    expected_fen = after.get("fen")
    if not expected_fen or expected_fen == before.get("fen"):
        raise RuntimeError("sentinel resume did not advance the board")
    for label, snapshot in (("resume", after), ("idempotent replay", replay), ("durable read", persisted)):
        if snapshot.get("id") != game_id:
            raise RuntimeError(f"{label} changed the authoritative game ID")
        if snapshot.get("fen") != expected_fen or snapshot.get("history") != continued:
            raise RuntimeError(f"{label} diverged after the idempotent resume")
        if snapshot.get("status") != "playing":
            raise RuntimeError(f"{label} unexpectedly ended the resumed game")
    return len(continued) - len(original)


def get_game(api: str, token: str, game_id: str) -> tuple[dict, float]:
    status, body, latency = request_json(
        "GET", f"{api}/games/{game_id}", token=token, timeout=10
    )
    expect(status, 200, body, f"get game {game_id}")
    return body, latency


CHRONICLES_MAP = "crypt-eight-squares"
CHRONICLES_BEFORE_FLAGS = {"ciDeployContinuity": "before"}
CHRONICLES_AFTER_FLAGS = {"ciDeployContinuity": "after"}


def chronicles_read(api: str, token: str, run_id: str) -> tuple[dict, float]:
    status, body, latency = request_json(
        "GET", f"{api}/chronicles/runs/{run_id}", token=token, timeout=10
    )
    expect(status, 200, body, f"read Chronicles run {run_id}")
    return body, latency


def chronicles_checkpoint(
    api: str, token: str, run_id: str, version: int, flags: dict
) -> tuple[int, dict]:
    status, body, _ = request_json(
        "PUT", f"{api}/chronicles/runs/{run_id}/checkpoint",
        {
            "expectedWorldVersion": version,
            "currentMapId": CHRONICLES_MAP,
            "worldFlags": flags,
            "inventory": {},
            "quests": {},
            "consumedContentIds": [],
            "claimedRewards": [],
        },
        token=token,
    )
    return status, body


def assert_chronicles_checkpoint(
    run: dict, run_id: str, version: int, flags: dict, phase: str
) -> None:
    if run.get("runId") != run_id:
        raise RuntimeError(f"Chronicles {phase}: run identity changed")
    if run.get("currentMapId") != CHRONICLES_MAP:
        raise RuntimeError(f"Chronicles {phase}: active map changed")
    if run.get("worldVersion") != version:
        raise RuntimeError(f"Chronicles {phase}: world version changed")
    if run.get("worldFlags") != flags:
        raise RuntimeError(f"Chronicles {phase}: world flags changed")


def create_chronicles_sentinel(api: str, token: str) -> str:
    status, created, _ = request_json(
        "POST", f"{api}/chronicles/runs", {"mapId": CHRONICLES_MAP},
        token=token,
        extra_headers={"Idempotency-Key": "deploy-chronicles-sentinel-0001"},
    )
    expect(status, 201, created, "create Chronicles sentinel")
    run_id = str(created.get("runId") or "")
    if not run_id:
        raise RuntimeError("Chronicles sentinel missing runId")
    assert_chronicles_checkpoint(created, run_id, 0, {}, "created")
    checkpoint_status, checkpoint = chronicles_checkpoint(
        api, token, run_id, 0, CHRONICLES_BEFORE_FLAGS
    )
    expect(checkpoint_status, 200, checkpoint, "Chronicles initial checkpoint")
    assert_chronicles_checkpoint(
        checkpoint, run_id, 1, CHRONICLES_BEFORE_FLAGS, "checkpoint"
    )
    stored, _ = chronicles_read(api, token, run_id)
    assert_chronicles_checkpoint(
        stored, run_id, 1, CHRONICLES_BEFORE_FLAGS, "persisted"
    )
    return run_id



# Verify R2 binaries for the *pinned* release of each Godot game. HEAD avoids
# downloading the large WebAssembly and PCK payloads during deploy drills.
_R2_BASE = "https://assets.chess-studio.shadowops.dpdns.org"
_R2_MODES = ("pawn-slug-godot", "chess-football-godot")
_R2_FILES = ("index.html", "index.js", "index.wasm", "index.pck")


def validate_godot_pointer(mode: str, pointer: dict) -> dict:
    import re
    release = pointer.get("release") if isinstance(pointer, dict) else None
    if mode not in _R2_MODES or not isinstance(release, str) or not re.fullmatch(r"[0-9a-f]{16}", release):
        raise RuntimeError("Godot R2 release pointer invalid")
    manifest = pointer.get("files")
    if not isinstance(manifest, dict) or not set(_R2_FILES).issubset(manifest):
        raise RuntimeError("Godot R2 export incomplete")
    files = {}
    for name in _R2_FILES:
        entry = manifest[name]
        key = f"{mode}/releases/{release}/{name}"
        url = f"{_R2_BASE}/{key}"
        if not isinstance(entry, dict) or entry.get("key") != key or entry.get("url") != url:
            raise RuntimeError("Godot R2 asset escapes pinned release")
        size = entry.get("bytes")
        media = entry.get("contentType")
        if type(size) is not int or size <= 0 or not isinstance(media, str) or not media:
            raise RuntimeError("Godot R2 asset metadata invalid")
        files[name] = (url, size, media)
    if pointer.get("index") != files["index.html"][0]:
        raise RuntimeError("Godot R2 index pointer inconsistent")
    return files


def check_godot_pins(pins: dict) -> int:
    checked = 0
    for mode in _R2_MODES:
        for name, (url, size, media) in pins[mode].items():
            request = urllib.request.Request(
                url, method="HEAD",
                headers={"Cache-Control": "no-cache", "User-Agent": "ChessStudio-Deploy-R2-Check/1"},
            )
            with urllib.request.urlopen(request, timeout=12) as response:
                if response.status != 200:
                    raise RuntimeError(f"Godot R2 {mode}/{name} unavailable")
                actual = (response.headers.get("Content-Type") or "").split(";", 1)[0].lower()
                if actual != media.split(";", 1)[0].lower():
                    raise RuntimeError(f"Godot R2 {mode}/{name} MIME mismatch")
                length = response.headers.get("Content-Length")
                coding = response.headers.get("Content-Encoding", "identity").lower()
                if length and coding in ("", "identity") and int(length) != size:
                    raise RuntimeError(f"Godot R2 {mode}/{name} changed size")
            checked += 1
    return checked


def pin_godot_assets() -> dict:
    pins = {}
    for mode in _R2_MODES:
        request = urllib.request.Request(
            f"{_R2_BASE}/{mode}/current.json",
            headers={"Cache-Control": "no-cache", "Accept": "application/json",
                     "User-Agent": "ChessStudio-Deploy-R2-Check/1"},
        )
        with urllib.request.urlopen(request, timeout=12) as response:
            if response.status != 200:
                raise RuntimeError(f"Godot R2 {mode} pointer unavailable")
            raw = response.read(65537)
            if len(raw) > 65536:
                raise RuntimeError("Godot R2 pointer oversized")
        pins[mode] = validate_godot_pointer(mode, json.loads(raw))
    check_godot_pins(pins)
    return pins


def godot_pins_self_test() -> None:
    mode, release = _R2_MODES[0], "a" * 16
    entries = {
        name: {"key": f"{mode}/releases/{release}/{name}",
               "url": f"{_R2_BASE}/{mode}/releases/{release}/{name}",
               "bytes": 42, "contentType": "application/octet-stream"}
        for name in _R2_FILES
    }
    pointer = {"release": release, "files": entries, "index": entries["index.html"]["url"]}
    assert len(validate_godot_pointer(mode, pointer)) == 4
    for broken in (
        {**pointer, "release": "../bad"},
        {**pointer, "index": "https://wrong.invalid"},
        {**pointer, "files": {**entries, "index.pck": {**entries["index.pck"], "bytes": 0}}},
    ):
        try:
            validate_godot_pointer(mode, broken)
        except RuntimeError:
            pass
        else:
            raise AssertionError("invalid Godot R2 release accepted")


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
    before = {"id": "g1", "fen": "prior", "history": ["e4", "e5"], "status": "playing"}
    after = {"id": "g1", "fen": "advanced", "history": ["e4", "e5", "Nf3", "Nc6"], "status": "playing"}
    assert assert_resume_consistent(before, after, dict(after), dict(after)) == 2
    for broken in (
        {**after, "history": after["history"] + ["d4", "d5"]},
        {**after, "fen": "stale"},
        {**after, "id": "wrong-game"},
    ):
        try:
            assert_resume_consistent(before, after, broken, after)
        except RuntimeError:
            pass
        else:
            raise AssertionError("resume invariant accepted a duplicate, stale or wrong-game replay")
    run = {
        "runId": "run1", "currentMapId": CHRONICLES_MAP,
        "worldVersion": 1, "worldFlags": dict(CHRONICLES_BEFORE_FLAGS),
    }
    assert_chronicles_checkpoint(run, "run1", 1, CHRONICLES_BEFORE_FLAGS, "self-test")
    for broken in (
        {**run, "runId": "wrong-run"},
        {**run, "worldVersion": 2},
        {**run, "currentMapId": "wrong-map"},
        {**run, "worldFlags": {}},
    ):
        try:
            assert_chronicles_checkpoint(broken, "run1", 1, CHRONICLES_BEFORE_FLAGS, "self-test")
        except RuntimeError:
            pass
        else:
            raise AssertionError("Chronicles checkpoint invariant accepted a corrupted snapshot")
    godot_pins_self_test()
    pvp.self_test()
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

    godot_pins = pin_godot_assets()
    godot_checks = len(_R2_MODES) * len(_R2_FILES)
    sentinel = create_game(api, token)
    sentinel_id = str(sentinel["id"])
    sentinel_after_move = move_e2e4(api, token, sentinel_id)
    expected_fen = str(sentinel_after_move.get("fen") or "")
    if not expected_fen:
        raise RuntimeError("sentinel move returned no FEN")

    chronicles_id = create_chronicles_sentinel(api, token)
    pvp_sentinel = pvp.create(
        api, username, password, invite, secret, token,
        request_json, expect, signed_headers,
    )
    traffic_ids = [str(create_game(api, token)["id"]) for _ in range(args.traffic_games)]
    pathlib.Path(args.arm_file).write_text(
        json.dumps({
            "game_id": sentinel_id, "chronicles_run_id": chronicles_id,
            "pvp_match_id": pvp_sentinel["id"], "traffic_games": len(traffic_ids),
        }),
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

        # Round-robin game/Chronicles/PvP; each account stays under its read cap.
        if probe_count % 3 == 0:
            game, latency = get_game(api, token, sentinel_id)
            if str(game.get("id") or "") != sentinel_id:
                raise RuntimeError("sentinel game id changed during deploy")
            if str(game.get("fen") or "") != expected_fen:
                raise RuntimeError("sentinel FEN changed during deploy")
        elif probe_count % 3 == 1:
            world, latency = chronicles_read(api, token, chronicles_id)
            assert_chronicles_checkpoint(
                world, chronicles_id, 1, CHRONICLES_BEFORE_FLAGS, "during deploy"
            )
        else:
            latency = pvp.sample(api, pvp_sentinel, request_json, expect)
        probe_count += 1
        max_get_ms = max(max_get_ms, latency)
        if probe_count % 60 == 0:
            godot_checks += check_godot_pins(godot_pins)

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
    final_world, world_latency = chronicles_read(api, token, chronicles_id)
    assert_chronicles_checkpoint(
        final_world, chronicles_id, 1, CHRONICLES_BEFORE_FLAGS, "after deploy"
    )
    max_get_ms = max(max_get_ms, world_latency)
    if probe_count < 6 or pvp_sentinel["reads"] < 2:
        raise RuntimeError(f"too few cross-mode continuity probes: {probe_count}")
    if move_count < min(2, args.traffic_games):
        raise RuntimeError(f"too few real turns during deploy: {move_count}")

    # The game surviving the switch is necessary, but not enough: its very
    # next write must still work and a retry must not replay the move twice.
    resume_operation = f"deploy-continuity-resume-{sentinel_id}"
    resumed = resume_game_once(api, token, sentinel_id, resume_operation)
    replayed = resume_game_once(api, token, sentinel_id, resume_operation)
    persisted, post_resume_latency = get_game(api, token, sentinel_id)
    resumed_plies = assert_resume_consistent(final_game, resumed, replayed, persisted)
    max_get_ms = max(max_get_ms, post_resume_latency)

    # The same world must accept a fresh authoritative checkpoint after the
    # cutover, then reject an out-of-date writer instead of losing progress.
    status, checkpoint = chronicles_checkpoint(
        api, token, chronicles_id, 1, CHRONICLES_AFTER_FLAGS
    )
    expect(status, 200, checkpoint, "Chronicles resumed checkpoint")
    assert_chronicles_checkpoint(
        checkpoint, chronicles_id, 2, CHRONICLES_AFTER_FLAGS, "resumed"
    )
    stale_status, _ = chronicles_checkpoint(
        api, token, chronicles_id, 1, CHRONICLES_BEFORE_FLAGS
    )
    if stale_status != 409:
        raise RuntimeError(f"Chronicles stale checkpoint accepted: HTTP {stale_status}")
    persisted_world, world_latency = chronicles_read(api, token, chronicles_id)
    assert_chronicles_checkpoint(
        persisted_world, chronicles_id, 2, CHRONICLES_AFTER_FLAGS, "durable resume"
    )
    max_get_ms = max(max_get_ms, world_latency)
    godot_checks += check_godot_pins(godot_pins)
    pvp_result = pvp.resume(api, pvp_sentinel, request_json, expect)

    return {
        "ok": True,
        "game_id": sentinel_id,
        "probes": probe_count,
        "real_turns": move_count,
        "resumed_plies": resumed_plies,
        "idempotent_resume": True,
        "chronicles_checkpoint_resumed": True,
        "chronicles_stale_checkpoint_rejected": True,
        "godot_pinned_asset_checks": godot_checks,
        **pvp_result,
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
