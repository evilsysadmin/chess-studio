"""Core ajedrecístico puro de Chess Studio.

Este módulo no conoce FastAPI, Mongo, JWT ni perfiles. Aquí viven únicamente
las reglas/reconstrucciones que deben poder probarse de forma aislada:
hándicap inicial, replay SAN, serialización del tablero y resolución de
movimientos from/to (incluidas promociones).
"""

from __future__ import annotations

from typing import Optional

import chess


# Hándicap de material — convención clásica de ajedrez ("odds"). Se retira
# una pieza del lado de la CPU; el humano conserva su ejército completo.
HANDICAP_SQUARES = {
    "pawn": (chess.F2, chess.F7),
    "knight": (chess.G1, chess.G8),
    "rook": (chess.H1, chess.H8),
    "queen": (chess.D1, chess.D8),
}


def apply_handicap(board: chess.Board, handicap: Optional[str], cpu_color: str) -> None:
    """Retira la pieza indicada únicamente del lado de la CPU."""
    if not handicap or handicap not in HANDICAP_SQUARES:
        return
    white_sq, black_sq = HANDICAP_SQUARES[handicap]
    square = white_sq if cpu_color == "w" else black_sq
    board.remove_piece_at(square)


def load_board(entry: dict) -> chess.Board:
    """Reconstruye una partida desde su origen real y su historial SAN."""
    board = chess.Board(entry.get("initialFen")) if entry.get("initialFen") else chess.Board()
    human_color = entry.get("humanColor", "w")
    cpu_color = "b" if human_color == "w" else "w"
    if not entry.get("initialFen"):
        apply_handicap(board, entry.get("handicap"), cpu_color)
    for san in entry.get("moves") or []:
        board.push_san(san)
    return board


def board_sans(
    board: chess.Board,
    handicap: Optional[str] = None,
    cpu_color: Optional[str] = None,
    initial_fen: Optional[str] = None,
) -> list[str]:
    """Reconstruye SAN desde el mismo origen real de la partida.

    SAN depende del contexto: no basta con convertir ``move_stack`` sin
    reproducir la posición. Tanto ``startingFen`` como el hándicap deben
    reaplicarse o una jugada puede volverse ambigua/ilegal al serializarla.
    """
    sans = []
    temp = chess.Board(initial_fen) if initial_fen else chess.Board()
    if not initial_fen:
        apply_handicap(temp, handicap, cpu_color)
    for move in board.move_stack:
        sans.append(temp.san(move))
        temp.push(move)
    return sans


def serialize_game(game_id: str, entry: dict, board: chess.Board) -> dict:
    """Foto JSON canónica de una partida y su historial contextual."""
    if board.is_checkmate():
        status = "checkmate"
    elif board.is_stalemate():
        status = "stalemate"
    elif board.can_claim_threefold_repetition():
        status = "repetition"
    elif board.is_insufficient_material() or board.can_claim_fifty_moves():
        status = "draw"
    elif board.is_check():
        status = "check"
    else:
        status = "playing"

    history = []
    temp = chess.Board(entry.get("initialFen")) if entry.get("initialFen") else chess.Board()
    if not entry.get("initialFen"):
        human_color = entry.get("humanColor", "w")
        cpu_color = "b" if human_color == "w" else "w"
        apply_handicap(temp, entry.get("handicap"), cpu_color)

    for move in board.move_stack:
        san = temp.san(move)
        captured = temp.is_capture(move)
        captured_piece = None
        if captured:
            target = temp.piece_at(move.to_square)
            if target is not None:
                captured_piece = chess.piece_symbol(target.piece_type)
            elif temp.is_en_passant(move):
                captured_piece = "p"
        mover = temp.piece_at(move.from_square)
        history.append(
            {
                "san": san,
                "from": chess.square_name(move.from_square),
                "to": chess.square_name(move.to_square),
                "piece": chess.piece_symbol(mover.piece_type) if mover else None,
                "captured": captured,
                "capturedPiece": captured_piece,
            }
        )
        temp.push(move)

    return {
        "id": game_id,
        "fen": board.fen(),
        "turn": "w" if board.turn == chess.WHITE else "b",
        "humanColor": entry["humanColor"],
        "difficulty": entry["difficulty"],
        "status": status,
        # La aplicación adopta reclamaciones de 3x/50 movimientos de forma
        # automática; el flag debe usar exactamente la misma política.
        "isGameOver": board.is_game_over(claim_draw=True),
        "history": history,
        "lastMove": entry.get("lastMove"),
        "initialFen": entry.get("initialFen"),
    }


_PROMOTION_PIECES = {
    "q": chess.QUEEN,
    "r": chess.ROOK,
    "b": chess.BISHOP,
    "n": chess.KNIGHT,
}


def resolve_move(
    board: chess.Board,
    from_sq: str,
    to_sq: str,
    promotion: Optional[str],
) -> Optional[chess.Move]:
    """Resuelve un from/to contra las jugadas LEGALES reales del tablero."""
    try:
        from_square = chess.parse_square(from_sq)
        to_square = chess.parse_square(to_sq)
    except ValueError:
        return None

    candidates = [
        move
        for move in board.legal_moves
        if move.from_square == from_square and move.to_square == to_square
    ]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Varias candidatas solo aparecen al promocionar: dama por defecto.
    wanted = _PROMOTION_PIECES.get((promotion or "q").lower(), chess.QUEEN)
    for move in candidates:
        if move.promotion == wanted:
            return move
    return candidates[0]
