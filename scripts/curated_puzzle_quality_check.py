#!/usr/bin/env python3
"""Validate the canonical curated puzzle catalog against best-play chess facts."""
from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend-python"
sys.path.insert(0, str(BACKEND))

import chess  # noqa: E402
from engine_analysis import compare_root_move  # noqa: E402

CATALOG_PATH = ROOT / "frontend" / "src" / "puzzles.catalog.json"
MAX_ACCEPTED_LOSS_CP = 0.5
MATERIAL_ANALYSIS_BUDGET_S = 3.0

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


def material_balance(board: chess.Board, color: chess.Color) -> int:
    own = enemy = 0
    for piece in board.piece_map().values():
        value = PIECE_VALUES[piece.piece_type]
        if piece.color == color:
            own += value
        else:
            enemy += value
    return own - enemy


def is_mating_kind(kind: str) -> bool:
    # "material" also starts with the letters "mate". Keep the semantic
    # distinction explicit instead of relying on a string prefix accident.
    return kind != "material" and (kind.startswith("mate") or kind == "combination")


def forced_mate_distance(
    board: chess.Board,
    attacker: chess.Color,
    max_plies: int,
    cache: dict[tuple[str, chess.Color, int], int | None],
) -> int | None:
    """Exact bounded minimax mate distance in plies.

    The attacker minimizes time to mate; the defender maximizes survival and
    escapes the proof if any legal branch avoids mate inside the remaining
    horizon. This is stronger and more deterministic than heuristic cp scoring
    for the short curated mate lines.
    """
    key = (board.fen(), attacker, max_plies)
    if key in cache:
        return cache[key]

    if board.is_checkmate():
        result = 0 if board.turn != attacker else None
        cache[key] = result
        return result
    if max_plies <= 0 or board.is_game_over(claim_draw=True):
        cache[key] = None
        return None

    moves = list(board.legal_moves)
    if not moves:
        cache[key] = None
        return None

    if board.turn == attacker:
        best: int | None = None
        for move in moves:
            board.push(move)
            try:
                child = forced_mate_distance(board, attacker, max_plies - 1, cache)
            finally:
                board.pop()
            if child is None:
                continue
            distance = child + 1
            if best is None or distance < best:
                best = distance
        cache[key] = best
        return best

    # Defender gets best play too: one escape refutes the forced mate; if every
    # reply loses, the best defense is the line that postpones mate the longest.
    worst = 0
    for move in moves:
        board.push(move)
        try:
            child = forced_mate_distance(board, attacker, max_plies - 1, cache)
        finally:
            board.pop()
        if child is None:
            cache[key] = None
            return None
        worst = max(worst, child + 1)
    cache[key] = worst
    return worst


def validate_mating_line(
    puzzle_id: str,
    board: chess.Board,
    solution: list[str],
) -> list[PuzzleQualityIssue]:
    issues: list[PuzzleQualityIssue] = []
    attacker = board.turn
    cache: dict[tuple[str, chess.Color, int], int | None] = {}
    root_distance = forced_mate_distance(board, attacker, len(solution), cache)
    if root_distance is None:
        return [PuzzleQualityIssue(
            puzzle_id,
            "mate-not-forced",
            f"no forced mate within the stored {len(solution)} plies against best defense",
        )]
    if root_distance != len(solution):
        return [PuzzleQualityIssue(
            puzzle_id,
            "mate-distance-mismatch",
            f"stored line has {len(solution)} plies but best play mates in {root_distance}",
        )]

    for ply, san in enumerate(solution):
        remaining = len(solution) - ply
        current_distance = forced_mate_distance(board, attacker, remaining, cache)
        if current_distance is None:
            issues.append(PuzzleQualityIssue(puzzle_id, "mate-proof-lost", f"ply {ply + 1}: {san}"))
            break
        try:
            move = board.parse_san(str(san))
        except Exception as exc:
            issues.append(PuzzleQualityIssue(puzzle_id, "illegal-san", f"ply {ply + 1} {san!r}: {exc}"))
            break

        board.push(move)
        try:
            child_distance = forced_mate_distance(board, attacker, remaining - 1, cache)
        finally:
            board.pop()
        stored_distance = None if child_distance is None else child_distance + 1
        if stored_distance != current_distance:
            role = "defense" if ply % 2 else "solution"
            issues.append(PuzzleQualityIssue(
                puzzle_id,
                f"{role}-not-best",
                f"ply {ply + 1}: stored {san} yields mate-distance {stored_distance}, optimal is {current_distance}",
            ))
            break
        board.push(move)

    if not issues and not board.is_checkmate():
        issues.append(PuzzleQualityIssue(puzzle_id, "objective-not-proven", "stored line does not end in checkmate"))
    return issues


def validate_material_line(
    puzzle_id: str,
    board: chess.Board,
    solution: list[str],
) -> list[PuzzleQualityIssue]:
    issues: list[PuzzleQualityIssue] = []
    solver_color = board.turn
    initial_material = material_balance(board, solver_color)
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

        try:
            comparison = compare_root_move(
                board,
                move,
                depth=2,
                budget_s=MATERIAL_ANALYSIS_BUDGET_S,
            )
        except TimeoutError:
            issues.append(PuzzleQualityIssue(puzzle_id, "analysis-timeout", f"ply {ply + 1}, depth 2"))
            break

        if comparison.loss > MAX_ACCEPTED_LOSS_CP:
            best_san = board.san(comparison.best_move)
            role = "defense" if ply % 2 else "solution"
            issues.append(PuzzleQualityIssue(
                puzzle_id,
                f"{role}-not-best",
                f"ply {ply + 1}: stored {san}, minimax {best_san}, loss {comparison.loss:.1f} cp at depth 2",
            ))
            break

        if ply % 2 == 0:
            last_solver_reply = comparison.played_reply
        board.push(move)

    if issues:
        return issues

    probe = board.copy(stack=True)
    if not probe.is_game_over(claim_draw=True) and last_solver_reply is not None:
        if last_solver_reply not in probe.legal_moves:
            return [PuzzleQualityIssue(
                puzzle_id,
                "invalid-best-reply",
                "minimax reply is not legal after stored line",
            )]
        probe.push(last_solver_reply)
    swing = material_balance(probe, solver_color) - initial_material
    if swing < 100:
        issues.append(PuzzleQualityIssue(
            puzzle_id,
            "material-objective-not-proven",
            f"best-defense material swing is only {swing:+d} cp",
        ))
    return issues


def validate_curated_puzzle(puzzle: dict) -> list[PuzzleQualityIssue]:
    puzzle_id = str(puzzle.get("id") or "<missing-id>")
    try:
        board = chess.Board(str(puzzle["fen"]))
    except Exception as exc:
        return [PuzzleQualityIssue(puzzle_id, "invalid-fen", str(exc))]
    if not board.is_valid():
        return [PuzzleQualityIssue(puzzle_id, "invalid-position", str(puzzle.get("fen")))]

    solution = puzzle.get("solution")
    if not isinstance(solution, list) or not solution:
        return [PuzzleQualityIssue(puzzle_id, "missing-solution", "solution must contain at least one SAN move")]

    kind = str(puzzle.get("kind") or "")
    if is_mating_kind(kind):
        return validate_mating_line(puzzle_id, board, solution)
    if kind == "material":
        return validate_material_line(puzzle_id, board, solution)
    return [PuzzleQualityIssue(puzzle_id, "unknown-kind", repr(kind))]


def validate_curated_catalog(path: Path = CATALOG_PATH) -> tuple[list[dict], list[PuzzleQualityIssue]]:
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
    return puzzles, issues


def main() -> int:
    puzzles, issues = validate_curated_catalog()
    if issues:
        print("curated-puzzle-minimax-check FAILED", file=sys.stderr)
        for issue in issues:
            print(f" - {issue}", file=sys.stderr)
        return 1
    print(f"curated-puzzle-minimax-check OK · {len(puzzles)} puzzles · best-play line verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
