"""Stable public analysis helpers built on top of the chess engine.

Feature code should import analysis contracts from this module instead of
reaching into ``chess_ai`` private search helpers. Keeping that coupling here
lets the engine internals evolve without spreading private imports through
post-game analysis, training, balanced CPU policy, hints, or puzzle validation.
"""
from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Optional

import chess

import chess_ai as _engine


@dataclass(frozen=True)
class RootMoveComparison:
    """One factual root comparison produced by a single complete search pass."""

    best_move: chess.Move
    played_move: chess.Move
    best_score: float
    played_score: float
    loss: float
    depth: int
    candidate_count: int


def score_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[tuple[chess.Move, float]]:
    """Score every legal root move with one consistent bounded search pass.

    Exactly one of ``deadline`` or ``budget_s`` must be supplied. The function
    is atomic from the caller's point of view: a timeout raises ``TimeoutError``
    instead of returning a partial candidate set, because comparing scores from
    an incomplete root pass would make downstream factual claims unreliable.

    The supplied board is always restored before returning or raising.
    """
    if depth < 1:
        raise ValueError("depth must be at least 1")
    if (deadline is None) == (budget_s is None):
        raise ValueError("provide exactly one of deadline or budget_s")
    if deadline is None:
        deadline = time.monotonic() + max(0.0, float(budget_s))

    moves = _engine._order_moves(board, list(board.legal_moves))
    scores: list[tuple[chess.Move, float]] = []
    tt = {}
    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score, _ = _engine._minimax(
                board,
                max(0, depth - 1),
                -_engine.INF,
                _engine.INF,
                1,
                deadline,
                tt,
            )
        finally:
            board.pop()
        scores.append((move, score))
    return scores


def compare_root_move(
    board: chess.Board,
    played_move: chess.Move,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> RootMoveComparison:
    """Compare a played move against the best legal root move on one scale.

    ``best_score`` and ``played_score`` always come from the same complete root
    pass at the same depth. ``loss`` is from the perspective of the side to move
    and therefore never negative. This is the primitive post-game, coaching and
    training code should share instead of mixing unrelated evaluation passes.
    """
    if played_move not in board.legal_moves:
        raise ValueError("played_move must be legal in the supplied position")

    scored = score_root_candidates(
        board,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )
    if not scored:
        raise ValueError("position has no legal root moves")

    maximizing = board.turn == chess.WHITE
    best_move, best_score = (max if maximizing else min)(scored, key=lambda item: item[1])
    score_by_move = dict(scored)
    played_score = score_by_move[played_move]
    raw_loss = (best_score - played_score) if maximizing else (played_score - best_score)

    return RootMoveComparison(
        best_move=best_move,
        played_move=played_move,
        best_score=best_score,
        played_score=played_score,
        loss=max(0.0, raw_loss),
        depth=depth,
        candidate_count=len(scored),
    )
