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
KING_ENDGAME_TABLE = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
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

    # V16.6y — curva recalibrada. Profundidad 4 desde 45 hacía que casi
    # todo el tramo Intermedio fuese mucho más fuerte de lo que sugería la
    # etiqueta: nivel 64 ya era alpha-beta + TT + quiescence a profundidad 4.
    # Conservamos cero ruleta en Intermedio, pero retrasamos los saltos caros.
    if level < 20:
        max_depth = 2
    elif level < 70:
        max_depth = 3
    elif level < 90:
        max_depth = 4
    elif level < 98:
        max_depth = 5
    else:
        max_depth = 6

    t = level / 100
    # El azar PURO sólo pertenece a niveles bajos. Antes seguía existiendo
    # incluso en niveles avanzados (nivel 70 rondaba el 5%), lo que permitía
    # que una CPU que acababa de calcular bien eligiera después cualquier
    # movimiento legal y regalara material sin motivo. Desde Intermedio (45)
    # no hay ruleta: si se equivoca, será por horizonte/profundidad, como un
    # rival real, no porque un random() haya decidido incendiar la dama.
    if level >= 40:
        randomness = 0.0
    else:
        randomness = 0.48 * (((40 - level) / 40) ** 1.7)

    # Las alternativas deliberadamente imperfectas también desaparecen al
    # entrar en Intermedio. Aficionado puede escoger una jugada cercana a la
    # mejor; Avanzado/Implacable siempre conservan la búsqueda encontrada.
    noise = 0.0 if level >= 45 else 110 * (((45 - level) / 45) ** 1.4)
    # El tiempo ya no crece linealmente. Los niveles medios tenían demasiado
    # presupuesto para su etiqueta; la curva convexa reserva el músculo para
    # Avanzado/Implacable. Ej.: nivel 64 ~1.26 s en vez de ~1.65 s.
    time_budget_s = 0.12 + 2.38 * (t ** 1.65)

    return LevelSettings(level, max_depth, randomness, noise, time_budget_s)


def _terminal_score(board: chess.Board, ply: int = 0) -> float:
    if not board.is_checkmate():
        return 0.0
    # Preferimos dar mate antes y, si estamos perdidos, retrasarlo. Como esta
    # puntuación depende del ply, _minimax incluye el ply en la clave TT.
    return (-MATE_SCORE + ply) if board.turn == chess.WHITE else (MATE_SCORE - ply)


def evaluate_board(board: chess.Board, *, terminal_checked: bool = False) -> float:
    if not terminal_checked:
        if board.is_checkmate():
            return -INF if board.turn == chess.WHITE else INF
        # En las hojas de búsqueda solo necesitamos detectar tablas que YA se
        # han materializado. `can_claim_threefold_repetition()` también explora
        # si una jugada futura permitiría reclamar y es demasiado caro para
        # ejecutarlo en cada nodo del minimax.
        outcome = board.outcome(claim_draw=False)
        if outcome is not None:
            return 0.0
        if board.halfmove_clock >= 100 and board.is_fifty_moves():
            return 0.0
        if len(board.move_stack) >= 8 and board.is_repetition(3):
            return 0.0

    score = 0.0
    bishops = {chess.WHITE: 0, chess.BLACK: 0}
    pawn_files = {chess.WHITE: [], chess.BLACK: []}
    pieces = board.piece_map()

    # En finales el rey deja de ser una pieza que esconder detrás de peones y
    # pasa a ser una pieza activa. Reutilizamos el mismo piece_map para no
    # recorrer las 64 casillas dos veces en cada hoja.
    non_pawn_material = sum(
        PIECE_VALUES[piece.piece_type]
        for piece in pieces.values()
        if piece.piece_type not in (chess.PAWN, chess.KING)
    )
    endgame = non_pawn_material <= 2600

    for square, piece in pieces.items():

        value = PIECE_VALUES[piece.piece_type]
        table = KING_ENDGAME_TABLE if piece.piece_type == chess.KING and endgame else TABLES.get(piece.piece_type)
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

    # La versión anterior contaba todos los movimientos legales de ambos bandos
    # (incluyendo un null-move) en CADA hoja por una bonificación de apenas 1
    # punto por movimiento. Ese coste impedía completar un ply adicional en
    # posiciones normales. Centro, desarrollo y estructura ya capturan buena
    # parte de ese valor posicional; preferimos gastar el reloj en buscar más.

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
    # SAN en cada candidato es sorprendentemente caro (y vuelve a recorrer
    # legalidad). Para ordenar basta saber si da jaque; el mate lo descubrirá
    # inmediatamente el propio search con su puntuación terminal.
    if board.gives_check(move):
        score += 50_000
    return score


def _order_moves(board: chess.Board, moves: list[chess.Move], tt_move: Optional[chess.Move] = None) -> list[chess.Move]:
    return sorted(moves, key=lambda m: _move_order_score(board, m, tt_move), reverse=True)


def _tt_key(board: chess.Board) -> tuple:
    # Clave numérica: evita construir un FEN de texto en cada nodo. El reloj de
    # 50 jugadas sí forma parte de la posición a efectos de nuestra política de
    # tablas; enroque y en-passant también deben distinguir transposiciones.
    return (
        board.pawns,
        board.knights,
        board.bishops,
        board.rooks,
        board.queens,
        board.kings,
        board.occupied_co[chess.WHITE],
        board.occupied_co[chess.BLACK],
        board.turn,
        board.clean_castling_rights(),
        board.ep_square,
        board.halfmove_clock,
    )


def _search_terminal_score(board: chess.Board, ply: int) -> Optional[float]:
    """Terminales baratos para el árbol de búsqueda.

    Fuera del search la aplicación usa `claim_draw=True`, es decir, considera
    terminada una partida en cuanto la regla permite reclamar tablas. Dentro
    del árbol evitamos `can_claim_*` en cada nodo: una jugada que habilita la
    reclamación crea una posición hija donde la repetición/50 jugadas ya es
    efectiva y se detecta aquí.
    """
    outcome = board.outcome(claim_draw=False)
    if outcome is not None:
        if outcome.termination == chess.Termination.CHECKMATE:
            return _terminal_score(board, ply)
        return 0.0
    if board.halfmove_clock >= 100 and board.is_fifty_moves():
        return 0.0
    if len(board.move_stack) >= 8 and board.is_repetition(3):
        return 0.0
    return None


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

    terminal = _search_terminal_score(board, ply)
    if terminal is not None:
        return terminal

    # Si estamos en jaque hay que considerar todas las evasiones, no solo
    # capturas. De lo contrario una hoja puede "evaluar" una posición ilegal
    # como si el rey pudiera quedarse en jaque.
    in_check = board.is_check()
    stand_pat = evaluate_board(board, terminal_checked=True)

    if not in_check:
        if board.turn == chess.WHITE:
            if stand_pat >= beta:
                return stand_pat
            alpha = max(alpha, stand_pat)
        else:
            if stand_pat <= alpha:
                return stand_pat
            beta = min(beta, stand_pat)

    # Fuera de jaque, qdepth 0 significa "ya está: evalúa la posición".
    # En jaque NO podemos hacer stand-pat: quedarse quieto no es una jugada
    # legal. La versión anterior lo permitía implícitamente y podía valorar una
    # hoja como si el rey pudiera ignorar el jaque cuando todas las evasiones
    # empeoraban la evaluación.
    if qdepth == 0 and not in_check:
        return stand_pat

    moves = list(board.legal_moves)
    if not in_check:
        moves = [m for m in moves if board.is_capture(m) or m.promotion]
    moves = _order_moves(board, moves)

    if not moves:
        return stand_pat

    # Último nivel de quiescence y estamos en jaque: extendemos SOLO la
    # evasión obligatoria un ply. Así nunca evaluamos "quedarse en jaque" y
    # tampoco abrimos una cadena ilimitada de jaques hasta agotar el reloj.
    if qdepth == 0:
        maximizing = board.turn == chess.WHITE
        best = -INF if maximizing else INF
        for move in moves:
            if time.monotonic() >= deadline:
                raise TimeoutError
            board.push(move)
            try:
                terminal = _search_terminal_score(board, ply + 1)
                score = terminal if terminal is not None else evaluate_board(board, terminal_checked=True)
            finally:
                board.pop()
            best = max(best, score) if maximizing else min(best, score)
        return best

    if board.turn == chess.WHITE:
        # Stand-pat solo es candidato si no estamos en jaque.
        best = -INF if in_check else stand_pat
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

    best = INF if in_check else stand_pat
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

    terminal = _search_terminal_score(board, ply)
    if terminal is not None:
        return terminal, None

    key = (*_tt_key(board), ply)
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


GHOST_STYLE_MARGIN_CP = 14.0


def _ghost_style_value(style: Optional[dict], key: str) -> float:
    if not isinstance(style, dict):
        return 0.0
    try:
        return max(-1.0, min(1.0, float(style.get(key, 0.0))))
    except (TypeError, ValueError):
        return 0.0


def _ghost_style_score(board: chess.Board, move: chess.Move, style: Optional[dict]) -> float:
    """Preferencia de estilo para desempatar variantes casi equivalentes.

    No forma parte de la evaluación ajedrecística ni del minimax: sólo se usa
    en la raíz cuando dos jugadas quedan dentro de un margen muy pequeño.
    Así un perfil humano puede inclinar CAPTURA/PEÓN/DAMA/JAQUE/ENROQUE sin
    convertir una preferencia estética en permiso para colgar material.
    """
    if not style:
        return 0.0
    piece = board.piece_at(move.from_square)
    score = 0.0
    if board.is_capture(move):
        score += 2.2 * _ghost_style_value(style, "capture")
    if piece is not None and piece.piece_type == chess.PAWN:
        score += 1.35 * _ghost_style_value(style, "pawn")
    if piece is not None and piece.piece_type == chess.QUEEN:
        score += 1.25 * _ghost_style_value(style, "queen")
    if board.gives_check(move):
        score += 1.7 * _ghost_style_value(style, "check")
    if board.is_castling(move):
        score += 1.8 * _ghost_style_value(style, "castle")
    return score


def _ghost_tiebreak_allowed(best_score: float, candidate_score: float, maximizing: bool) -> bool:
    # Nunca dejamos que el estilo retrase un mate o elija otra rama dentro de
    # las puntuaciones centinela de mate. Fuera de eso toleramos sólo 14 cp,
    # una diferencia deliberadamente minúscula.
    if abs(best_score) >= MATE_SCORE - 1000 or abs(candidate_score) >= MATE_SCORE - 1000:
        return False
    gap = (best_score - candidate_score) if maximizing else (candidate_score - best_score)
    return 0.0 <= gap <= GHOST_STYLE_MARGIN_CP


def _root_search(
    board: chess.Board,
    depth: int,
    deadline: float,
    tt: dict[tuple, TTEntry],
    ghost_style: Optional[dict] = None,
) -> tuple[Optional[chess.Move], float]:
    moves = _order_moves(board, list(board.legal_moves))
    if not moves:
        return None, 0.0

    maximizing = board.turn == chess.WHITE
    best = None
    best_score = -INF if maximizing else INF
    best_style_score = -INF
    alpha, beta = -INF, INF

    for move in moves:
        if time.monotonic() >= deadline:
            raise TimeoutError
        move_style_score = _ghost_style_score(board, move, ghost_style)
        board.push(move)
        try:
            score, _ = _minimax(board, depth - 1, alpha, beta, 1, deadline, tt)
        finally:
            board.pop()

        is_better = (maximizing and score > best_score) or (not maximizing and score < best_score)
        if is_better:
            best_score, best = score, move
            best_style_score = move_style_score
        elif (
            ghost_style
            and best is not None
            and _ghost_tiebreak_allowed(best_score, score, maximizing)
            and move_style_score > best_style_score
        ):
            # Conservamos `best_score` para alfa-beta: es la puntuación real
            # óptima hallada. Sólo cambiamos qué jugada casi equivalente se
            # devuelve al usuario.
            best = move
            best_style_score = move_style_score

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


def _static_best_move(board: chess.Board, legal_moves: list[chess.Move]) -> tuple[chess.Move, float]:
    """Fallback barato pero digno si el reloj corta antes de completar depth 1.

    Antes devolvíamos simplemente `legal_moves[0]`: bajo carga extrema podía
    convertirse en una jugada arbitraria. Un barrido estático de un ply cuesta
    poco y evita que un timeout transforme un nivel alto en un chimpancé.
    """
    maximizing = board.turn == chess.WHITE
    best = legal_moves[0]
    best_score = -INF if maximizing else INF
    for move in legal_moves:
        board.push(move)
        try:
            score = evaluate_board(board)
        finally:
            board.pop()
        if (maximizing and score > best_score) or (not maximizing and score < best_score):
            best, best_score = move, score
    return best, best_score


def _search(board: chess.Board, settings: LevelSettings, ghost_style: Optional[dict] = None) -> tuple[Optional[chess.Move], float]:
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None, 0.0

    deadline = time.monotonic() + settings.time_budget_s
    tt: dict[tuple, TTEntry] = {}
    best, best_score = _static_best_move(board, legal_moves)

    # El último resultado COMPLETO de una profundidad es el que se conserva.
    # Si el reloj corta una profundidad nueva, nunca devolvemos una jugada
    # parcialmente analizada.
    for depth in range(1, settings.max_depth + 1):
        if time.monotonic() >= deadline:
            break
        try:
            move, score = _root_search(board, depth, deadline, tt, ghost_style)
        except TimeoutError:
            break
        if move is not None:
            best, best_score = move, score

    return best, best_score


def get_cpu_move(board: chess.Board, level: float = 50, ghost_style: Optional[dict] = None) -> Optional[dict]:
    """Devuelve una jugada para la CPU según dificultad 0-100.

    ``ghost_style`` es opcional y sólo desempata variantes casi equivalentes
    en la raíz; no altera la evaluación ni la profundidad del motor.
    """
    settings = settings_for_level(level)
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        return None

    # El azar puro queda reservado para niveles bajos. A partir de ahí el
    # motor siempre piensa, pero los niveles bajos pueden preferir una jugada
    # cercana a la mejor para no resultar completamente idiotas.
    if random.random() < settings.randomness:
        if ghost_style:
            # En niveles bajos ya existe imperfección deliberada; al menos
            # orientamos esa ruleta hacia los rasgos medidos del fantasma.
            ranked = sorted(legal_moves, key=lambda move: _ghost_style_score(board, move, ghost_style), reverse=True)
            pool_size = max(1, min(len(ranked), max(3, len(ranked) // 3)))
            return move_to_dict(board, random.choice(ranked[:pool_size]))
        return move_to_dict(board, random.choice(legal_moves))

    best, best_score = _search(board, settings, ghost_style)
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
                best = max(near, key=lambda move: _ghost_style_score(board, move, ghost_style)) if ghost_style else random.choice(near)

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
