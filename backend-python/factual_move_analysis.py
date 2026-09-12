"""Shared factual move-analysis domain for post-game consumers.

The HTTP layer, autopsy, coaching and training should all consume the same
comparison instead of independently mixing engine passes with different depths
or evaluation scales.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import chess

from chess_ai import move_to_dict, settings_for_level
from engine_analysis import RootMoveComparison, compare_root_move_iterative

DEFAULT_FACTUAL_MAX_DEPTH = 3


@dataclass(frozen=True)
class FactualMoveAnalysis:
    suggested: dict
    played: dict
    suggested_reply: Optional[dict]
    played_reply: Optional[dict]
    eval_after_suggested: float
    eval_after_played: float
    loss: float
    depth: int
    candidate_count: int

    def to_api_payload(self) -> dict:
        """Backward-compatible analyze-move payload plus factual provenance."""
        return {
            "suggested": self.suggested,
            "played": self.played,
            "suggestedReply": self.suggested_reply,
            "playedReply": self.played_reply,
            "evalAfterSuggested": self.eval_after_suggested,
            "evalAfterPlayed": self.eval_after_played,
            "loss": self.loss,
            "analysisDepth": self.depth,
            "candidateCount": self.candidate_count,
        }


def _reply_dict(board: chess.Board, root_move: chess.Move, reply: Optional[chess.Move]) -> Optional[dict]:
    if reply is None:
        return None
    child = board.copy(stack=False)
    child.push(root_move)
    if reply not in child.legal_moves:
        raise ValueError("analysis reply must be legal after its root move")
    return move_to_dict(child, reply)


def build_factual_move_analysis(
    board: chess.Board,
    played_move: chess.Move,
    *,
    level: float = 45,
    max_depth: int = DEFAULT_FACTUAL_MAX_DEPTH,
    budget_s: Optional[float] = None,
) -> FactualMoveAnalysis:
    """Build one reusable factual comparison for a played move.

    Search depth is capped both by the caller and the engine level. The engine's
    normal time budget is used unless the caller supplies an explicit budget.
    ``compare_root_move_iterative`` guarantees that only a fully completed depth
    is exposed; a partial deeper pass is discarded.
    """
    requested_depth = int(max_depth)
    if requested_depth < 1:
        raise ValueError("max_depth must be at least 1")

    settings = settings_for_level(level)
    effective_depth = min(requested_depth, settings.max_depth)
    effective_budget = settings.time_budget_s if budget_s is None else max(0.0, float(budget_s))
    comparison: RootMoveComparison = compare_root_move_iterative(
        board,
        played_move,
        max_depth=effective_depth,
        budget_s=effective_budget,
    )

    return FactualMoveAnalysis(
        suggested=move_to_dict(board, comparison.best_move),
        played=move_to_dict(board, comparison.played_move),
        suggested_reply=_reply_dict(board, comparison.best_move, comparison.best_reply),
        played_reply=_reply_dict(board, comparison.played_move, comparison.played_reply),
        eval_after_suggested=comparison.best_score,
        eval_after_played=comparison.played_score,
        loss=comparison.loss,
        depth=comparison.depth,
        candidate_count=comparison.candidate_count,
    )
