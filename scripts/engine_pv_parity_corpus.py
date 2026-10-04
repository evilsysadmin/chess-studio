#!/usr/bin/env python3
"""Cross-language parity corpus for the engine's proven principal variation.

Hints show the best move with the line the same bounded search proved
(backend-python/engine_analysis: analyze_root_candidates keeps each root
move's immediate reply and extends it only with EXACT transposition entries).
This records, at a fixed depth and without a clock, every root candidate's
score, reply and line for a sample of positions;
backend-go/internal/residentsearch (Candidate.Reply/PV, PrincipalVariation)
must agree.

    python3 scripts/engine_pv_parity_corpus.py           # rewrite the fixture
    python3 scripts/engine_pv_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import chess  # noqa: E402

from engine_analysis import analyze_root_candidates, rank_root_candidates  # noqa: E402

SEARCH_CORPUS = ROOT / "backend-go" / "internal" / "residentsearch" / "testdata" / "python_search_corpus.json"
FIXTURE = ROOT / "backend-go" / "internal" / "residentsearch" / "testdata" / "python_pv_corpus.json"
POSITIONS = 60


def encode(value: float) -> float | str:
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    return value


def build() -> dict:
    source = json.loads(SEARCH_CORPUS.read_text(encoding="utf-8"))["positions"]
    rows = []
    for index, entry in enumerate(source[:POSITIONS]):
        board = chess.Board(entry["fen"])
        depth = 3 if index % 4 else 4
        ranked = rank_root_candidates(board, analyze_root_candidates(board, depth=depth, budget_s=1e9))
        # principal_variation's deepest pass is this same single pass: its
        # line is the best candidate's (rebuilding it would double the cost).
        best = ranked[0] if ranked else None
        rows.append({
            "fen": entry["fen"],
            "depth": depth,
            "candidates": [
                {
                    "move": c.move.uci(),
                    "score": encode(c.score),
                    "reply": c.reply.uci() if c.reply else "",
                    "pv": [m.uci() for m in c.principal_variation],
                }
                for c in ranked
            ],
            "principal": None if best is None else {
                "moves": [m.uci() for m in (best.principal_variation or (best.move,))],
                "score": encode(best.score),
                "depth": depth,
                "candidateCount": len(ranked),
            },
        })
    return {
        "generator": "scripts/engine_pv_parity_corpus.py",
        "python_chess": chess.__version__,
        "positions": rows,
    }


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
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/engine_pv_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
