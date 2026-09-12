"""Stable public analysis helpers built on top of the chess engine.

Feature code should import analysis contracts from this module instead of
reaching into ``chess_ai`` private search helpers. Keeping that coupling here
lets the engine internals evolve without spreading private imports through
post-game analysis, training, balanced CPU policy, hints, or puzzle validation.
"""
from __future__ import annotations

import time
from typing import Optional

import chess

import chess_ai as _engine


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
