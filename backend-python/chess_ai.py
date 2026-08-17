"""chess_ai.py — Motor de la CPU: heurística de evaluación + minimax con poda
alfa-beta y profundización iterativa acotada por tiempo. La dificultad es un
nivel de 0 a 100 que controla la profundidad máxima, cuánto ruido se mezcla
en la evaluación y qué probabilidad hay de jugar al azar en vez de "pensar".

Ver el comentario sobre el indexado más abajo: python-chess numera las
casillas de abajo hacia arriba (a1=0, h8=63) — las piece-square tables están
escritas para ese orden.
"""

from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass
from typing import Optional

import chess

PIECE_VALUES = {
    chess.PAWN: 100,
    chess.KNIGHT: 320,
    chess.BISHOP: 330,
    chess.ROOK: 500,
    chess.QUEEN: 900,
    chess.KING: 0,
}

# Piece-square tables, ya convertidas al orden de python-chess (índice 0 =
# a1, índice 63 = h8 — de abajo hacia arriba). Premian el control del centro
# y el desarrollo temprano; están escritas "en perspectiva de blancas" y se
# usan reflejadas verticalmente (chess.square_mirror) para negras — funciona
# porque las cuatro tablas son simétricas izquierda-derecha.
PAWN_TABLE = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, -20, -20, 10, 10, 5,
    5, -5, -10, 0, 0, -10, -5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, 5, 10, 25, 25, 10, 5, 5,
    10, 10, 20, 30, 30, 20, 10, 10,
    50, 50, 50, 50, 50, 50, 50, 50,
    0, 0, 0, 0, 0, 0, 0, 0,
]
KNIGHT_TABLE = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
]
BISHOP_TABLE = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
]
KING_TABLE = [
    20, 30, 10, 0, 0, 10, 30, 20,
    20, 20, 0, 0, 0, 0, 20, 20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
]

TABLES = {
    chess.PAWN: PAWN_TABLE,
    chess.KNIGHT: KNIGHT_TABLE,
    chess.BISHOP: BISHOP_TABLE,
    chess.KING: KING_TABLE,
}


def evaluate_board(board: chess.Board) -> float:
    if board.is_checkmate():
        # A quien le toca mover está en jaque mate: pierde.
        return -math.inf if board.turn == chess.WHITE else math.inf
    if (
        board.is_stalemate()
        or board.is_insufficient_material()
        or board.can_claim_threefold_repetition()
        or board.can_claim_fifty_moves()
    ):
        return 0.0

    score = 0.0
    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue
        value = PIECE_VALUES[piece.piece_type]
        table = TABLES.get(piece.piece_type)
        if table is not None:
            idx = square if piece.color == chess.WHITE else chess.square_mirror(square)
            value += table[idx]
        score += value if piece.color == chess.WHITE else -value

    # Bono leve por movilidad (cantidad de jugadas legales disponibles).
    mobility = board.legal_moves.count()
    score += mobility if board.turn == chess.WHITE else -mobility

    return score


def _move_san_safe(board: chess.Board, move: chess.Move) -> str:
    try:
        return board.san(move)
    except Exception:
        return board.uci(move)


def _order_moves(board: chess.Board, moves: list[chess.Move]) -> list[chess.Move]:
    # Heurística simple: revisar primero capturas y jaques ayuda a la poda alfa-beta.
    def score(move: chess.Move) -> int:
        s = 10 if board.is_capture(move) else 0
        san = _move_san_safe(board, move)
        if '+' in san or '#' in san:
            s += 5
        return s

    return sorted(moves, key=score, reverse=True)


def _minimax(
    board: chess.Board, depth: int, alpha: float, beta: float, maximizing: bool, noise: float
) -> tuple[float, Optional[chess.Move]]:
    if depth == 0 or board.is_game_over():
        score = evaluate_board(board)
        if noise > 0 and math.isfinite(score):
            score += (random.random() * 2 - 1) * noise
        return score, None

    moves = _order_moves(board, list(board.legal_moves))
    best_move: Optional[chess.Move] = None

    if maximizing:
        max_eval = -math.inf
        for move in moves:
            board.push(move)
            score, _ = _minimax(board, depth - 1, alpha, beta, False, noise)
            board.pop()
            if score > max_eval:
                max_eval = score
                best_move = move
            alpha = max(alpha, score)
            if beta <= alpha:
                break
        return max_eval, best_move
    else:
        min_eval = math.inf
        for move in moves:
            board.push(move)
            score, _ = _minimax(board, depth - 1, alpha, beta, True, noise)
            board.pop()
            if score < min_eval:
                min_eval = score
                best_move = move
            beta = min(beta, score)
            if beta <= alpha:
                break
        return min_eval, best_move


@dataclass
class LevelSettings:
    level: int
    max_depth: int
    randomness: float
    noise: float
    time_budget_s: float


def settings_for_level(raw_level) -> LevelSettings:
    level = max(0, min(100, round(float(raw_level))))
    if level < 25:
        max_depth = 1
    elif level < 60:
        max_depth = 2
    else:
        max_depth = 3

    t = level / 100
    randomness = 0.55 * (1 - t)  # nivel 0: ~55% de jugadas al azar. nivel 100: ninguna.
    noise = 130 * (1 - t)  # ruido en centipawns sumado a cada evaluación de hoja.
    time_budget_s = (400 + level * 20) / 1000  # de ~0.4s (nivel 0) a ~2.4s (nivel 100).

    return LevelSettings(level, max_depth, randomness, noise, time_budget_s)


def _root_search(
    board: chess.Board, depth: int, maximizing: bool, noise: float, deadline: float
) -> tuple[Optional[chess.Move], float]:
    moves = _order_moves(board, list(board.legal_moves))
    best: Optional[chess.Move] = None
    best_score = -math.inf if maximizing else math.inf
    alpha = -math.inf
    beta = math.inf

    for move in moves:
        if time.monotonic() > deadline:
            break
        board.push(move)
        score, _ = _minimax(board, depth - 1, alpha, beta, not maximizing, noise)
        board.pop()

        if (maximizing and score > best_score) or (not maximizing and score < best_score):
            best_score = score
            best = move
        if maximizing:
            alpha = max(alpha, best_score)
        else:
            beta = min(beta, best_score)

    return best, best_score


def move_to_dict(board: chess.Board, move: chess.Move) -> dict:
    san = _move_san_safe(board, move)
    piece = board.piece_at(move.from_square)
    return {
        "from": chess.square_name(move.from_square),
        "to": chess.square_name(move.to_square),
        "san": san,
        "piece": chess.piece_symbol(piece.piece_type) if piece else None,
        "captured": board.is_capture(move),
    }


def get_cpu_move(board: chess.Board, level: float = 50) -> Optional[dict]:
    """Devuelve el mejor movimiento (como dict) para la CPU dado un nivel de
    dificultad 0-100. Usa profundización iterativa acotada por tiempo."""
    settings = settings_for_level(level)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    if random.random() < settings.randomness:
        return move_to_dict(board, random.choice(legal_moves))

    maximizing = board.turn == chess.WHITE
    deadline = time.monotonic() + settings.time_budget_s
    best: Optional[chess.Move] = None

    for depth in range(1, settings.max_depth + 1):
        if time.monotonic() > deadline:
            break
        move, _ = _root_search(board, depth, maximizing, settings.noise, deadline)
        if move is not None:
            best = move

    if best is None:
        best = random.choice(legal_moves)
    return move_to_dict(board, best)


def analyze_move(board: chess.Board, level: float = 60) -> Optional[dict]:
    """Igual que get_cpu_move pero para ANÁLISIS: sin ruido ni azar (queremos
    la mejor jugada real, no simular debilidad), y devuelve también la
    evaluación — lo usa el informe post-partida."""
    settings = settings_for_level(level)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    maximizing = board.turn == chess.WHITE
    deadline = time.monotonic() + settings.time_budget_s
    best: Optional[chess.Move] = None
    best_score = -math.inf if maximizing else math.inf

    for depth in range(1, settings.max_depth + 1):
        if time.monotonic() > deadline:
            break
        move, score = _root_search(board, depth, maximizing, 0, deadline)  # noise=0
        if move is not None:
            best = move
            best_score = score

    if best is None:
        best = legal_moves[0]
    return {"move": move_to_dict(board, best), "score": best_score}
