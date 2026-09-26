"""Human-Elo CPU policy built from factual root candidates.

The search still owns legality and evaluation. This layer models how a human of
an approximate Elo selects among plausible candidates: stronger players inspect
more deeply, choose the best move more often, and make smaller errors. Complex
positions widen the error distribution slightly. CPU strength never changes
inside an active game; the caller passes the fixed difficulty chosen at launch.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
import random
import sys
from typing import Optional

import chess

from chess_ai import MATE_SCORE, analyze_move, get_cpu_move, move_to_dict, settings_for_level
from engine_analysis import RootAnalysisSnapshot, RootCandidateAnalysis, analyze_root_iterative


@dataclass(frozen=True)
class DifficultyBand:
    target_elo: int
    max_loss_cp: float
    mistake_chance: float
    candidate_limit: int
    max_depth: int
    budget_s: float


CPU_ELO_ANCHORS = (
    (0, 350),
    (20, 850),
    (45, 1200),
    (60, 1375),
    (70, 1450),
    (90, 1600),
    (100, 1800),
)
MATE_GUARD_THRESHOLD = MATE_SCORE - 1000
_DEFAULT_CPU_MOVE = get_cpu_move
_NO_ENGINE_OVERRIDE = object()


def elo_for_level(raw_level: float) -> int:
    level = max(0.0, min(100.0, float(raw_level)))
    for index in range(1, len(CPU_ELO_ANCHORS)):
        right_level, right_elo = CPU_ELO_ANCHORS[index]
        left_level, left_elo = CPU_ELO_ANCHORS[index - 1]
        if level <= right_level:
            span = right_level - left_level or 1
            progress = (level - left_level) / span
            return round(left_elo + (right_elo - left_elo) * progress)
    return CPU_ELO_ANCHORS[-1][1]


def _interpolate_for_elo(target_elo: int, points: tuple[tuple[int, float], ...]) -> float:
    elo = max(points[0][0], min(points[-1][0], int(target_elo)))
    for index in range(1, len(points)):
        right_elo, right_value = points[index]
        left_elo, left_value = points[index - 1]
        if elo <= right_elo:
            span = right_elo - left_elo or 1
            progress = (elo - left_elo) / span
            return left_value + ((right_value - left_value) * progress)
    return points[-1][1]


def difficulty_band(raw_level: float) -> DifficultyBand:
    """Translate legacy 0-100 difficulty into one approximate human-Elo policy."""
    level = max(0, min(100, round(float(raw_level))))
    target_elo = elo_for_level(level)
    settings = settings_for_level(level)

    max_loss_cp = _interpolate_for_elo(target_elo, (
        (350, 450.0),
        (700, 340.0),
        (900, 250.0),
        (1100, 175.0),
        (1300, 125.0),
        (1500, 90.0),
        (1650, 65.0),
        (1800, 45.0),
    ))
    mistake_chance = _interpolate_for_elo(target_elo, (
        (350, 0.74),
        (700, 0.62),
        (900, 0.49),
        (1100, 0.38),
        (1300, 0.28),
        (1500, 0.19),
        (1650, 0.12),
        (1800, 0.07),
    ))
    candidate_limit = round(_interpolate_for_elo(target_elo, (
        (350, 8.0),
        (900, 7.0),
        (1300, 6.0),
        (1600, 5.0),
        (1800, 4.0),
    )))

    # Search is only the factual oracle. We do not need maximum-strength search
    # at every Elo, but stronger opponents should calculate farther before the
    # human policy chooses among candidates.
    max_depth = min(4, settings.max_depth)
    budget_s = min(0.85, max(0.12, settings.time_budget_s * 0.45))
    return DifficultyBand(
        target_elo=target_elo,
        max_loss_cp=max_loss_cp,
        mistake_chance=mistake_chance,
        candidate_limit=max(2, candidate_limit),
        max_depth=max_depth,
        budget_s=budget_s,
    )


def position_complexity(board: chess.Board) -> float:
    """Cheap 0..1 proxy for how hard the current choice is for a human."""
    legal = list(board.legal_moves)
    if not legal:
        return 0.0
    captures = sum(1 for move in legal if board.is_capture(move))
    checks = sum(1 for move in legal if board.gives_check(move))
    forcing = captures + (checks * 1.5)
    branching = min(1.0, max(0.0, (len(legal) - 18) / 24))
    forcing_ratio = min(1.0, forcing / max(4.0, len(legal) * 0.35))
    in_check = 1.0 if board.is_check() else 0.0
    return min(1.0, (branching * 0.45) + (forcing_ratio * 0.40) + (in_check * 0.15))


def _loss_from_best(best_score: float, candidate_score: float, maximizing: bool) -> float:
    raw = (best_score - candidate_score) if maximizing else (candidate_score - best_score)
    return max(0.0, raw)


def _deterministic_fallback(board: chess.Board, level: float) -> Optional[dict]:
    """Fallback that still thinks; never substitute arbitrary legal roulette."""
    result = analyze_move(board, min(float(level), 35.0))
    return result.get("move") if isinstance(result, dict) else None


def _explicit_game_engine_override(board: chess.Board, level: float):
    """Honor the established in-process engine injection seam used by tests."""
    game_api = sys.modules.get("game_api")
    provider = getattr(game_api, "get_cpu_move", None) if game_api is not None else None
    if provider is None or provider is _DEFAULT_CPU_MOVE:
        return _NO_ENGINE_OVERRIDE
    return provider(board, level)


def _eligible_alternatives(
    snapshot: RootAnalysisSnapshot,
    *,
    maximizing: bool,
    band: DifficultyBand,
    complexity: float = 0.0,
) -> list[RootCandidateAnalysis]:
    if not snapshot.candidates:
        return []
    best = snapshot.candidates[0]
    # Hard positions may admit a slightly larger human error, but never enough
    # to turn the policy into random legal-move roulette.
    effective_loss_cap = band.max_loss_cp * (1.0 + (0.22 * max(0.0, min(1.0, complexity))))
    alternatives = []
    for candidate in snapshot.candidates[1:]:
        loss = _loss_from_best(best.score, candidate.score, maximizing)
        if loss <= effective_loss_cap:
            alternatives.append(candidate)
        if len(alternatives) >= max(0, band.candidate_limit - 1):
            break
    return alternatives


def _imperfect_candidate_weights(
    snapshot: RootAnalysisSnapshot,
    alternatives: list[RootCandidateAnalysis],
    *,
    maximizing: bool,
    band: DifficultyBand,
    complexity: float = 0.0,
) -> list[float]:
    """Prefer human-sized inaccuracies over spectacular self-destruction."""
    if not alternatives:
        return []
    best = snapshot.candidates[0]
    strength = max(0.0, min(1.0, (band.target_elo - 350) / 1450))
    temperature = max(
        14.0,
        band.max_loss_cp * (0.64 - (0.38 * strength)) * (1.0 + (0.20 * complexity)),
    )
    return [
        max(1e-6, math.exp(-_loss_from_best(best.score, candidate.score, maximizing) / temperature))
        for candidate in alternatives
    ]


def get_factual_difficulty_cpu_move(
    board: chess.Board,
    level: float = 50,
) -> Optional[dict]:
    """Choose a factual candidate with a human-like error profile for the Elo.

    Unlike the old policy, this remains active above level 45. A 1500-ish
    Matthias therefore does not become perfect merely because the minimax search
    found the best move; he still has a small, bounded chance of choosing a
    plausible inferior candidate. Forced mates are never intentionally missed.
    """

    explicit_override = _explicit_game_engine_override(board, level)
    if explicit_override is not _NO_ENGINE_OVERRIDE:
        return explicit_override

    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None
    if len(legal_moves) == 1:
        return move_to_dict(board, legal_moves[0])

    band = difficulty_band(level)
    complexity = position_complexity(board)

    try:
        snapshot = analyze_root_iterative(
            board,
            max_depth=band.max_depth,
            budget_s=band.budget_s,
        )
    except TimeoutError:
        return _deterministic_fallback(board, level)

    if not snapshot.candidates:
        return None

    best = snapshot.candidates[0]
    if abs(best.score) >= MATE_GUARD_THRESHOLD:
        return move_to_dict(board, best.move)

    alternatives = _eligible_alternatives(
        snapshot,
        maximizing=board.turn == chess.WHITE,
        band=band,
        complexity=complexity,
    )
    effective_mistake_chance = min(
        0.85,
        band.mistake_chance * (0.82 + (0.38 * complexity)),
    )
    if not alternatives or random.random() >= effective_mistake_chance:
        return move_to_dict(board, best.move)

    weights = _imperfect_candidate_weights(
        snapshot,
        alternatives,
        maximizing=board.turn == chess.WHITE,
        band=band,
        complexity=complexity,
    )
    chosen = random.choices(alternatives, weights=weights, k=1)[0]
    return move_to_dict(board, chosen.move)
