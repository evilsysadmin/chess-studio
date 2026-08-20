"""chess_ai.py — motor de la CPU.

Motor ligero de ajedrez para la aplicación:
- minimax con poda alfa-beta;
- profundización iterativa con límite de tiempo;
- tabla de transposiciones;
- ordenación de movimientos (TT, capturas, promociones y jaques);
- búsqueda quiescente en hojas para no evaluar posiciones tácticas "a medias";
- evaluación posicional sencilla (material, piezas menores, centro, movilidad,
  pareja de alfiles, peones pasados/aislados y seguridad básica del rey);
- dificultad 0-100: a niveles bajos introduce azar, y a niveles altos aumenta
  profundidad/presupuesto de tiempo.

La evaluación siempre está expresada desde el punto de vista de blancas:
positivo = ventaja blanca, negativo = ventaja negra.
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

CENTER = {chess.D4, chess.E4, chess.D5, chess.E5}
EXTENDED_CENTER = {chess.C3, chess.D3, chess.E3, chess.F3, chess.C4, chess.F4,
                   chess.C5, chess.F5, chess.C6, chess.D6, chess.E6, chess.F6}

MATE_SCORE = 100_000
INF = float("inf")


@dataclass
class LevelSettings:
    level: int
    max_depth: int
    randomness: float
    noise: float
    time_budget_s: float


@dataclass
class TTEntry:
    depth: int
    score: float
    flag: str
    move: Optional[chess.Move]


def settings_for_level(raw_level) -> LevelSettings:
    level = max(0, min(100, round(float(raw_level))))

    # Antes el máximo real era profundidad 3 para casi todo el tramo alto.
    # Ahora la dificultad también se traduce en más profundidad y tiempo.
    if level < 15:
        max_depth = 2
    elif level < 40:
        max_depth = 3
    elif level < 70:
        max_depth = 4
    elif level < 90:
        max_depth = 5
    else:
        max_depth = 6

    t = level / 100
    # Curva cuadrática: los niveles bajos siguen cometiendo errores visibles,
    # pero cerca de 100 desaparece casi por completo el azar puro.
    randomness = 0.55 * ((1 - t) ** 2)
    noise = 90 * (1 - t)
    time_budget_s = 0.15 + 2.35 * t

    return LevelSettings(level, max_depth, randomness, noise, time_budget_s)


def _terminal_score(board: chess.Board, ply: int = 0) -> float:
    if not board.is_checkmate():
        return 0.0
    # Puntuación constante para que una entrada de la tabla de transposiciones
    # siga siendo válida aunque la misma posición aparezca a distinto ply.
    return -MATE_SCORE if board.turn == chess.WHITE else MATE_SCORE


def evaluate_board(board: chess.Board) -> float:
    if board.is_checkmate():
        return -INF if board.turn == chess.WHITE else INF
    if (
        board.is_stalemate()
        or board.is_insufficient_material()
        or board.can_claim_threefold_repetition()
        or board.can_claim_fifty_moves()
    ):
        return 0.0

    score = 0.0
    bishops = {chess.WHITE: 0, chess.BLACK: 0}
    pawn_files = {chess.WHITE: [], chess.BLACK: []}

    for square in chess.SQUARES:
        piece = board.piece_at(square)
        if piece is None:
            continue

        value = PIECE_VALUES[piece.piece_type]
        table = TABLES.get(piece.piece_type)
        if table is not None:
            idx = square if piece.color == chess.WHITE else chess.square_mirror(square)
            value += table[idx]

        # Centro: pequeño pero útil para que la CPU no juegue materialmente
        # "igual" mientras abandona todo el tablero central.
        if square in CENTER:
            value += 14 if piece.piece_type != chess.PAWN else 10
        elif square in EXTENDED_CENTER:
            value += 5

        if piece.piece_type == chess.BISHOP:
            bishops[piece.color] += 1
        if piece.piece_type == chess.PAWN:
            pawn_files[piece.color].append(chess.square_file(square))

        score += value if piece.color == chess.WHITE else -value

    # Pareja de alfiles.
    if bishops[chess.WHITE] >= 2:
        score += 25
    if bishops[chess.BLACK] >= 2:
        score -= 25

    # Peones aislados: pequeña penalización.
    for color, sign in ((chess.WHITE, 1), (chess.BLACK, -1)):
        files = pawn_files[color]
        for file_idx in set(files):
            if (file_idx - 1 not in files) and (file_idx + 1 not in files):
                score -= sign * 10

    # Peones pasados: solo importan peones enemigos que estén por DELANTE
    # en la misma columna o una adyacente. Un peón enemigo que ya quedó atrás
    # no deja de convertir al nuestro en pasado.
    for color, sign in ((chess.WHITE, 1), (chess.BLACK, -1)):
        pawns = board.pieces(chess.PAWN, color)
        enemy_pawns = list(board.pieces(chess.PAWN, not color))
        for square in pawns:
            file_idx = chess.square_file(square)
            rank = chess.square_rank(square)

            def enemy_blocks_passed(enemy_square: int) -> bool:
                enemy_file = chess.square_file(enemy_square)
                enemy_rank = chess.square_rank(enemy_square)
                if abs(file_idx - enemy_file) > 1:
                    return False
                return enemy_rank > rank if color == chess.WHITE else enemy_rank < rank

            if not any(enemy_blocks_passed(enemy_square) for enemy_square in enemy_pawns):
                advance = rank if color == chess.WHITE else 7 - rank
                score += sign * (8 + advance * 3)

    # Movilidad de ambos bandos. El null move solo es una aproximación para
    # obtener la movilidad rival y no debe usarse cuando el bando al turno
    # está en jaque (esa posición tras "pasar" no sería legal).
    if not board.is_check():
        side = board.turn
        own_mobility = board.legal_moves.count()
        board.push(chess.Move.null())
        try:
            enemy_mobility = board.legal_moves.count()
        finally:
            board.pop()
        score += (own_mobility - enemy_mobility) * (1 if side == chess.WHITE else -1)

    return score


def _move_san_safe(board: chess.Board, move: chess.Move) -> str:
    try:
        return board.san(move)
    except Exception:
        return board.uci(move)


def _move_order_score(board: chess.Board, move: chess.Move, tt_move: Optional[chess.Move]) -> int:
    if tt_move is not None and move == tt_move:
        return 1_000_000

    score = 0
    if board.is_capture(move):
        victim = board.piece_at(move.to_square)
        attacker = board.piece_at(move.from_square)
        if victim is None and board.is_en_passant(move):
            victim_value = PIECE_VALUES[chess.PAWN]
        else:
            victim_value = PIECE_VALUES[victim.piece_type] if victim else 0
        attacker_value = PIECE_VALUES[attacker.piece_type] if attacker else 1
        # MVV-LVA: capturar una pieza cara con una barata primero.
        score += 100_000 + victim_value * 10 - attacker_value
    if move.promotion:
        score += 80_000 + PIECE_VALUES.get(move.promotion, 0)
    try:
        san = board.san(move)
        if '+' in san:
            score += 50_000
        if '#' in san:
            score += 100_000
    except Exception:
        pass
    return score


def _order_moves(board: chess.Board, moves: list[chess.Move], tt_move: Optional[chess.Move] = None) -> list[chess.Move]:
    return sorted(moves, key=lambda m: _move_order_score(board, m, tt_move), reverse=True)


def _tt_key(board: chess.Board) -> tuple:
    # Incluimos derechos de enroque y al paso. No incluimos los contadores de
    # medio movimiento porque no cambian la posición táctica que nos interesa.
    return (
        board.board_fen(),
        board.turn,
        board.castling_rights,
        board.ep_square,
        board.halfmove_clock,
    )


def _quiescence(
    board: chess.Board,
    alpha: float,
    beta: float,
    ply: int,
    deadline: float,
    qdepth: int = 3,
) -> float:
    if time.monotonic() >= deadline:
        raise TimeoutError

    if board.is_checkmate():
        return _terminal_score(board, ply)

    # Si estamos en jaque hay que considerar todas las evasiones, no solo
    # capturas. De lo contrario una hoja puede "evaluar" una posición ilegal
    # como si el rey pudiera quedarse en jaque.
    in_check = board.is_check()
    stand_pat = evaluate_board(board)

    if not in_check:
        if board.turn == chess.WHITE:
            if stand_pat >= beta:
                return stand_pat
            alpha = max(alpha, stand_pat)
        else:
            if stand_pat <= alpha:
                return stand_pat
            beta = min(beta, stand_pat)

    if qdepth == 0:
        return stand_pat

    moves = list(board.legal_moves)
    if not in_check:
        moves = [m for m in moves if board.is_capture(m) or m.promotion]
    moves = _order_moves(board, moves)

    if not moves:
        return stand_pat

    if board.turn == chess.WHITE:
        best = stand_pat
        for move in moves:
            if time.monotonic() >= deadline:
                raise TimeoutError
            board.push(move)
            try:
                score = _quiescence(board, alpha, beta, ply + 1, deadline, qdepth - 1)
            finally:
                board.pop()
            best = max(best, score)
            alpha = max(alpha, best)
            if alpha >= beta:
                break
        return best

    best = stand_pat
    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score = _quiescence(board, alpha, beta, ply + 1, deadline, qdepth - 1)
        finally:
            board.pop()
        best = min(best, score)
        beta = min(beta, best)
        if alpha >= beta:
            break
    return best


def _minimax(
    board: chess.Board,
    depth: int,
    alpha: float,
    beta: float,
    ply: int,
    deadline: float,
    tt: dict[tuple, TTEntry],
) -> tuple[float, Optional[chess.Move]]:
    if time.monotonic() >= deadline:
        raise TimeoutError

    if board.is_game_over():
        if board.is_checkmate():
            return _terminal_score(board, ply), None
        return 0.0, None

    key = _tt_key(board)
    alpha_orig, beta_orig = alpha, beta
    cached = tt.get(key)
    if cached is not None and cached.depth >= depth:
        if cached.flag == "EXACT":
            return cached.score, cached.move
        if cached.flag == "LOWER":
            alpha = max(alpha, cached.score)
        elif cached.flag == "UPPER":
            beta = min(beta, cached.score)
        if alpha >= beta:
            return cached.score, cached.move

    if depth == 0:
        return _quiescence(board, alpha, beta, ply, deadline), None

    maximizing = board.turn == chess.WHITE
    moves = _order_moves(board, list(board.legal_moves), cached.move if cached else None)
    best_move = None

    if maximizing:
        best_score = -INF
        for move in moves:
            board.push(move)
            try:
                score, _ = _minimax(board, depth - 1, alpha, beta, ply + 1, deadline, tt)
            finally:
                board.pop()
            if score > best_score:
                best_score, best_move = score, move
            alpha = max(alpha, best_score)
            if alpha >= beta:
                break
    else:
        best_score = INF
        for move in moves:
            board.push(move)
            try:
                score, _ = _minimax(board, depth - 1, alpha, beta, ply + 1, deadline, tt)
            finally:
                board.pop()
            if score < best_score:
                best_score, best_move = score, move
            beta = min(beta, best_score)
            if alpha >= beta:
                break

    if best_score <= alpha_orig:
        flag = "UPPER"
    elif best_score >= beta_orig:
        flag = "LOWER"
    else:
        flag = "EXACT"
    tt[key] = TTEntry(depth, best_score, flag, best_move)
    return best_score, best_move


def _root_search(
    board: chess.Board,
    depth: int,
    deadline: float,
    tt: dict[tuple, TTEntry],
) -> tuple[Optional[chess.Move], float]:
    moves = _order_moves(board, list(board.legal_moves))
    if not moves:
        return None, 0.0

    maximizing = board.turn == chess.WHITE
    best = None
    best_score = -INF if maximizing else INF
    alpha, beta = -INF, INF

    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        board.push(move)
        try:
            score, _ = _minimax(board, depth - 1, alpha, beta, 1, deadline, tt)
        finally:
            board.pop()

        if (maximizing and score > best_score) or (not maximizing and score < best_score):
            best_score, best = score, move

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


def _search(board: chess.Board, settings: LevelSettings) -> tuple[Optional[chess.Move], float]:
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None, 0.0

    deadline = time.monotonic() + settings.time_budget_s
    tt: dict[tuple, TTEntry] = {}
    best = legal_moves[0]
    best_score = -INF if board.turn == chess.WHITE else INF

    # El último resultado COMPLETO de una profundidad es el que se conserva.
    # Si el reloj corta una profundidad nueva, nunca devolvemos una jugada
    # parcialmente analizada.
    for depth in range(1, settings.max_depth + 1):
        if time.monotonic() >= deadline:
            break
        try:
            move, score = _root_search(board, depth, deadline, tt)
        except TimeoutError:
            break
        if move is not None:
            best, best_score = move, score

    return best, best_score


def get_cpu_move(board: chess.Board, level: float = 50) -> Optional[dict]:
    """Devuelve una jugada para la CPU según dificultad 0-100."""
    settings = settings_for_level(level)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    # El azar puro queda reservado para niveles bajos. A partir de ahí el
    # motor siempre piensa, pero los niveles bajos pueden preferir una jugada
    # cercana a la mejor para no resultar completamente idiotas.
    if random.random() < settings.randomness:
        return move_to_dict(board, random.choice(legal_moves))

    best, best_score = _search(board, settings)
    if best is None:
        best = random.choice(legal_moves)

    # "Noise" ahora no contamina cada hoja y rompe la tabla de transposiciones.
    # Se usa solo para introducir una pequeña probabilidad de escoger una
    # alternativa razonablemente cercana al mejor movimiento.
    if settings.noise > 0 and len(legal_moves) > 1:
        scored = []
        deadline = time.monotonic() + min(settings.time_budget_s * 0.15, 0.15)
        for move in _order_moves(board, legal_moves):
            if time.monotonic() >= deadline:
                break
            board.push(move)
            try:
                score = evaluate_board(board)
            finally:
                board.pop()
            scored.append((move, score))

        if scored:
            # Estas son evaluaciones ESTÁTICAS de un ply; se comparan entre
            # ellas, no contra `best_score` (que viene de una búsqueda más
            # profunda y por tanto no está en la misma escala práctica).
            if board.turn == chess.WHITE:
                static_best = max(score for _, score in scored)
                near = [m for m, score in scored if score >= static_best - settings.noise]
            else:
                static_best = min(score for _, score in scored)
                near = [m for m, score in scored if score <= static_best + settings.noise]
            if near and random.random() < 0.35 * (settings.noise / 90):
                best = random.choice(near)

    return move_to_dict(board, best)


def analyze_move(board: chess.Board, level: float = 60) -> Optional[dict]:
    """Analiza sin azar ni ruido y devuelve la mejor jugada encontrada."""
    settings = settings_for_level(level)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    best, score = _search(board, settings)
    if best is None:
        best = legal_moves[0]
        score = evaluate_board(board)

    return {"move": move_to_dict(board, best), "score": score}
