#!/usr/bin/env python3
"""Cross-language parity corpus for POST /api/analyze-move.

Records the whole payload of move_analysis_service.analyze_move_payload (the
factual comparison of a played move against the best one: suggested/played
moves, replies, proven lines, runner-up, loss and the legacy static
evalAfterPlayed) for a sample of positions and played moves. The factual
search runs without a clock at a fixed depth so the corpus is deterministic;
backend-go/internal/gamesapi (FactualMoveAnalysis) must agree.

    python3 scripts/engine_move_analysis_parity_corpus.py           # rewrite the fixture
    python3 scripts/engine_move_analysis_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import chess  # noqa: E402

import move_analysis_service  # noqa: E402
from engine_analysis import build_factual_move_analysis  # noqa: E402

SEARCH_CORPUS = ROOT / "backend-go" / "internal" / "residentsearch" / "testdata" / "python_search_corpus.json"
FIXTURE = ROOT / "backend-go" / "internal" / "gamesapi" / "testdata" / "python_move_analysis_corpus.json"
POSITIONS = 48


def build() -> dict:
    source = json.loads(SEARCH_CORPUS.read_text(encoding="utf-8"))["positions"]
    rows = []
    for index, entry in enumerate(source[:POSITIONS]):
        board = chess.Board(entry["fen"])
        legal = sorted(board.legal_moves, key=lambda move: move.uci())
        if not legal or board.is_game_over(claim_draw=True):
            continue
        depth = 2 if index % 3 else 3
        # Alternate between a quiet-looking and an arbitrary played move.
        played = legal[(index * 7) % len(legal)]

        def fixed(board_, move_, *, level, max_depth):  # noqa: ARG001
            return build_factual_move_analysis(board_, move_, level=100, max_depth=depth, budget_s=1e9)

        original = move_analysis_service.build_factual_move_analysis
        move_analysis_service.build_factual_move_analysis = fixed
        try:
            payload, _primary = move_analysis_service.analyze_move_payload(
                board,
                from_square=chess.square_name(played.from_square),
                to=chess.square_name(played.to_square),
                promotion=chess.piece_symbol(played.promotion) if played.promotion else None,
                level=100,
            )
        finally:
            move_analysis_service.build_factual_move_analysis = original
        rows.append({"fen": entry["fen"], "played": played.uci(), "depth": depth, "payload": payload})
    return {
        "generator": "scripts/engine_move_analysis_parity_corpus.py",
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
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/engine_move_analysis_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
