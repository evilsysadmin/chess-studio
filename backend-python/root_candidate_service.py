"""Shared factual root-candidate search for chess policies.

This is intentionally a thin public seam over ``engine_analysis``. Consumers
such as Balanced CPU and Combat Chess should reuse one coherent candidate pass
instead of reaching into minimax internals or implementing parallel search.
"""
from __future__ import annotations

from typing import Optional

import chess

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
