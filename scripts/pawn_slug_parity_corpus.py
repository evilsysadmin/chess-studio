#!/usr/bin/env python3
"""Cross-language parity corpus for Pawn Slug's stage envelopes.

backend-python/pawn_slug_api.py serves each repository manifest wrapped in
a deterministic envelope (canonical-JSON revision, per-seed instance id).
This records Python's envelopes for every manifest over a spread of seeds;
backend-go/internal/pawnslug must answer the same bytes.

    python3 scripts/pawn_slug_parity_corpus.py           # rewrite the fixture
    python3 scripts/pawn_slug_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import pawn_slug_api as api  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "pawnslug" / "testdata" / "python_pawn_slug_corpus.json"
SEEDS = [0, 1, 5, 7, 1000, 65535, 2**31 - 1]


def build() -> dict:
    stages = sorted(path.stem for path in api.PAWN_SLUG_MANIFEST_ROOT.glob("*.json"))
    return {
        "envelopes": [
            {"stage": stage, "seed": seed, "envelope": api.pawn_slug_stage_envelope(stage, seed)}
            for stage in stages for seed in SEEDS
        ]
    }


def render(corpus: dict) -> str:
    lines = [json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in corpus["envelopes"]]
    return '{"envelopes":[\n' + ",\n".join(lines) + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    text = render(build())
    if args.check:
        current = FIXTURE.read_text(encoding="utf-8") if FIXTURE.exists() else ""
        if current != text:
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/pawn_slug_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
