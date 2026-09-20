"""Empirical CPU strength calibration against an external UCI reference engine.

This tool is deliberately manual: CI should not pretend that our internal
0-100 difficulty scale is certified Elo. Point it at a known UCI engine that
supports UCI_LimitStrength/UCI_Elo, run enough games, and keep the JSON report
as evidence before changing rating↔CPU anchors.

Example:
    python scripts/cpu_strength_calibration.py \
      --engine /usr/bin/stockfish \
      --levels 45,60,70,90 \
      --reference-elos 1320,1500,1700 \
      --games 12 \
      --output /tmp/cpu-strength.json
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, Sequence

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend-python"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import chess
import chess.engine

from cpu_difficulty import get_factual_difficulty_cpu_move


OPENINGS: tuple[tuple[str, ...], ...] = (
    ("e2e4", "e7e5", "g1f3", "b8c6"),
    ("d2d4", "d7d5", "c2c4", "e7e6"),
    ("c2c4", "e7e5", "b1c3", "g8f6"),
    ("g1f3", "d7d5", "d2d4", "g8f6"),
    ("e2e4", "c7c5", "g1f3", "d7d6"),
    ("e2e4", "e7e6", "d2d4", "d7d5"),
    ("e2e4", "c7c6", "d2d4", "d7d5"),
    ("d2d4", "g8f6", "c2c4", "g7g6"),
    ("d2d4", "g8f6", "c2c4", "e7e6"),
    ("e2e4", "g8f6", "e4e5", "f6d5"),
    ("c2c4", "c7c5", "b1c3", "b8c6"),
    ("g2g3", "d7d5", "f1g2", "g8f6"),
)


@dataclass(frozen=True)
class CalibrationResult:
    level: int
    reference_elo: int
    games: int
    wins: int
    draws: int
    losses: int
    score: float
    score_ci95_low: float
    score_ci95_high: float
    estimated_rating: int
    estimated_rating_ci95_low: int
    estimated_rating_ci95_high: int
    estimate_method: str = "logistic-smoothed-half-point"
    interval_method: str = "wilson-score-approximation-with-draws-as-half-point"


def parse_int_list(raw: str) -> list[int]:
    values = []
    for item in str(raw).split(","):
        item = item.strip()
        if not item:
            continue
        values.append(int(item))
    if not values:
        raise ValueError("expected at least one integer")
    return values


def score_confidence_interval(wins: int, draws: int, losses: int, z: float = 1.96) -> tuple[float, float]:
    """Approximate confidence interval for match score.

    Draws count as half a point. This is intentionally reported as an
    approximation: chess match scores are not independent Bernoulli trials in
    the strict statistical sense, especially when openings are paired.
    """
    games = wins + draws + losses
    if games <= 0:
        raise ValueError("at least one game is required")
    score = (wins + draws * 0.5) / games
    z2 = z * z
    denominator = 1.0 + z2 / games
    centre = score + z2 / (2.0 * games)
    margin = z * math.sqrt((score * (1.0 - score) + z2 / (4.0 * games)) / games)
    low = max(0.0, (centre - margin) / denominator)
    high = min(1.0, (centre + margin) / denominator)
    return low, high


def rating_from_score(reference_elo: int, score: float) -> int:
    bounded = min(1.0 - 1e-6, max(1e-6, float(score)))
    delta = 400.0 * math.log10(bounded / (1.0 - bounded))
    return round(reference_elo + delta)


def estimate_rating(reference_elo: int, wins: int, draws: int, losses: int) -> int:
    """Estimate rating from match score without infinite 0%/100% outputs.

    Half a virtual point is added across one virtual game. That smoothing is
    intentionally visible in the report and matters when the sample is tiny.
    """
    games = wins + draws + losses
    if games <= 0:
        raise ValueError("at least one game is required")
    points = wins + draws * 0.5
    score = (points + 0.5) / (games + 1.0)
    return rating_from_score(reference_elo, score)


def apply_opening(board: chess.Board, moves: Sequence[str]) -> None:
    for uci in moves:
        move = chess.Move.from_uci(uci)
        if move not in board.legal_moves:
            raise ValueError(f"illegal calibration opening move {uci} in {board.fen()}")
        board.push(move)


def cpu_move(board: chess.Board, level: int) -> chess.Move:
    payload = get_factual_difficulty_cpu_move(board, level)
    if not payload:
        raise RuntimeError("CPU returned no move in a non-terminal position")
    promotion = payload.get("promotion") or ""
    move = chess.Move.from_uci(f"{payload['from']}{payload['to']}{promotion}")
    if move not in board.legal_moves:
        raise RuntimeError(f"CPU returned illegal move {move.uci()} in {board.fen()}")
    return move


def configure_reference_engine(engine: chess.engine.SimpleEngine, elo: int) -> None:
    options = engine.options
    if "UCI_LimitStrength" not in options or "UCI_Elo" not in options:
        raise RuntimeError(
            "reference engine must expose UCI_LimitStrength and UCI_Elo; "
            "use an engine/build with an explicit Elo-limiting contract"
        )

    elo_option = options["UCI_Elo"]
    minimum = int(elo_option.min) if elo_option.min is not None else None
    maximum = int(elo_option.max) if elo_option.max is not None else None
    if minimum is not None and elo < minimum:
        raise ValueError(f"reference Elo {elo} below engine minimum {minimum}")
    if maximum is not None and elo > maximum:
        raise ValueError(f"reference Elo {elo} above engine maximum {maximum}")

    config: dict[str, object] = {"UCI_LimitStrength": True, "UCI_Elo": elo}
    if "Threads" in options:
        config["Threads"] = 1
    if "Hash" in options:
        config["Hash"] = 64
    engine.configure(config)


def app_score(outcome: chess.Outcome | None, app_is_white: bool) -> float:
    if outcome is None or outcome.winner is None:
        return 0.5
    return 1.0 if outcome.winner == app_is_white else 0.0


def play_game(
    engine: chess.engine.SimpleEngine,
    *,
    level: int,
    reference_elo: int,
    game_index: int,
    move_time_s: float,
    max_plies: int,
    seed: int,
) -> float:
    configure_reference_engine(engine, reference_elo)
    board = chess.Board()
    apply_opening(board, OPENINGS[game_index % len(OPENINGS)])
    app_is_white = game_index % 2 == 0
    random.seed(seed + game_index + level * 1009 + reference_elo * 9176)

    for _ in range(max_plies):
        outcome = board.outcome(claim_draw=True)
        if outcome is not None:
            return app_score(outcome, app_is_white)

        app_turn = board.turn == chess.WHITE if app_is_white else board.turn == chess.BLACK
        if app_turn:
            move = cpu_move(board, level)
        else:
            result = engine.play(board, chess.engine.Limit(time=move_time_s))
            move = result.move
            if move is None or move not in board.legal_moves:
                raise RuntimeError("reference engine returned no legal move")
        board.push(move)

    return 0.5


def run_pairing(
    engine: chess.engine.SimpleEngine,
    *,
    level: int,
    reference_elo: int,
    games: int,
    move_time_s: float,
    max_plies: int,
    seed: int,
) -> CalibrationResult:
    scores = [
        play_game(
            engine,
            level=level,
            reference_elo=reference_elo,
            game_index=index,
            move_time_s=move_time_s,
            max_plies=max_plies,
            seed=seed,
        )
        for index in range(games)
    ]
    wins = sum(1 for score in scores if score == 1.0)
    draws = sum(1 for score in scores if score == 0.5)
    losses = games - wins - draws
    points = wins + draws * 0.5
    score = points / games
    score_low, score_high = score_confidence_interval(wins, draws, losses)
    estimate = estimate_rating(reference_elo, wins, draws, losses)
    return CalibrationResult(
        level=level,
        reference_elo=reference_elo,
        games=games,
        wins=wins,
        draws=draws,
        losses=losses,
        score=round(score, 4),
        score_ci95_low=round(score_low, 4),
        score_ci95_high=round(score_high, 4),
        estimated_rating=estimate,
        estimated_rating_ci95_low=rating_from_score(reference_elo, score_low),
        estimated_rating_ci95_high=rating_from_score(reference_elo, score_high),
    )


def calibration_report(
    engine_path: str,
    *,
    levels: Iterable[int],
    reference_elos: Iterable[int],
    games: int,
    move_time_s: float,
    max_plies: int,
    seed: int,
) -> dict:
    if games < 2:
        raise ValueError("use at least 2 games so colors can alternate")
    if move_time_s <= 0:
        raise ValueError("move time must be positive")
    if max_plies < 20:
        raise ValueError("max plies must be at least 20")

    normalized_levels = [max(0, min(100, int(level))) for level in levels]
    normalized_elos = [int(elo) for elo in reference_elos]
    results: list[CalibrationResult] = []

    engine = chess.engine.SimpleEngine.popen_uci(engine_path)
    try:
        for level in normalized_levels:
            for elo in normalized_elos:
                results.append(
                    run_pairing(
                        engine,
                        level=level,
                        reference_elo=elo,
                        games=games,
                        move_time_s=move_time_s,
                        max_plies=max_plies,
                        seed=seed,
                    )
                )
    finally:
        engine.quit()

    return {
        "schemaVersion": 1,
        "kind": "chess-studio-cpu-strength-calibration",
        "warning": (
            "Empirical estimate only. Confidence intervals are approximate; do not "
            "treat small samples or one reference engine as certified Elo."
        ),
        "recommendedMinimumGamesPerPairing": 30,
        "sampleBelowRecommendation": games < 30,
        "enginePath": engine_path,
        "gamesPerPairing": games,
        "referenceMoveTimeSeconds": move_time_s,
        "maxPlies": max_plies,
        "seed": seed,
        "openings": [list(line) for line in OPENINGS],
        "results": [asdict(result) for result in results],
    }


def _self_test() -> None:
    assert parse_int_list("0, 20,100") == [0, 20, 100]
    assert estimate_rating(1200, 5, 0, 5) == 1200
    assert estimate_rating(1200, 7, 0, 3) > 1200
    assert estimate_rating(1200, 3, 0, 7) < 1200
    low, high = score_confidence_interval(5, 0, 5)
    assert low < 0.5 < high
    board = chess.Board()
    apply_opening(board, OPENINGS[0])
    assert board.fullmove_number == 3
    assert board.turn == chess.WHITE


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", help="path to UCI reference engine")
    parser.add_argument("--levels", default="0,20,45,60,70,90,100")
    parser.add_argument("--reference-elos", default="1320,1500,1700")
    parser.add_argument("--games", type=int, default=12)
    parser.add_argument("--move-time", type=float, default=0.10)
    parser.add_argument("--max-plies", type=int, default=240)
    parser.add_argument("--seed", type=int, default=9123)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        _self_test()
        print("cpu strength calibration self-test: OK")
        return 0
    if not args.engine:
        parser.error("--engine is required unless --self-test is used")

    report = calibration_report(
        args.engine,
        levels=parse_int_list(args.levels),
        reference_elos=parse_int_list(args.reference_elos),
        games=args.games,
        move_time_s=args.move_time,
        max_plies=args.max_plies,
        seed=args.seed,
    )
    serialized = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(serialized + "\n", encoding="utf-8")
    print(serialized)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
