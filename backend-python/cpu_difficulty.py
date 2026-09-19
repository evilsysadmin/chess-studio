"""Human-like CPU difficulty policy built only from factual minimax candidates.

The core evaluator/search remains unchanged. This layer consumes one coherent
root snapshot and may choose a weaker candidate only when its measured loss
stays inside the explicit band for that difficulty. It never samples arbitrary
legal moves.
"""
from __future__ import annotations

from dataclasses import dataclass
import random
import sys
from typing import Optional

import chess

from chess_ai import MATE_SCORE, analyze_move, get_cpu_move, move_to_dict, settings_for_level
from engine_analysis import RootAnalysisSnapshot, RootCandidateAnalysis, analyze_root_iterative


@dataclass(frozen=True)
class DifficultyBand:
    max_loss_cp: float
    mistake_chance: float
    candidate_limit: int
    max_depth: int
    budget_s: float


STRONG_PLAY = DifficultyBand(0.0, 0.0, 1, 0, 0.0)
MATE_GUARD_THRESHOLD = MATE_SCORE - 1000
FACTUAL_BAND_CUTOFF = 45
_DEFAULT_CPU_MOVE = get_cpu_move
_NO_ENGINE_OVERRIDE = object()


def difficulty_band(raw_level: float) -> DifficultyBand:
    """Return a monotonic weakness envelope for normal CPU games."""
    level = max(0, min(100, round(float(raw_level))))
    if level >= FACTUAL_BAND_CUTOFF:
        return STRONG_PLAY

    settings = settings_for_level(level)
    # Keep low-level latency bounded: depth 2 + quiescence is enough to catch
    # immediate tactical disasters while still making beginner play responsive.
    budget = min(0.35, max(0.10, settings.time_budget_s))
    max_depth = min(2, settings.max_depth)

    if level < 10:
        return DifficultyBand(450.0, 0.75, 8, max_depth, budget)
    if level < 20:
        return DifficultyBand(320.0, 0.60, 7, max_depth, budget)
    if level < 30:
        return DifficultyBand(220.0, 0.45, 6, max_depth, budget)
    if level < 40:
        return DifficultyBand(140.0, 0.30, 5, max_depth, budget)
    return DifficultyBand(70.0, 0.15, 4, max_depth, budget)


def _loss_from_best(best_score: float, candidate_score: float, maximizing: bool) -> float:
    raw = (best_score - candidate_score) if maximizing else (candidate_score - best_score)
    return max(0.0, raw)


def _deterministic_fallback(board: chess.Board, level: float) -> Optional[dict]:
    """Fallback that still thinks; never substitute an arbitrary legal move."""
    result = analyze_move(board, min(float(level), 20.0))
    return result.get("move") if isinstance(result, dict) else None


def _explicit_game_engine_override(board: chess.Board, level: float):
    """Honor the established in-process engine injection seam when replaced.

    ``game_api.get_cpu_move`` has long been the boundary used by backend tests
    and diagnostic harnesses to simulate a broken engine. Normal production
    imports point at ``_DEFAULT_CPU_MOVE`` and therefore take the factual policy
    below. If a harness explicitly replaces that provider, preserve the override
    so the shared legal-fallback/error boundary is still exercised truthfully.
    """
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
) -> list[RootCandidateAnalysis]:
    if not snapshot.candidates:
        return []
    best = snapshot.candidates[0]
    alternatives = []
    for candidate in snapshot.candidates[1:]:
        loss = _loss_from_best(best.score, candidate.score, maximizing)
        if loss <= band.max_loss_cp:
            alternatives.append(candidate)
        if len(alternatives) >= max(0, band.candidate_limit - 1):
            break
    return alternatives


def get_factual_difficulty_cpu_move(
    board: chess.Board,
    level: float = 50,
) -> Optional[dict]:
    """Return a CPU move whose intentional weakness is bounded by minimax facts.

    Level >=45 keeps the established strong engine path, already free of
    intentional randomness/noise. Lower levels replace arbitrary-legal roulette
    with a bounded factual candidate policy.
    """

    band = difficulty_band(level)
    if band is STRONG_PLAY:
        return get_cpu_move(board, level)

    explicit_override = _explicit_game_engine_override(board, level)
    if explicit_override is not _NO_ENGINE_OVERRIDE:
        return explicit_override

    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None
    if len(legal_moves) == 1:
        return move_to_dict(board, legal_moves[0])

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
    # Forced mate (for or against the side to move) is not a difficulty toy.
    # Keep the best line instead of randomly delaying/missing mate or walking
    # into a mate sentinel merely to make Beginner look sillier.
    if abs(best.score) >= MATE_GUARD_THRESHOLD:
        return move_to_dict(board, best.move)

    alternatives = _eligible_alternatives(
        snapshot,
        maximizing=board.turn == chess.WHITE,
        band=band,
    )
    if not alternatives or random.random() >= band.mistake_chance:
        return move_to_dict(board, best.move)

    return move_to_dict(board, random.choice(alternatives).move)
