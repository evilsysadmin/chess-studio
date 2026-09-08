"""Human-facing root policy for adaptive quick matches.

The chess engine remains responsible for finding the best move. This layer may
occasionally choose a *proven near-best* root alternative when the persisted CPU
profile explicitly enables balancing. It never injects an arbitrary legal move:
alternatives must survive a bounded minimax pass and stay inside a small
centipawn loss budget.
"""
from __future__ import annotations

from dataclasses import dataclass
import random
import time
from typing import Optional

import chess

from chess_ai import (
    INF,
    MATE_SCORE,
    _minimax,
    _order_moves,
    get_cpu_move,
    move_to_dict,
    settings_for_level,
)


@dataclass(frozen=True)
class ConcessionProfile:
    margin_cp: float
    chance: float
    depth: int
    budget_s: float


OFF = ConcessionProfile(0.0, 0.0, 0, 0.0)
CONSISTENCY_MARGIN_CP = 18.0


def concession_profile(raw_level: float) -> ConcessionProfile:
    level = max(0, min(100, round(float(raw_level))))
    if level < 45 or level >= 95:
        return OFF
    if level < 60:
        return ConcessionProfile(55.0, 0.24, 2, 0.18)
    if level < 70:
        return ConcessionProfile(42.0, 0.20, 2, 0.18)
    if level < 80:
        return ConcessionProfile(30.0, 0.16, 2, 0.20)
    if level < 90:
        return ConcessionProfile(18.0, 0.12, 2, 0.20)
    return ConcessionProfile(8.0, 0.06, 2, 0.20)


def _split_cpu_profile(raw_profile: Optional[dict]) -> tuple[bool, Optional[dict]]:
    """Separate the internal balance bit from the existing ghost-style traits."""
    if not isinstance(raw_profile, dict):
        return False, None
    balanced = raw_profile.get("balance") is True
    style = {key: value for key, value in raw_profile.items() if key != "balance"}
    # An adaptive quick match sends only ``balance``. Do not make an empty dict
    # look like a real ghost style to chess_ai.
    return balanced, (style or None)


def _suggested_move(board: chess.Board, suggestion: Optional[dict]) -> Optional[chess.Move]:
    if not isinstance(suggestion, dict):
        return None
    promotion = suggestion.get("promotion") or ""
    try:
        move = chess.Move.from_uci(f"{suggestion.get('from', '')}{suggestion.get('to', '')}{promotion}")
    except ValueError:
        return None
    return move if move in board.legal_moves else None


def _root_candidate_scores(
    board: chess.Board,
    *,
    depth: int,
    deadline: float,
) -> list[tuple[chess.Move, float]]:
    """Score all root moves with the same bounded minimax pass.

    Partial passes are discarded by raising ``TimeoutError``. Comparing a
    candidate against an incomplete root set would make the safety margin lie.
    """
    moves = _order_moves(board, list(board.legal_moves))
    scores: list[tuple[chess.Move, float]] = []
    tt = {}
    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score, _ = _minimax(
                board,
                max(0, depth - 1),
                -INF,
                INF,
                1,
                deadline,
                tt,
            )
        finally:
            board.pop()
        scores.append((move, score))
    return scores


def _score_gap(best_score: float, candidate_score: float, maximizing: bool) -> float:
    return (best_score - candidate_score) if maximizing else (candidate_score - best_score)


def _near_best_candidates(
    scored: list[tuple[chess.Move, float]],
    *,
    base_move: chess.Move,
    base_score: float,
    maximizing: bool,
    margin_cp: float,
) -> list[chess.Move]:
    candidates: list[tuple[float, chess.Move]] = []
    for move, score in scored:
        if move == base_move:
            continue
        gap = _score_gap(base_score, score, maximizing)
        if -CONSISTENCY_MARGIN_CP <= gap <= margin_cp:
            candidates.append((max(0.0, gap), move))
    candidates.sort(key=lambda item: (item[0], item[1].uci()))
    return [move for _, move in candidates[:3]]


def get_balanced_cpu_move(
    board: chess.Board,
    level: float = 50,
    cpu_profile: Optional[dict] = None,
) -> Optional[dict]:
    """Return the engine move, softening only an explicitly balanced profile.

    Manual games, tournaments and actual ghost/mirror profiles remain on the
    established engine path. Forced mates, root disagreements and candidate-pass
    timeouts always fall back to the original deeper engine choice.
    """
    enabled, ghost_style = _split_cpu_profile(cpu_profile)
    suggestion = get_cpu_move(board, level, ghost_style)
    if suggestion is None or not enabled:
        return suggestion

    profile = concession_profile(level)
    if profile.chance <= 0 or random.random() >= profile.chance:
        return suggestion

    base_move = _suggested_move(board, suggestion)
    if base_move is None:
        return suggestion

    settings = settings_for_level(level)
    budget = min(profile.budget_s, max(0.08, settings.time_budget_s * 0.20))
    deadline = time.monotonic() + budget
    try:
        scored = _root_candidate_scores(board, depth=profile.depth, deadline=deadline)
    except TimeoutError:
        return suggestion
    if not scored:
        return suggestion

    maximizing = board.turn == chess.WHITE
    shallow_best = max(score for _, score in scored) if maximizing else min(score for _, score in scored)
    base_score = next((score for move, score in scored if move == base_move), None)
    if base_score is None:
        return suggestion

    if abs(shallow_best) >= MATE_SCORE - 1000 or abs(base_score) >= MATE_SCORE - 1000:
        return suggestion
    if _score_gap(shallow_best, base_score, maximizing) > CONSISTENCY_MARGIN_CP:
        return suggestion

    alternatives = _near_best_candidates(
        scored,
        base_move=base_move,
        base_score=base_score,
        maximizing=maximizing,
        margin_cp=profile.margin_cp,
    )
    if not alternatives:
        return suggestion

    return move_to_dict(board, random.choice(alternatives))
