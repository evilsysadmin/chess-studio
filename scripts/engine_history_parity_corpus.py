#!/usr/bin/env python3
"""Cross-language parity corpus for searches that see the game's history.

In a game against the CPU, Python searches a board that carries the whole
move stack, so a line repeating a position from earlier in the game counts as
a draw (backend-python/chess_ai.py: ``len(board.move_stack) >= 8 and
board.is_repetition(3)``, plus fivefold repetition). A FEN alone cannot carry
that. This records Python's fixed-depth search on boards rebuilt from their
moves, in positions where earlier repetitions matter;
backend-go/internal/residentsearch (AnalyzeGame) must agree.

    python3 scripts/engine_history_parity_corpus.py           # rewrite the fixture
    python3 scripts/engine_history_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import chess  # noqa: E402

from chess_ai import LevelSettings, _search  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "residentsearch" / "testdata" / "python_history_corpus.json"
SEED = 20261005
GAMES = 90
SHUFFLE = ["g1f3", "g8f6", "f3g1", "f6g8"]
# Hand-built lines: knight shuffles that make the next return a threefold,
# before and after the eighth ply, and a shuffle broken by a pawn move.
LINES = [
    SHUFFLE,
    SHUFFLE * 2,
    SHUFFLE * 2 + ["g1f3", "g8f6", "f3g1"],
    ["e2e4", "e7e5"] + SHUFFLE * 2,
    ["e2e4", "e7e5"] + SHUFFLE + ["d2d4", "g8f6", "g1f3"],
    ["e2e4", "e7e5", "g1f3", "b8c6", "f3g1", "c6b8", "g1f3", "b8c6", "f3g1"],
    ["d2d4", "d7d5", "c1f4", "c8f5", "f4c1", "f5c8", "c1f4", "c8f5"],
]


def encode(value: float) -> float | str:
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    return value


def shuffled_games(rng: random.Random) -> list[list[str]]:
    """Random openings followed by back-and-forth piece moves."""
    games = []
    for _ in range(GAMES):
        board = chess.Board()
        moves: list[str] = []
        for _ in range(rng.randint(2, 10)):
            legal = sorted(board.legal_moves, key=lambda move: move.uci())
            if not legal:
                break
            move = rng.choice(legal)
            board.push(move)
            moves.append(move.uci())
        for _ in range(rng.randint(4, 14)):
            if board.is_game_over(claim_draw=False):
                break
            legal = sorted(board.legal_moves, key=lambda move: move.uci())
            back = [m for m in legal if len(board.move_stack) >= 2 and m.to_square == board.move_stack[-2].from_square
                    and m.from_square == board.move_stack[-2].to_square]
            quiet = [m for m in legal if not board.is_capture(m) and board.piece_type_at(m.from_square) != chess.PAWN]
            pool = back if back and rng.random() < 0.7 else (quiet or legal)
            move = rng.choice(pool)
            board.push(move)
            moves.append(move.uci())
        if not board.is_game_over(claim_draw=False) and any(board.legal_moves):
            games.append(moves)
    return games


def build() -> dict:
    rng = random.Random(SEED)
    rows = []
    differs = 0
    for index, moves in enumerate(LINES + shuffled_games(rng)):
        board = chess.Board()
        for uci in moves:
            board.push_uci(uci)
        depth = 3 if index % 2 == 0 else 2
        settings = LevelSettings(100, depth, 0.0, 0.0, 1e9)
        move, score = _search(board.copy(), settings)
        _fen_move, fen_score = _search(chess.Board(board.fen()), settings)
        if fen_score != score:
            differs += 1
        rows.append({
            "moves": moves,
            "fen": board.fen(),
            "depth": depth,
            "score": encode(score),
            "move": move.uci() if move else "",
            "fenOnlyScore": encode(fen_score),
        })
    return {
        "generator": "scripts/engine_history_parity_corpus.py",
        "python_chess": chess.__version__,
        "seed": SEED,
        "historySensitive": differs,
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
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/engine_history_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
