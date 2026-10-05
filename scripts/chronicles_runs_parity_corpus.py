#!/usr/bin/env python3
"""Cross-language parity corpus for the Chronicles run routes.

Replays request flows against backend-python/chronicles_api.py's router (the
run store in its in-memory mode, which answers like the Mongo path) and
records every answer: create with and without route, Idempotency-Key replays
and conflicts, party levels, checkpoints with their normalization, terminal
states, transitions and the pydantic validation of both bodies and headers.
Seeds, uuid4 run ids and the clock are fixed per step, so
backend-go/internal/gamesapi can replay the same flow and must answer the
same bytes.

    python3 scripts/chronicles_runs_parity_corpus.py           # rewrite the fixture
    python3 scripts/chronicles_runs_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import uuid
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import chronicles_api  # noqa: E402
import chronicles_run_store  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "gamesapi" / "testdata" / "python_chronicles_runs_corpus.json"
START = datetime(2026, 10, 5, 12, 0, 0, 125000)


class Fixed:
    seed = 0
    run_id = ""
    now = START


async def _auth(request: Request):
    raw = request.headers.get("Authorization") or ""
    if not raw.startswith("Bearer "):
        raise HTTPException(401, "auth")
    return raw.removeprefix("Bearer ")


async def _no_collection():
    return None


def _client() -> TestClient:
    chronicles_run_store._memory_runs.clear()
    chronicles_run_store._collection = _no_collection
    chronicles_run_store.utcnow = lambda: Fixed.now
    chronicles_api.secrets.randbelow = lambda _n: Fixed.seed
    chronicles_api.uuid.uuid4 = lambda: uuid.UUID(Fixed.run_id)
    app = FastAPI()
    app.include_router(chronicles_api.build_chronicles_router(auth_dependency=_auth))
    return TestClient(app)


def _body(value) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)


def build() -> dict:
    client = _client()
    steps: list[dict] = []
    run_ids: list[str] = []
    versions: dict[int, int] = {}

    def step(method, path, *, user="alice", body=None, headers=None, seed=0, run=None, label=""):
        Fixed.seed = seed
        Fixed.run_id = str(uuid.UUID(int=len(steps) + 1))
        Fixed.now = START + timedelta(seconds=len(steps), milliseconds=len(steps) * 7)
        if run is not None:
            path = path.replace("{run}", run_ids[run])
        pairs = [list(pair) for pair in (headers.items() if isinstance(headers, dict) else headers or [])]
        request_headers = [("Authorization", f"Bearer {user}"), *map(tuple, pairs)]
        content = None
        if body is not None:
            content = _body(body).encode("utf-8")
            if not any(name.lower() == "content-type" for name, _ in request_headers):
                request_headers.append(("Content-Type", "application/json"))
        response = client.request(method, path, content=content, headers=request_headers)
        raw = response.content
        entry = {
            "label": label, "method": method, "path": path, "user": user, "headers": pairs,
            "body": None if body is None else _body(body), "seed": seed, "runId": Fixed.run_id,
            "now": Fixed.now.isoformat(), "status": response.status_code,
        }
        if len(raw) <= 1500:
            entry["response"] = raw.decode("utf-8")
        else:
            entry["sha256"] = hashlib.sha256(raw).hexdigest()
            entry["length"] = len(raw)
        steps.append(entry)
        try:
            run_ids.append(response.json().get("runId", ""))
        except (ValueError, AttributeError):
            run_ids.append("")
        if response.status_code in (200, 201) and run_ids[-1]:
            versions[len(steps) - 1 if run is None else run] = response.json()["worldVersion"]
        return len(steps) - 1

    post = lambda body, **kw: step("POST", "/api/chronicles/runs", body=body, **kw)  # noqa: E731

    # Creation: authored map, routed expedition, party levels, idempotency.
    crypt = post({"mapId": "crypt-eight-squares"}, seed=417, headers={"Idempotency-Key": "crypt-run-0001"}, label="create map")
    post({"mapId": "crypt-eight-squares"}, seed=999, headers={"Idempotency-Key": "crypt-run-0001"}, label="replay")
    post({"mapId": "ash-vault"}, seed=5, headers={"Idempotency-Key": "crypt-run-0001"}, label="conflict")
    post({"mapId": "crypt-eight-squares"}, user="bob", seed=8, headers={"Idempotency-Key": "crypt-run-0001"}, label="other owner")
    post({"mapId": "crypt-eight-squares"}, seed=9, headers=[("Idempotency-Key", "crypt-run-0001"), ("Idempotency-Key", "second-key-01")], label="first key wins")
    post({"mapId": "ash-vault"}, seed=9, headers=[("X-Chronicles-Party-Level", "3"), ("X-Chronicles-Party-Level", "13")], label="first level wins")
    routed = post({}, seed=2_000_000_011, headers={"Idempotency-Key": " routed-run-01 ", "X-Chronicles-Party-Level": "6"}, label="routed")
    post({}, seed=1, headers={"Idempotency-Key": "routed-run-01"}, label="routed replay")
    post({"mapId": None}, seed=65535, label="no key")
    post({"map_id": "gallery-of-forks"}, seed=7, headers={"X-Chronicles-Party-Level": "12"}, label="field name")
    for level in ["0", "13", "abc", " 4 ", "4.0", "4.5", ""]:
        post({"mapId": "ash-vault"}, seed=3, headers={"X-Chronicles-Party-Level": level}, label=f"party {level!r}")
    for key in ["short", "x" * 97, "bad key!", "ok_key:ok-1.2"]:
        post({"mapId": "ash-vault"}, seed=3, headers={"Idempotency-Key": key}, label=f"key {key!r}")
    for body in ["", "{", "[]", {"mapId": 5}, {"mapId": "Nope"}, {"mapId": "nope"}, {"mapId": "x", "extra": 1}, {"mapId": "ash-vault", "map_id": "x"}]:
        post(body, seed=3, label=f"body {body!r}")
    post({"mapId": 5}, seed=3, headers={"X-Chronicles-Party-Level": "0"}, label="header and body errors")
    post("not json", seed=3, headers={"Content-Type": "text/plain"}, label="plain body")

    # Reads.
    step("GET", "/api/chronicles/runs/{run}", run=crypt, label="get")
    step("GET", "/api/chronicles/runs/{run}", run=crypt, user="bob", label="get other owner")
    step("GET", "/api/chronicles/runs/missing", label="get missing")

    def checkpoint(run, body, user="alice", label=""):
        return step("PUT", "/api/chronicles/runs/{run}/checkpoint", run=run, body=body, user=user, label=label)

    base = {"expectedWorldVersion": 0, "currentMapId": "crypt-eight-squares"}
    checkpoint(crypt, {**base, "worldFlags": {"door": True, "count": 3, "name": "a", "none": None},
                       "inventory": {"key": {"quantity": 1}, "gem": {"quantity": 2, "name": "Gema", "description": "Roja", "extra": 1}},
                       "quests": {"q1": {"status": "active", "order": 2.5}, "q0": {"status": "completed", "title": "T", "objective": "O", "order": 1}},
                       "consumedContentIds": [" a ", "b", "a"], "claimedRewards": ["r1"]}, label="checkpoint")
    checkpoint(crypt, {**base}, label="stale world version")
    checkpoint(crypt, {**base, "expectedWorldVersion": 1, "consumedContentIds": ["c", "a"], "claimedRewards": []}, label="monotonic ids")
    checkpoint(crypt, {**base, "expectedWorldVersion": versions[crypt]}, user="bob", label="checkpoint other owner")
    step("PUT", "/api/chronicles/runs/missing/checkpoint", body=base, label="checkpoint missing")
    checkpoint(crypt, {**base, "expectedWorldVersion": versions[crypt], "currentMapId": "Bad Id"}, label="unsafe target")
    checkpoint(crypt, {**base, "expectedWorldVersion": versions[crypt], "currentMapId": "echo-cistern"}, label="not a transition")
    bad = [
        {"worldFlags": {f"f{i}": 1 for i in range(129)}},
        {"worldFlags": {"big": "x" * 200, **{f"k{i}": "y" * 200 for i in range(90)}}},
        {"worldFlags": {"": 1}}, {"worldFlags": {"k" * 97: 1}}, {"worldFlags": {"f": 1.5}}, {"worldFlags": {"f": [1]}},
        {"worldFlags": {"f": "x" * 257}}, {"worldFlags": {"ñ" * 96: "ü" * 256}},
        {"terminalStatus": "completed"}, {"terminalStatus": "defeated", "worldFlags": {"__chrRuntime.phase": "escaped"}},
        {"inventory": {f"i{i}": {"quantity": 1} for i in range(65)}}, {"inventory": {"i": {"quantity": 1, "description": "d" * 1024}, **{f"j{n}": {"quantity": 1, "description": "d" * 400} for n in range(40)}}},
        {"inventory": {"": {"quantity": 1}}}, {"inventory": {"i": 3}}, {"inventory": {"i": {}}}, {"inventory": {"i": {"quantity": True}}},
        {"inventory": {"i": {"quantity": 0}}}, {"inventory": {"i": {"quantity": 10000}}}, {"inventory": {"i": {"quantity": 2.0}}},
        {"inventory": {"i": {"quantity": 1, "name": ""}}}, {"inventory": {"i": {"quantity": 1, "name": "n" * 161}}}, {"inventory": {"i": {"quantity": 1, "description": 5}}},
        {"quests": {f"q{i}": {"status": "active"} for i in range(65)}}, {"quests": {"q": {"status": "active", "description": "d" * 2048}, **{f"r{n}": {"status": "active", "description": "d" * 700} for n in range(45)}}},
        {"quests": {"": {"status": "active"}}}, {"quests": {"q": []}}, {"quests": {"q": {"status": "done"}}}, {"quests": {"q": {"status": "active", "title": ""}}},
        {"quests": {"q": {"status": "active", "description": "d" * 2049}}}, {"quests": {"q": {"status": "active", "objective": "o" * 1025}}},
        {"quests": {"q": {"status": "active", "order": "1"}}}, {"quests": {"q": {"status": "active", "order": True}}}, {"quests": {"q": {"status": "active", "order": 1000001}}},
        {"quests": {"q": {"status": "active", "order": -1e6}}},
        {"consumedContentIds": ["a"] * 513}, {"consumedContentIds": ["  "]}, {"claimedRewards": ["r" * 129]},
        {"expectedWorldVersion": "$str"}, {"expectedWorldVersion": "$float"}, {"expectedWorldVersion": 2.5}, {"expectedWorldVersion": True},
        {"expectedWorldVersion": -1}, {"expectedWorldVersion": None}, {"expectedWorldVersion": 1e20}, {"expectedWorldVersion": "$spaced"},
        {"currentMapId": ""}, {"currentMapId": "x" * 65}, {"currentMapId": 7}, {"worldFlags": []}, {"inventory": None},
        {"consumedContentIds": "a"}, {"consumedContentIds": [1, "a", None]}, {"terminalStatus": "won"}, {"bogus": 1},
        {"expected_world_version": 2, "current_map_id": "crypt-eight-squares", "expectedWorldVersion": None, "currentMapId": None},
    ]
    for patch in bad:
        body = {**base, "expectedWorldVersion": versions[crypt], **patch}
        lax = {"$str": str(versions[crypt]), "$float": float(versions[crypt]), "$spaced": f" {versions[crypt]} "}
        body["expectedWorldVersion"] = lax.get(body["expectedWorldVersion"], body["expectedWorldVersion"]) if isinstance(body["expectedWorldVersion"], str) else body["expectedWorldVersion"]
        checkpoint(crypt, body, label=f"checkpoint {json.dumps(patch)[:60]}")
    for body in ["", "{", "[]", {}]:
        step("PUT", "/api/chronicles/runs/{run}/checkpoint", run=crypt, body=body, label=f"checkpoint body {body!r}")

    # Walk through an authored transition, then complete the run, replay the
    # same terminal checkpoint and refuse anything else.
    target = sorted(chronicles_api._transition_targets(chronicles_api.load_chronicles_manifest("crypt-eight-squares")[0]))[0]
    checkpoint(crypt, {**base, "expectedWorldVersion": versions[crypt], "currentMapId": target}, label="transition")
    walked = json.loads(steps[-1]["response"])
    consumed = walked["consumedContentIds"]
    finale = {"expectedWorldVersion": versions[crypt], "currentMapId": target, "terminalStatus": "completed",
              "worldFlags": {"__chrRuntime.phase": "escaped"}, "consumedContentIds": [*reversed(consumed), "z"],
              "claimedRewards": walked["claimedRewards"]}
    checkpoint(crypt, finale, label="terminal")
    finale["consumedContentIds"] = [*finale["consumedContentIds"], "a"]
    checkpoint(crypt, finale, label="terminal replay")
    checkpoint(crypt, {**finale, "consumedContentIds": ["y"]}, label="terminal different")
    checkpoint(crypt, {**finale, "claimedRewards": []}, label="terminal different rewards")
    checkpoint(crypt, {**finale, "expectedWorldVersion": finale["expectedWorldVersion"] + 1, "terminalStatus": None}, label="after terminal")

    # The routed expedition walks to its next map through the primary exit.
    routed_run = run_ids[routed]
    route = chronicles_api.chronicles_route_snapshot_for_seed(2_000_000_011)
    entry, following = route["mapIds"][0], route["mapIds"][1]
    rbase = {"expectedWorldVersion": 0, "currentMapId": entry}
    checkpoint(routed, rbase, label="routed stay")
    checkpoint(routed, {**rbase, "expectedWorldVersion": 1, "currentMapId": following}, label="routed advance")
    checkpoint(routed, {**rbase, "expectedWorldVersion": 2, "currentMapId": following, "terminalStatus": "defeated",
                        "worldFlags": {"__chrRuntime.phase": "defeated"}}, label="routed defeated")
    step("GET", f"/api/chronicles/runs/{routed_run}", label="routed get")
    return {"steps": steps}


def render(corpus: dict) -> str:
    rows = ",\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus["steps"])
    return '{"steps":[\n' + rows + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/chronicles_runs_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
