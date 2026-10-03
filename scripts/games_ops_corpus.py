#!/usr/bin/env python3
"""Cross-language parity corpus for game operation idempotency (Python -> Go).

Retries of create/move/undo are recognised by a fingerprint of the request
(sha256 of Python's json.dumps of the pydantic model) and creates get a
deterministic id (uuid5). While Python and Go both serve games, a retry can
land on either runtime, so Go must produce byte-identical fingerprints and
ids. This records what backend-python/operation_idempotency_core.py and
backend-python/api_models.py produce; backend-go/internal/gameops tests
require the same.

    python3 scripts/games_ops_corpus.py           # rewrite the fixture
    python3 scripts/games_ops_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

from pydantic import ValidationError  # noqa: E402

from api_models import MoveRequest, NewGameRequest  # noqa: E402
from operation_idempotency_core import (  # noqa: E402
    InvalidIdempotencyKey,
    deterministic_game_id,
    model_fingerprint,
    normalize_idempotency_key,
    operation_fingerprint,
)

FIXTURE = ROOT / "backend-go" / "internal" / "gameops" / "testdata" / "python_ops_corpus.json"

NEW_GAME_BODIES = [
    {},
    {"difficulty": 50},
    {"difficulty": 50.0, "color": "b"},
    {"difficulty": 0},
    {"difficulty": 100, "color": "random"},
    {"difficulty": 13.5, "color": "w", "handicap": "queen"},
    {"difficulty": "42"},
    {"difficulty": 1e-05},
    {"difficulty": 0.1},
    {"difficulty": 1e16},
    {"difficulty": 123456789.125},
    {"difficulty": 87, "startingFen": "8/8/8/4k3/8/8/4P3/4K3 w - - 0 1"},
    {"difficulty": 50, "color": "w", "handicap": None, "startingFen": None},
    {"difficulty": 50, "color": "négras"},
    {"difficulty": 50, "color": "w x\"\\/\t"},
    {"difficulty": 50, "color": "😀"},
    {"difficulty": True},
    {"difficulty": -3.25},
    {"difficulty": 50, "extra": "ignored"},
    {"difficulty": 50, "color": "w\x7f\x1fé"},
    {"difficulty": None},
    {"difficulty": "abc"},
    {"handicap": "x" * 17},
    {"startingFen": "8" * 129},
]

MOVE_BODIES = [
    {"from": "e2", "to": "e4"},
    {"from": "e7", "to": "e8", "promotion": "q"},
    {"from": "e7", "to": "e8", "promotion": None},
    {"from": "a7", "to": "a8", "promotion": "N"},
    {"from": "e", "to": "e4"},
    {"from": "e2", "to": "e45"},
    {"to": "e4"},
    {"from": "e7", "to": "e8", "promotion": "qq"},
    {"from": "ñ2", "to": "e4"},
]

UNDO_GAME_IDS = ["g-1", "0f8fad5b-d9cb-469f-a165-70867728950e", "ñandú"]

KEYS = [
    "abcdefgh",
    "  op-2026.10.03:retry_1  ",
    "short",
    "x" * 96,
    "x" * 97,
    "bad key!",
    "",
    "ünïcödé-key",
    "\tkey-with-tab\n",
    "\x1ckey-with-fs\x1f",
    "\x85nel-key-1",
]

USERNAMES = ["alice", "Stan", "ñandú", "u" * 40]


def build() -> dict:
    new_games = []
    for body in NEW_GAME_BODIES:
        try:
            model = NewGameRequest.model_validate(body)
            new_games.append({"body": body, "fingerprint": model_fingerprint(model), "valid": True})
        except ValidationError:
            new_games.append({"body": body, "fingerprint": None, "valid": False})
    moves = []
    for body in MOVE_BODIES:
        try:
            moves.append({"body": body, "fingerprint": model_fingerprint(MoveRequest.model_validate(body)), "valid": True})
        except ValidationError:
            moves.append({"body": body, "fingerprint": None, "valid": False})
    undos = [{"gameId": gid, "fingerprint": operation_fingerprint({"gameId": gid, "kind": "undo"})} for gid in UNDO_GAME_IDS]
    keys = []
    for raw in KEYS:
        try:
            keys.append({"raw": raw, "normalized": normalize_idempotency_key(raw)})
        except InvalidIdempotencyKey:
            keys.append({"raw": raw, "normalized": None})
    ids = [
        {"username": user, "key": key, "id": deterministic_game_id(user, key)}
        for user in USERNAMES
        for key in ("abcdefgh", "op-2026.10.03:retry_1")
    ]
    return {"generator": "scripts/games_ops_corpus.py", "new_games": new_games, "moves": moves,
            "undos": undos, "keys": keys, "ids": ids}


def render(corpus: dict) -> str:
    return json.dumps(corpus, indent=1, sort_keys=True, ensure_ascii=True) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/games_ops_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
