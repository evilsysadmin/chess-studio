"""Quality gate for the canonical curated puzzle catalog.

The frontend owns presentation; this module checks chess facts. It reads exactly
the same JSON catalog and validates every stored ply against the shared minimax
facade, so CI can reject convenient-but-inferior defenses or solutions that
collapse under best play.
"""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path

import chess

from engine_analysis import compare_root_move

CATALOG_PATH = Path(__file__).resolve().parents[1] / "frontend" / "src" / "puzzles.catalog.json"
MAX_ACCEPTED_LOSS_CP = 0.5
ANALYSIS_BUDGET_S = 3.0

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}


@dataclass(frozen=True)
class PuzzleQualityIssue:
    puzzle_id: str
    code: str
    detail: str

    def __str__(self) -> str:
        return f"{self.puzzle_id}: {self.code}: {self.detail}"


def load_curated_puzzles(path: Path = CATALOG_PATH) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("curated puzzle catalog must be a JSON array")
    return data


def _material_balance(board: chess.Board, color: chess.Color) -> int:
    own = enemy = 0
    for piece in board.piece_map().values():
        value = PIECE_VALUES[piece.piece_type]
        if piece.color == color:
            own += value
        else:
            enemy += value
    return own - enemy


def _target_depth(solution_length: int, ply: int, kind: str) -> int:
    remaining = max(1, solution_length - ply)
    if kind.startswith("mate") or kind == "combination":
        return max(2, min(5, remaining))
    return 2


def validate_curated_puzzle(puzzle: dict) -> list[PuzzleQualityIssue]:
    puzzle_id = str(puzzle.get("id") or "<missing-id>")
    issues: list[PuzzleQualityIssue] = []
    try:
        board = chess.Board(str(puzzle["fen"]))
    except Exception as exc:
        return [PuzzleQualityIssue(puzzle_id, "invalid-fen", str(exc))]

    if not board.is_valid():
        return [PuzzleQualityIssue(puzzle_id, "invalid-position", str(puzzle.get("fen")))]

    solution = puzzle.get("solution")
    if not isinstance(solution, list) or not solution:
        return [PuzzleQualityIssue(puzzle_id, "missing-solution", "solution must contain at least one SAN move")]

    solver_color = board.turn
    initial_material = _material_balance(board, solver_color)
    last_solver_reply: chess.Move | None = None

    for ply, san in enumerate(solution):
        if board.is_game_over(claim_draw=True):
            issues.append(PuzzleQualityIssue(puzzle_id, "line-after-terminal", f"ply {ply + 1}: {san}"))
            break
        try:
            move = board.parse_san(str(san))
        except Exception as exc:
            issues.append(PuzzleQualityIssue(puzzle_id, "illegal-san", f"ply {ply + 1} {san!r}: {exc}"))
            break

        depth = _target_depth(len(solution), ply, str(puzzle.get("kind") or ""))
        try:
            comparison = compare_root_move(
                board,
                move,
                depth=depth,
                budget_s=ANALYSIS_BUDGET_S,
            )
        except TimeoutError:
            issues.append(PuzzleQualityIssue(puzzle_id, "analysis-timeout", f"ply {ply + 1}, depth {depth}"))
            break

        if comparison.loss > MAX_ACCEPTED_LOSS_CP:
            best_san = board.san(comparison.best_move)
            role = "defense" if ply % 2 else "solution"
            issues.append(PuzzleQualityIssue(
                puzzle_id,
                f"{role}-not-best",
                f"ply {ply + 1}: stored {san}, minimax {best_san}, loss {comparison.loss:.1f} cp at depth {depth}",
            ))
            break

        if ply % 2 == 0:
            last_solver_reply = comparison.played_reply
        board.push(move)

    if issues:
        return issues

    kind = str(puzzle.get("kind") or "")
    if kind.startswith("mate") or kind == "combination":
        if not board.is_checkmate():
            issues.append(PuzzleQualityIssue(puzzle_id, "objective-not-proven", "stored line does not end in checkmate"))
    elif kind == "material":
        probe = board.copy(stack=True)
        if not probe.is_game_over(claim_draw=True) and last_solver_reply is not None:
            if last_solver_reply not in probe.legal_moves:
                issues.append(PuzzleQualityIssue(puzzle_id, "invalid-best-reply", "minimax reply is not legal after stored line"))
                return issues
            probe.push(last_solver_reply)
        swing = _material_balance(probe, solver_color) - initial_material
        if swing < 100:
            issues.append(PuzzleQualityIssue(
                puzzle_id,
                "material-objective-not-proven",
                f"best-defense material swing is only {swing:+d} cp",
            ))

    return issues


def validate_curated_catalog(path: Path = CATALOG_PATH) -> list[PuzzleQualityIssue]:
    puzzles = load_curated_puzzles(path)
    ids: set[str] = set()
    issues: list[PuzzleQualityIssue] = []
    for puzzle in puzzles:
        puzzle_id = str(puzzle.get("id") or "<missing-id>")
        if puzzle_id in ids:
            issues.append(PuzzleQualityIssue(puzzle_id, "duplicate-id", "id appears more than once"))
            continue
        ids.add(puzzle_id)
        issues.extend(validate_curated_puzzle(puzzle))
    return issues
