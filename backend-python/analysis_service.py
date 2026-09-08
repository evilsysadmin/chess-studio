"""Reusable analysis facade over the Chess Studio minimax engine.

This module deliberately keeps search internals in ``chess_ai`` and exposes a
small, stable contract for consumers such as puzzles, autopsy/coaching and
Matthias.  The transposition table remains per-search RAM state: persistent
storage is only appropriate for COMPLETE, versioned analysis results.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Optional

import chess

from chess_ai import _search, analyze_move, evaluate_board, settings_for_level

ANALYSIS_SCHEMA_VERSION = 1
ANALYSIS_ENGINE_VERSION = "minimax-analysis-v1"


@dataclass(frozen=True)
class AnalysisResult:
    """Stable result returned by the reusable analysis facade."""

    move: Optional[dict]
    score: float
    level: int

    def as_dict(self) -> dict:
        return {"move": self.move, "score": self.score, "level": self.level}


def _normalized_level(level: float) -> int:
    return settings_for_level(level).level


def best_move(board: chess.Board, level: float = 60) -> Optional[AnalysisResult]:
    """Return the best move found without CPU randomness/noise.

    ``analyze_move`` already uses the deterministic search path.  Copying the
    board protects callers from future search changes and makes the facade's
    no-mutation contract explicit.
    """
    normalized = _normalized_level(level)
    analyzed = analyze_move(board.copy(stack=True), normalized)
    if not analyzed:
        return None
    return AnalysisResult(move=analyzed["move"], score=analyzed["score"], level=normalized)


def score_position(board: chess.Board, level: float = 60) -> float:
    """Evaluate a position through the same minimax search used by the CPU.

    Terminal positions are evaluated directly.  Non-terminal positions search
    the best continuation for the side to move and return the engine's
    white-centric score.
    """
    working = board.copy(stack=True)
    if working.is_game_over(claim_draw=True):
        return evaluate_board(working)

    settings = settings_for_level(level)
    _move, score = _search(working, settings)
    return score


def score_move(board: chess.Board, move: chess.Move, level: float = 60) -> float:
    """Score a legal candidate after the opponent receives its best reply."""
    if move not in board.legal_moves:
        raise ValueError("move must be legal in the supplied position")
    working = board.copy(stack=True)
    working.push(move)
    return score_position(working, level)


def tactical_swing(board: chess.Board, move: chess.Move, level: float = 60) -> float:
    """Return ``after - before`` for a played move, in centipawn-like units.

    Scores remain white-centric so consumers can decide whether a positive or
    negative swing is good for the human according to colour.  This function
    reports engine facts; semantic labels such as "blunder" live above it.
    """
    before = score_position(board, level)
    after = score_move(board, move, level)
    return after - before


def analysis_cache_key(
    board: chess.Board,
    *,
    operation: str,
    level: float = 60,
    move: Optional[chess.Move] = None,
) -> str:
    """Build a stable key suitable for an optional persistent result cache.

    FEN is not sufficient for repetition-sensitive analysis because two boards
    can share a FEN while having different repetition histories.  We therefore
    include the move stack as well as an explicit schema/engine version.

    Mongo (or another persistent store) may cache final results under this key,
    but MUST NOT be used as the minimax transposition table: node lookups belong
    in the in-memory TT inside ``chess_ai``.
    """
    payload = {
        "schema": ANALYSIS_SCHEMA_VERSION,
        "engine": ANALYSIS_ENGINE_VERSION,
        "operation": str(operation),
        "level": _normalized_level(level),
        "fen": board.fen(),
        "history": [candidate.uci() for candidate in board.move_stack],
        "move": move.uci() if move is not None else None,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def persistent_cache_document(
    board: chess.Board,
    *,
    operation: str,
    result: dict,
    level: float = 60,
    move: Optional[chess.Move] = None,
) -> dict:
    """Create the storage-neutral document for a completed analysis result.

    Deliberately no Mongo import lives here.  Persistence is optional and a
    cache failure must never make a chess move or analysis request fail.
    """
    return {
        "_id": analysis_cache_key(board, operation=operation, level=level, move=move),
        "schemaVersion": ANALYSIS_SCHEMA_VERSION,
        "engineVersion": ANALYSIS_ENGINE_VERSION,
        "operation": str(operation),
        "level": _normalized_level(level),
        "result": result,
    }
