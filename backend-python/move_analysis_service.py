"""Application service for one deterministic move-analysis request.

Keeps chess-analysis policy out of the HTTP router while preserving the legacy
response fields consumed by existing clients. New factual evidence is additive.
"""
from __future__ import annotations

import math
from typing import Optional

import chess

from chess_ai import analyze_move as deterministic_analyze_move
from chess_ai import evaluate_board
from chess_core import resolve_move
from engine_analysis import build_factual_move_analysis

MATE_SCORE_SENTINEL = 100000.0


def sanitize_eval(score: Optional[float]) -> Optional[float]:
    """Return JSON-safe engine scores while preserving decisive mate values."""
    if score is None:
        return None
    if math.isinf(score):
        return MATE_SCORE_SENTINEL if score > 0 else -MATE_SCORE_SENTINEL
    if math.isnan(score):
        return 0.0
    return score


def analyze_move_payload(
    board: chess.Board,
    *,
    from_square: Optional[str],
    to: Optional[str],
    promotion: Optional[str],
    level: float,
) -> tuple[Optional[dict], Optional[dict]]:
    """Build the API payload and the primary analysis used by shadow checks.

    Legal played moves use the shared factual comparison. The legacy
    ``evalAfterPlayed`` keeps its historical static-evaluation semantics so old
    consumers do not change behavior; coherent same-pass values are exposed as
    ``factualEvalAfterSuggested`` / ``factualEvalAfterPlayed`` and ``loss``.
    If the factual budget cannot complete depth 1, the old deterministic path is
    used instead of failing the request.
    """
    played_move = None
    if from_square and to:
        played_move = resolve_move(board, from_square, to, promotion)

    if played_move is not None:
        try:
            factual = build_factual_move_analysis(board, played_move, level=level, max_depth=6)
        except TimeoutError:
            factual = None
        if factual is not None:
            primary = {"move": factual.suggested, "score": factual.eval_after_suggested}
            payload = factual.to_api_payload()
            factual_suggested = sanitize_eval(payload.get("evalAfterSuggested"))
            factual_played = sanitize_eval(payload.get("evalAfterPlayed"))
            played = board.copy(stack=False)
            played.push(played_move)
            payload["factualEvalAfterSuggested"] = factual_suggested
            payload["factualEvalAfterPlayed"] = factual_played
            payload["evalAfterSuggested"] = factual_suggested
            payload["evalAfterPlayed"] = sanitize_eval(evaluate_board(played))
            return payload, primary

    analyzed = deterministic_analyze_move(board, level)
    if not analyzed:
        return None, None

    eval_after_played = None
    if played_move is not None:
        played = board.copy(stack=False)
        played.push(played_move)
        eval_after_played = sanitize_eval(evaluate_board(played))

    return {
        "suggested": {
            "from": analyzed["move"]["from"],
            "to": analyzed["move"]["to"],
            "san": analyzed["move"]["san"],
            "piece": analyzed["move"]["piece"],
            "promotion": analyzed["move"].get("promotion"),
        },
        "evalAfterSuggested": sanitize_eval(analyzed["score"]),
        "evalAfterPlayed": eval_after_played,
    }, analyzed
