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
class RootCandidateAnalysis:
    """Score and immediate best reply for one legal root move."""

    move: chess.Move
    score: float
    reply: Optional[chess.Move]


@dataclass(frozen=True)
class RootMoveComparison:
    """One factual root comparison produced by a single complete search pass."""

    best_move: chess.Move
    played_move: chess.Move
    best_score: float
    played_score: float
    best_reply: Optional[chess.Move]
    played_reply: Optional[chess.Move]
    loss: float
    depth: int
    candidate_count: int


def analyze_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[RootCandidateAnalysis]:
    """Analyze every legal root move with one consistent bounded search pass.

    At depth 2 or greater, ``reply`` is the engine's best immediate response
    from the child position. Keeping that reply beside the score lets post-game
    consumers explain the first factual consequence without launching a second,
    potentially contradictory search.

    Exactly one of ``deadline`` or ``budget_s`` must be supplied. The function
    is atomic from the caller's point of view: a timeout raises ``TimeoutError``
    instead of returning a partial candidate set. The supplied board is always
    restored before returning or raising.
    """
    if depth < 1:
        raise ValueError("depth must be at least 1")
    if (deadline is None) == (budget_s is None):
        raise ValueError("provide exactly one of deadline or budget_s")
    if deadline is None:
        deadline = time.monotonic() + max(0.0, float(budget_s))

    moves = _engine._order_moves(board, list(board.legal_moves))
    candidates: list[RootCandidateAnalysis] = []
    tt = {}
    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score, reply = _engine._minimax(
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
        candidates.append(RootCandidateAnalysis(move=move, score=score, reply=reply))
    return candidates


def score_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[tuple[chess.Move, float]]:
    """Compatibility score facade over :func:`analyze_root_candidates`."""
    return [
        (candidate.move, candidate.score)
        for candidate in analyze_root_candidates(
            board,
            depth=depth,
            deadline=deadline,
            budget_s=budget_s,
        )
    ]


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
    and therefore never negative. At depth 2+, the comparison also carries the
    best immediate reply after each line, giving consumers a legal two-ply
    counterfactual without a second analysis pass.
    """
    if played_move not in board.legal_moves:
        raise ValueError("played_move must be legal in the supplied position")

    analyzed = analyze_root_candidates(
        board,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )
    if not analyzed:
        raise ValueError("position has no legal root moves")

    maximizing = board.turn == chess.WHITE
    best = (max if maximizing else min)(analyzed, key=lambda item: item.score)
    by_move = {candidate.move: candidate for candidate in analyzed}
    played = by_move[played_move]
    raw_loss = (best.score - played.score) if maximizing else (played.score - best.score)

    return RootMoveComparison(
        best_move=best.move,
        played_move=played.move,
        best_score=best.score,
        played_score=played.score,
        best_reply=best.reply,
        played_reply=played.reply,
        loss=max(0.0, raw_loss),
        depth=depth,
        candidate_count=len(analyzed),
    )


def compare_root_move_iterative(
    board: chess.Board,
    played_move: chess.Move,
    *,
    max_depth: int,
    budget_s: float,
) -> RootMoveComparison:
    """Return the deepest complete factual comparison within one time budget.

    A deeper partial pass is never exposed. If depth 1 completes and depth 2
    times out, callers receive the complete depth-1 comparison. If no depth can
    complete, ``TimeoutError`` is raised so consumers can fall back without
    presenting an incomplete or internally inconsistent claim.
    """
    if max_depth < 1:
        raise ValueError("max_depth must be at least 1")
    if played_move not in board.legal_moves:
        raise ValueError("played_move must be legal in the supplied position")

    deadline = time.monotonic() + max(0.0, float(budget_s))
    completed: Optional[RootMoveComparison] = None
    for depth in range(1, max_depth + 1):
        if time.monotonic() >= deadline:
            break
        try:
            candidate = compare_root_move(
                board,
                played_move,
                depth=depth,
                deadline=deadline,
            )
        except TimeoutError:
            break
        completed = candidate

    if completed is None:
        raise TimeoutError
    return completed
