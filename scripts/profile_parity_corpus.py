#!/usr/bin/env python3
"""Cross-language parity corpus for the player profile store.

backend-python/profile_store.py keeps one free-form profile per account with
private per-key revisions so two tabs can change different keys of data
without overwriting each other (GET/PUT/PATCH /api/profile). This replays a
deterministic sequence of operations against Python's store (in-memory mode,
the same merge logic as the Mongo path) and records every result and the
stored document after it; backend-go/internal/profilestore must agree,
including Python's equality (1 == 1.0 == True, dicts ignore key order).

    python3 scripts/profile_parity_corpus.py           # rewrite the fixture
    python3 scripts/profile_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import asyncio
import copy
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))
os.environ.pop("MONGO_URL", None)

import profile_store as pstore  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "profilestore" / "testdata" / "python_profile_corpus.json"
SEED = 20261005
KEYS = ["rating", "army", "tour", "badges", "settings", "streak", "ñandú", "x.y"]
USERS = ["alice", "bob", "legacy", "nometa", "odd"]


def value(rng: random.Random, depth: int = 0):
    kind = rng.choice(["int", "float", "intfloat", "bool", "str", "none", "list", "dict"] if depth < 2 else ["int", "float", "bool", "str"])
    if kind == "int":
        return rng.choice([0, 1, -3, 1200, 2**31, 2**40])
    if kind == "float":
        return rng.choice([0.5, 1.25, -2.0, 1e16, 3.14159])
    if kind == "intfloat":
        return rng.choice([1.0, 0.0, 2.0])
    if kind == "bool":
        return rng.choice([True, False])
    if kind == "str":
        return rng.choice(["", "rey", "♞", "line\nbreak", 'q"uote'])
    if kind == "none":
        return None
    if kind == "list":
        return [value(rng, depth + 1) for _ in range(rng.randint(0, 3))]
    keys = rng.sample(["a", "b", "c", "d"], rng.randint(0, 3))
    return {k: value(rng, depth + 1) for k in keys}


def reorder(rng: random.Random, item):
    """Same value, dict keys shuffled and ints/bools swapped for equal ones."""
    if isinstance(item, dict):
        keys = list(item)
        rng.shuffle(keys)
        return {k: reorder(rng, item[k]) for k in keys}
    if isinstance(item, list):
        return [reorder(rng, v) for v in item]
    if item is True and rng.random() < 0.5:
        return 1
    if isinstance(item, int) and not isinstance(item, bool) and item in (0, 1) and rng.random() < 0.5:
        return float(item)
    return item


def _sorted_next_full_revisions(previous, previous_revisions, replacement):
    """profile_store._next_full_revisions walks a set, so the order in which
    it appends new keys depends on PYTHONHASHSEED. Same rule, sorted walk
    (what Go does), so the corpus is reproducible."""
    before = previous.get("data") if isinstance(previous.get("data"), dict) else {}
    after = replacement.get("data") if isinstance(replacement.get("data"), dict) else {}
    revisions = dict(previous_revisions)
    for key in sorted(set(before) | set(after)):
        if before.get(key) != after.get(key) or (key in before) != (key in after):
            revisions[key] = revisions.get(key, 0) + 1
    return revisions


async def build() -> dict:
    original = pstore._next_full_revisions
    # The replacement must decide exactly like the original on every input.
    probe_rng = random.Random(SEED + 1)
    for _ in range(200):
        before = {"data": {k: value(probe_rng) for k in probe_rng.sample(KEYS, probe_rng.randint(0, 4))}}
        after = {"data": reorder(probe_rng, copy.deepcopy(before["data"]))}
        for k in probe_rng.sample(KEYS, probe_rng.randint(0, 2)):
            after["data"][k] = value(probe_rng)
        revs = {k: probe_rng.randint(0, 3) for k in probe_rng.sample(KEYS, 3)}
        assert original(before, revs, after) == _sorted_next_full_revisions(before, revs, after)
    pstore._next_full_revisions = _sorted_next_full_revisions
    rng = random.Random(SEED)
    pstore._memory_profiles.clear()
    # Pre-existing documents Python may have left: no meta at all, meta
    # without write_revision, odd revision values, data that is not a dict.
    initial = {
        "legacy": {"_id": "legacy", "data": {"rating": 1000, "army": ["p"]}, "theme": "dark"},
        # (A meta without write_revision can only be CAS-matched by Python's
        # in-memory path; on Mongo its PATCH ends in 503, pinned by a Go test.)
        "nometa": {"_id": "nometa", "data": {"tour": {"a": 1}}, "__profile_meta__": {"write_revision": 1}},
        "odd": {"_id": "odd", "data": [1, 2], "__profile_meta__": {"key_revisions": {"rating": 2.7, "army": -4, "badges": True, "x": "s"}, "write_revision": 3.0}},
    }
    for user, doc in initial.items():
        pstore._memory_profiles[user] = copy.deepcopy(doc)
    ops = []
    for _ in range(260):
        user = rng.choice(USERS)
        current = pstore._memory_profiles.get(user)
        kind = rng.choice(["get", "put", "patch", "patch", "patch"])
        if kind == "get":
            result = await pstore.get_profile(user)
            ops.append({"op": "get", "user": user, "result": result})
        elif kind == "put":
            data = {k: value(rng) for k in rng.sample(KEYS, rng.randint(0, 4))}
            if current and isinstance(current.get("data"), dict) and rng.random() < 0.5:
                data = reorder(rng, copy.deepcopy(current["data"]))
                if rng.random() < 0.5 and data:
                    data.pop(next(iter(data)))
            body = {"data": data}
            if rng.random() < 0.3:
                body["revisions"] = {"rating": 99}
            if rng.random() < 0.2:
                body["_id"] = "mallory"
            if rng.random() < 0.3:
                body["theme"] = rng.choice(["light", "dark"])
            result = await pstore.save_profile(user, copy.deepcopy(body))
            ops.append({"op": "put", "user": user, "body": body, "result": result})
        else:
            revisions, _ = pstore._meta(current)
            changes = {}
            for key in rng.sample(KEYS, rng.randint(1, 3)):
                if current and isinstance(current.get("data"), dict) and key in current["data"] and rng.random() < 0.3:
                    changes[key] = None
                else:
                    changes[key] = value(rng)
            expected = {}
            for key in changes:
                roll = rng.random()
                if roll < 0.7:
                    expected[key] = revisions.get(key, 0)
                elif roll < 0.8:
                    expected[key] = float(revisions.get(key, 0)) + 0.4
                elif roll < 0.9:
                    expected[key] = revisions.get(key, 0) + 1
                # else: missing, defaults to 0
            if rng.random() < 0.1:
                expected["unrelated"] = "x"
            result = await pstore.patch_profile(user, copy.deepcopy(changes), copy.deepcopy(expected))
            if isinstance(result, pstore.ProfilePatchConflict):
                result = {"conflict": {"profile": result.profile, "revisions": result.revisions, "conflicts": result.conflicts}}
            ops.append({"op": "patch", "user": user, "changes": changes, "expected": expected, "result": result})
        stored = pstore._memory_profiles.get(user)
        ops[-1]["stored"] = {k: v for k, v in stored.items() if k != "_id"} if stored else None
    pstore._memory_profiles.clear()
    return {"generator": "scripts/profile_parity_corpus.py", "seed": SEED, "initial": initial, "ops": ops}


def render(corpus: dict) -> str:
    return json.dumps(corpus, indent=1, ensure_ascii=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(asyncio.run(build()))
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/profile_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
