#!/usr/bin/env python3
"""Cross-language parity corpus for Matthias' human-Elo CPU policy (Python -> Go).

Games against the CPU choose Matthias' move with
backend-python/cpu_difficulty.get_factual_difficulty_cpu_move: a factual root
search whose candidates are filtered and weighted by a difficulty band. The
search already has its own corpus (scripts/engine_parity_corpus.py); this one
pins the policy around it for every difficulty a game can store (0-100, plus
the half levels Python rounds with banker's rounding), the position complexity
it reacts to, and the candidate weights it samples from.
backend-go/internal/residentpolicy and residentmove tests require the same.

    python3 scripts/cpu_policy_parity_corpus.py           # rewrite the fixture
    python3 scripts/cpu_policy_parity_corpus.py --check   # fail if it would change
"""
from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend-python"))

import chess  # noqa: E402

from chess_ai import settings_for_level  # noqa: E402
from cpu_difficulty import (  # noqa: E402
    _imperfect_candidate_weights,
    _loss_from_best,
    difficulty_band,
    elo_for_level,
    position_complexity,
)
from engine_analysis import RootAnalysisSnapshot, RootCandidateAnalysis  # noqa: E402

FIXTURE = ROOT / "backend-go" / "internal" / "residentpolicy" / "testdata" / "python_cpu_policy_corpus.json"

LEVELS = [*range(0, 101), 0.5, 1.5, 12.5, 44.5, 45.5, 69.5, 99.5, -5, 140]
COMPLEXITIES = [0.0, 0.25, 0.5, 0.8, 1.0]
POSITIONS = 120
SEED = 20261004
EXTRA_FENS = [
    chess.STARTING_FEN,
    "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
    "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1",
    "6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1",
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "rnbqkbnr/ppp2ppp/8/3pp3/4P3/5Q2/PPPP1PPP/RNB1KBNR w KQkq - 0 3",
    "7k/8/8/8/8/8/6q1/7K w - - 0 1",
]
# (best, alternatives) score sets in centipawns from white's view.
SCORE_SETS = [
    (35.0, [20.0, 0.0, -40.0, -150.0, -600.0]),
    (-120.0, [-135.0, -200.0, -260.0, -900.0]),
    (900.0, [880.0, 700.0, 300.0]),
    (0.0, [0.0, -5.0, -45.0, -90.0, -175.0, -340.0, -450.0]),
]
WEIGHT_LEVELS = [0, 20, 45, 60, 70, 90, 100]


def random_positions() -> list[str]:
    rng = random.Random(SEED)
    fens: list[str] = []
    while len(fens) < POSITIONS:
        board = chess.Board()
        plies = rng.randint(4, 60)
        for _ in range(plies):
            legal = list(board.legal_moves)
            if not legal or board.is_game_over():
                break
            board.push(rng.choice(sorted(legal, key=lambda move: move.uci())))
        if not board.is_game_over():
            fens.append(board.fen())
    return fens


def band_row(level: float) -> dict:
    band = difficulty_band(level)
    settings = settings_for_level(level)
    return {
        "level": level,
        "elo": elo_for_level(level),
        "targetElo": band.target_elo,
        "maxLossCP": band.max_loss_cp,
        "mistakeChance": band.mistake_chance,
        "candidateLimit": band.candidate_limit,
        "maxDepth": band.max_depth,
        "budgetSeconds": band.budget_s,
        "settingsMaxDepth": settings.max_depth,
        "settingsBudgetSeconds": settings.time_budget_s,
        "lossCaps": [band.max_loss_cp * (1.0 + (0.22 * c)) for c in COMPLEXITIES],
        "mistakeChances": [min(0.85, band.mistake_chance * (0.82 + (0.38 * c))) for c in COMPLEXITIES],
    }


def weight_rows() -> list[dict]:
    rows = []
    for level in WEIGHT_LEVELS:
        band = difficulty_band(level)
        for best, alternatives in SCORE_SETS:
            for maximizing in (True, False):
                for complexity in (0.0, 0.6):
                    candidates = tuple(
                        RootCandidateAnalysis(move=chess.Move.null(), score=score, reply=None)
                        for score in (best, *alternatives)
                    )
                    snapshot = RootAnalysisSnapshot(candidates=candidates, depth=1, candidate_count=len(candidates))
                    weights = _imperfect_candidate_weights(
                        snapshot, snapshot.candidates[1:], maximizing=maximizing, band=band, complexity=complexity,
                    )
                    rows.append({
                        "level": level,
                        "best": best,
                        "alternatives": alternatives,
                        "maximizing": maximizing,
                        "complexity": complexity,
                        "losses": [_loss_from_best(best, s, maximizing) for s in alternatives],
                        "weights": weights,
                    })
    return rows


def build() -> dict:
    fens = [*EXTRA_FENS, *random_positions()]
    return {
        "generator": "scripts/cpu_policy_parity_corpus.py",
        "complexities": COMPLEXITIES,
        "bands": [band_row(level) for level in LEVELS],
        "positions": [{"fen": fen, "complexity": position_complexity(chess.Board(fen))} for fen in fens],
        "weights": weight_rows(),
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
            print(f"{FIXTURE.relative_to(ROOT)} is stale: run python3 scripts/cpu_policy_parity_corpus.py", file=sys.stderr)
            return 1
        print(f"{FIXTURE.relative_to(ROOT)} up to date")
        return 0
    FIXTURE.parent.mkdir(parents=True, exist_ok=True)
    FIXTURE.write_text(text, encoding="utf-8")
    print(f"wrote {FIXTURE.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
