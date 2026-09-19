"""Factual hint payloads backed by the engine's proven principal variation.

Hints are pedagogy, not CPU personality: they should be deterministic and may
expose a short line that was already proven by the same bounded minimax pass.
"""
from __future__ import annotations

import chess

from chess_ai import get_cpu_move, move_to_dict, settings_for_level
from engine_analysis import principal_variation


def _serialize_line(board: chess.Board, moves: tuple[chess.Move, ...]) -> list[dict]:
    probe = board.copy(stack=False)
    line: list[dict] = []
    for move in moves:
        if move not in probe.legal_moves:
            break
        line.append(move_to_dict(probe, move))
        probe.push(move)
    return line


def build_hint_payload(board: chess.Board, level: float) -> dict | None:
    """Return the best hint plus the proven reply/PV when the pass completes.

    principal_variation keeps only complete iterative root passes and exact TT
    continuations. If even depth 1 cannot complete inside the normal level
    budget, the established CPU hint path remains the fail-open fallback.
    """
    settings = settings_for_level(level)
    try:
        analysis = principal_variation(
            board,
            max_depth=settings.max_depth,
            budget_s=settings.time_budget_s,
        )
    except TimeoutError:
        analysis = None

    if analysis is not None:
        line = _serialize_line(board, analysis.moves)
        if line:
            return {
                **line[0],
                "reply": line[1] if len(line) > 1 else None,
                "line": line,
                "analysisDepth": analysis.depth,
                "candidateCount": analysis.candidate_count,
            }

    return get_cpu_move(board, level)
