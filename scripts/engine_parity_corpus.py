#!/usr/bin/env python3
"""Cross-language parity corpora for the CPU engine (Python -> Go).

The Go engine (backend-go/internal/residenteval, residentsearch) is a port of
backend-python/chess_ai.py. This script builds a deterministic set of FEN
positions (seeded random and capture-biased playouts, so the corpus reaches
middlegames, endgames, checkmates, stalemates and draws) and records:

- chess_ai.evaluate_board for every position; the Go test
  TestEvaluateFENMatchesPythonCorpus asserts the same number;
- for a seeded sample of live positions, chess_ai._search at a fixed depth
  with no randomness and no clock: the position value and Python's move. The
  Go test TestAnalyzeFENMatchesPythonSearchCorpus asserts the same value and
  that Python's move is one of Go's equally best moves (ties may break
  differently).

    python3 scripts/engine_parity_corpus.py           # rewrite the fixture
    python3 scripts/engine_parity_corpus.py --check   # fail if it would change

--check runs in CI next to the Go tests, so a change to the Python evaluation
cannot silently drift from the Go port while both runtimes exist.
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

from chess_ai import LevelSettings, _search, evaluate_board  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "residenteval" / "testdata" / "python_eval_corpus.json"
SEARCH_FIXTURE = ROOT / "backend-go" / "internal" / "residentsearch" / "testdata" / "python_search_corpus.json"
SEARCH_POSITIONS = 240
# Always searched, beyond the random sample: en passant is a capture the Go
# chess library tags separately, and a quiescence that missed it diverged.
SEARCH_EXTRA_FENS = [
    "r1b1kbnr/1ppp2pp/2n5/p3q1Q1/4p3/BP2P3/P1PP1PPP/RN2KBNR w KQkq - 4 9",
    "r1b1kbnr/1ppp2pp/8/p3n3/4p3/BP2P3/P1PP1PPP/RN2KBNR w KQkq - 0 10",
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
    "4k3/8/8/3Pp3/8/8/8/4K3 w - e6 0 1",
    "4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1",
    "4k3/8/8/2pP4/8/8/8/4K2R w K c6 0 1",
]
SEED = 20261003
PLAYOUTS = 160
MAX_PLIES = 220

# Hand-picked positions the playouts are unlikely to reach.
EXTRA_FENS = [
    chess.STARTING_FEN,
    "7k/5Q2/6K1/8/8/8/8/8 b - - 0 1",            # stalemate
    "6rk/6pp/8/8/8/8/8/R5K1 w - - 0 1",           # back-rank mate available
    "R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1",          # checkmated
    "8/8/8/4k3/8/8/8/4K3 w - - 0 1",              # bare kings
    "8/8/8/4k3/8/8/8/2B1K3 w - - 0 1",            # K+B vs K
    "8/8/8/4k3/8/8/8/2N1K3 b - - 0 1",            # K+N vs K
    "8/8/8/4k3/8/8/4P3/4K3 w - - 99 80",          # 50-move clock about to expire
    "8/8/8/4k3/8/8/4P3/4K3 w - - 100 80",         # 50-move rule reached
    "8/8/8/4k3/8/8/4P3/4K3 w - - 150 120",        # 75-move rule
    "4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1",           # castling rights only
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",  # en passant
    "8/P7/8/8/8/8/k7/6K1 w - - 0 1",              # promotion race
    "8/8/8/8/8/5k2/8/5K1q w - - 0 1",
]


def playout_fens(rng: random.Random) -> list[str]:
    fens: list[str] = []
    for index in range(PLAYOUTS):
        board = chess.Board()
        capture_bias = (index % 4) / 4  # 0, .25, .5, .75: reach every phase
        sample_every = rng.randint(3, 7)
        for ply in range(MAX_PLIES):
            moves = list(board.legal_moves)
            if not moves:
                break
            captures = [move for move in moves if board.is_capture(move)]
            pool = captures if captures and rng.random() < capture_bias else moves
            board.push(rng.choice(pool))
            if ply % sample_every == 0 or board.is_game_over(claim_draw=False):
                fens.append(board.fen())
            if board.is_game_over(claim_draw=False):
                break
    return fens


def encode(value: float) -> float | str:
    if math.isinf(value):
        return "inf" if value > 0 else "-inf"
    return value


def build_search(eval_corpus: dict) -> dict:
    live = [p["fen"] for p in eval_corpus["positions"]
            if not chess.Board(p["fen"]).is_game_over(claim_draw=False)]
    rng = random.Random(SEED + 1)
    rows = []
    sample = SEARCH_EXTRA_FENS + [fen for fen in rng.sample(live, SEARCH_POSITIONS) if fen not in SEARCH_EXTRA_FENS]
    for index, fen in enumerate(sample):
        depth = 3 if index % 2 == 0 else 2
        # Level 100 settings with the randomness, noise and clock removed:
        # a pure fixed-depth search, comparable across runtimes.
        move, score = _search(chess.Board(fen), LevelSettings(100, depth, 0.0, 0.0, 1e9))
        rows.append({"fen": fen, "depth": depth, "score": encode(score), "move": move.uci() if move else ""})
    return {
        "generator": "scripts/engine_parity_corpus.py",
        "python_chess": chess.__version__,
        "seed": SEED + 1,
        "positions": rows,
    }


def build() -> dict:
    rng = random.Random(SEED)
    seen: set[str] = set()
    positions = []
    for fen in EXTRA_FENS + playout_fens(rng):
        if fen in seen:
            continue
        seen.add(fen)
        # A FEN carries no move stack, exactly like the Go side receives it.
        positions.append({"fen": fen, "eval": encode(evaluate_board(chess.Board(fen)))})
    return {
        "generator": "scripts/engine_parity_corpus.py",
        "python_chess": chess.__version__,
        "seed": SEED,
        "positions": positions,
    }


def render(corpus: dict) -> str:
    # One position per line: compact, yet a drift shows as a readable diff.
    head = {key: value for key, value in corpus.items() if key != "positions"}
    lines = [json.dumps(row, sort_keys=True, separators=(",", ":")) for row in corpus["positions"]]
    body = json.dumps(head, sort_keys=True)[:-1]
    return body + ', "positions": [\n' + ",\n".join(lines) + "\n]}\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    eval_corpus = build()
    outputs = {FIXTURE: render(eval_corpus), SEARCH_FIXTURE: render(build_search(eval_corpus))}
    stale = []
    for path, text in outputs.items():
        count = text.count('"fen"')
        if args.check:
            current = path.read_text(encoding="utf-8") if path.exists() else ""
            if current != text:
                stale.append(str(path.relative_to(ROOT)))
            else:
                print(f"{path.relative_to(ROOT)} up to date ({count} positions)")
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"wrote {path.relative_to(ROOT)} ({count} positions)")
    if stale:
        print("stale parity corpus: run python3 scripts/engine_parity_corpus.py\n  " + "\n  ".join(stale), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
