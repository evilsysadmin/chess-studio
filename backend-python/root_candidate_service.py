"""Shared factual root-candidate search for chess policies.

This is intentionally a thin public seam over ``engine_analysis``. Consumers
such as Balanced CPU and Combat Chess should reuse one coherent candidate pass
instead of reaching into minimax internals or implementing parallel search.
"""
from __future__ import annotations

from typing import Optional

import chess

from chess_ai import MATE_SCORE, move_to_dict, settings_for_level
from engine_analysis import RootCandidateAnalysis, top_root_candidates


def factual_root_candidates(
    board: chess.Board,
    *,
    depth: int,
    limit: Optional[int] = None,
    deadline: Optional[float] = None,
    budget_s: Optional[float] = None,
) -> list[RootCandidateAnalysis]:
    """Return one best-first factual root set from a single bounded pass.

    ``limit=None`` means every legal root move. A numeric limit is clamped to
    the number of legal moves so callers can safely ask for a small shortlist.
    Search semantics, timeout behavior and score ordering remain owned by
    ``engine_analysis.top_root_candidates``.
    """
    legal_count = board.legal_moves.count()
    if legal_count == 0:
        return []

    requested = legal_count if limit is None else max(1, int(limit))
    bounded_limit = min(requested, legal_count)
    return top_root_candidates(
        board,
        limit=bounded_limit,
        depth=depth,
        deadline=deadline,
        budget_s=budget_s,
    )


def candidate_api_payload(board: chess.Board, candidate: RootCandidateAnalysis) -> dict:
    """Serialize one factual candidate without leaking engine score orientation.

    The engine score is White-positive. Consumers such as Combat Chess need a
    simpler invariant: larger is always better for the side currently choosing
    a move. The payload therefore normalizes the score to the root mover while
    preserving the engine-owned move facts.
    """
    if candidate.move not in board.legal_moves:
        raise ValueError("candidate move must be legal on the root board")

    normalized_score = candidate.score if board.turn == chess.WHITE else -candidate.score
    payload = move_to_dict(board, candidate.move)
    return {
        **payload,
        "moveKey": candidate.move.uci(),
        "chessScoreCp": normalized_score,
        "isLegal": True,
        "isMate": normalized_score >= MATE_SCORE - 1000,
    }


def candidate_api_payloads(
    board: chess.Board,
    candidates: list[RootCandidateAnalysis],
) -> list[dict]:
    """Serialize a best-first candidate set for mode-specific policies."""
    return [candidate_api_payload(board, candidate) for candidate in candidates]


def factual_candidate_payloads_for_level(board: chess.Board, level: float, limit: int) -> list[dict]:
    """Build a short mode-policy shortlist without blocking the primary move.

    This is deliberately shallower and more tightly budgeted than the primary
    CPU search. A timeout returns no shortlist so callers can fail open to the
    already-computed normal engine suggestion.
    """
    settings = settings_for_level(level)
    depth = min(3, settings.max_depth)
    budget_s = min(0.45, max(0.12, settings.time_budget_s * 0.30))
    try:
        candidates = factual_root_candidates(board, depth=depth, limit=limit, budget_s=budget_s)
    except TimeoutError:
        return []
    return candidate_api_payloads(board, candidates)
