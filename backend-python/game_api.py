"""Game and engine HTTP routes for Chess Studio.

Kept separate from app composition so main.py stays focused on middleware,
authentication and router wiring.
"""
from __future__ import annotations

import math
import random
import uuid
from typing import Optional

import chess
from fastapi import APIRouter, Depends, HTTPException, Request

import game_store as store
from api_models import AnalyzeMoveRequest, AnalyzeRequest, MoveRequest, NewGameRequest
from chess_ai import analyze_move as ai_analyze_move
from chess_ai import evaluate_board, get_cpu_move, move_to_dict
from chess_core import apply_handicap, board_sans, load_board, resolve_move, serialize_game

HINT_STRENGTH = 95
MATE_SCORE_SENTINEL = 100000.0


def is_valid_difficulty(value) -> bool:
    try:
        v = float(value)
        return 0 <= v <= 100
    except (TypeError, ValueError):
        return False


def resolve_human_color(color: str) -> str:
    if color in ("w", "b"):
        return color
    return random.choice(["w", "b"])


async def get_owned_game(game_id: str, username: str) -> dict:
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    owner = entry.get("owner")
    if owner is None:
        raise HTTPException(409, "Partida antigua sin propietario. Inicia una partida nueva.")
    if owner != username:
        raise HTTPException(404, "Partida no encontrada.")
    return entry


def build_game_router(*, auth_dependency, compute_auth_dependency, limiter) -> APIRouter:
    router = APIRouter()
    @router.post("/api/games", status_code=201)
    async def create_game(body: NewGameRequest, username: str = Depends(auth_dependency)):
        if not is_valid_difficulty(body.difficulty):
            raise HTTPException(400, "Dificultad inválida. Tiene que ser un número entre 0 y 100.")
        if body.color not in ("w", "b", "random"):
            raise HTTPException(400, "Color inválido. Usa 'w', 'b' o 'random'.")

        game_id = str(uuid.uuid4())
        human_color = resolve_human_color(body.color)
        cpu_color = "b" if human_color == "w" else "w"
        rounded_difficulty = round(float(body.difficulty))
        ghost_style = body.ghost_style.model_dump() if body.ghost_style is not None else None
        last_move = None
        initial_fen = None

        if body.starting_fen:
            try:
                board = chess.Board(body.starting_fen)
                initial_fen = board.fen()
            except ValueError:
                raise HTTPException(400, "FEN inicial inválido.")
            if board.is_game_over(claim_draw=True):
                raise HTTPException(400, "La posición inicial ya está terminada.")
        else:
            board = chess.Board()
            apply_handicap(board, body.handicap, cpu_color)

        # Si la posición de laboratorio deja a la CPU al turno, juega una vez
        # antes de devolver el tablero. En una partida normal esto conserva el
        # comportamiento clásico de CPU abriendo cuando el humano lleva negras.
        cpu_to_move = (board.turn == chess.WHITE and cpu_color == "w") or (board.turn == chess.BLACK and cpu_color == "b")
        if cpu_to_move:
            opening = get_cpu_move(board, rounded_difficulty, ghost_style)
            if opening:
                board.push_san(opening["san"])
                last_move = {
                    "from": opening["from"],
                    "to": opening["to"],
                    "by": "cpu",
                    "captured": opening["captured"],
                    "piece": opening["piece"],
                }

        entry = {
            "owner": username,
            "moves": board_sans(board, body.handicap, cpu_color, initial_fen),
            "difficulty": rounded_difficulty,
            "humanColor": human_color,
            "handicap": None if initial_fen else body.handicap,
            "initialFen": initial_fen,
            "lastMove": last_move,
            "ghostStyle": ghost_style,
        }
        await store.create_game(game_id, entry)
        return serialize_game(game_id, entry, board)


    @router.get("/api/games/{game_id}")
    async def get_game(game_id: str, username: str = Depends(auth_dependency)):
        entry = await get_owned_game(game_id, username)
        return serialize_game(game_id, entry, load_board(entry))


    @router.get("/api/games/{game_id}/hint")
    async def hint(game_id: str, username: str = Depends(auth_dependency)):
        entry = await get_owned_game(game_id, username)
        board = load_board(entry)

        if board.is_game_over(claim_draw=True):
            raise HTTPException(400, "La partida ya terminó.")
        turn = "w" if board.turn == chess.WHITE else "b"
        if turn != entry["humanColor"]:
            raise HTTPException(400, "No es tu turno.")

        suggestion = get_cpu_move(board, HINT_STRENGTH)
        if not suggestion:
            raise HTTPException(404, "No hay jugadas disponibles.")
        return suggestion


    @router.post("/api/games/{game_id}/undo")
    async def undo(game_id: str, username: str = Depends(auth_dependency)):
        entry = await get_owned_game(game_id, username)
        board = load_board(entry)

        if len(board.move_stack) == 0:
            raise HTTPException(400, "No hay jugadas para deshacer.")

        undo_count = 2 if entry.get("lastMove") and entry["lastMove"].get("by") == "cpu" else 1
        for _ in range(undo_count):
            if len(board.move_stack) == 0:
                break
            board.pop()

        cpu_color_for_entry = "b" if entry.get("humanColor", "w") == "w" else "w"
        remaining_sans = board_sans(board, entry.get("handicap"), cpu_color_for_entry, entry.get("initialFen"))
        if not remaining_sans:
            entry["lastMove"] = None
        else:
            # Reconstruimos el último movimiento desde el MISMO origen de la
            # partida. Antes se usaba siempre chess.Board() y además se deducía el
            # color por paridad; eso era incorrecto para posiciones de laboratorio
            # que empiezan con negras o para partidas con hándicap.
            last_mv = board.move_stack[-1]
            mover_before = chess.Board(entry.get("initialFen")) if entry.get("initialFen") else chess.Board()
            if not entry.get("initialFen"):
                human_color = entry.get("humanColor", "w")
                cpu_color = "b" if human_color == "w" else "w"
                apply_handicap(mover_before, entry.get("handicap"), cpu_color)
            for mv in board.move_stack[:-1]:
                mover_before.push(mv)
            side_that_moved = "w" if mover_before.turn == chess.WHITE else "b"
            captured = mover_before.is_capture(last_mv)
            piece = mover_before.piece_at(last_mv.from_square)
            entry["lastMove"] = {
                "from": chess.square_name(last_mv.from_square),
                "to": chess.square_name(last_mv.to_square),
                "by": "human" if side_that_moved == entry["humanColor"] else "cpu",
                "captured": captured,
                "piece": chess.piece_symbol(piece.piece_type) if piece else None,
            }

        entry["moves"] = remaining_sans
        await store.update_game(game_id, entry)
        return serialize_game(game_id, entry, board)


    @router.post("/api/analyze")
    @limiter.limit("60/minute", exempt_when=has_valid_api_key)
    @limiter.limit("1000/minute", key_func=api_key_bucket, exempt_when=lambda request: not has_valid_api_key(request))
    async def analyze(request: Request, body: AnalyzeRequest, _actor: str = Depends(compute_auth_dependency)):
        try:
            board = chess.Board(body.fen)
        except ValueError:
            raise HTTPException(400, "FEN inválido.")
        if board.is_game_over(claim_draw=True):
            raise HTTPException(400, "Esa posición ya está terminada.")

        level = body.level if is_valid_difficulty(body.level) else HINT_STRENGTH
        suggestion = get_cpu_move(board, level)
        if not suggestion:
            raise HTTPException(404, "No hay jugadas disponibles.")
        return suggestion


    # resolve_move vive en chess_core.py.


    def sanitize_eval(score: Optional[float]) -> Optional[float]:
        """El motor devuelve +-inf en posiciones de mate forzado (evaluate_board
        en chess_ai.py) — matemáticamente correcto para que minimax compare bien,
        pero el JSON estándar no admite Infinity/NaN. Starlette (el framework
        debajo de FastAPI) usa `allow_nan=False` en su encoder, así que un +-inf
        sin sanear no da un 400 prolijo: revienta el propio serializador con un
        500 crudo — visto en logs reales de producción, no en teoría. Se
        reemplaza por un número grande pero finito, que sigue leyéndose como
        "esto es decisivo" sin romper la respuesta."""
        if score is None:
            return None
        if math.isinf(score):
            return MATE_SCORE_SENTINEL if score > 0 else -MATE_SCORE_SENTINEL
        if math.isnan(score):
            return 0.0
        return score


    @router.post("/api/analyze-move")
    @limiter.limit("180/minute", exempt_when=has_valid_api_key)
    @limiter.limit("1000/minute", key_func=api_key_bucket, exempt_when=lambda request: not has_valid_api_key(request))
    async def analyze_move_endpoint(request: Request, body: AnalyzeMoveRequest, _actor: str = Depends(compute_auth_dependency)):
        try:
            board = chess.Board(body.fen)
        except ValueError:
            raise HTTPException(400, "FEN inválido.")
        if board.is_game_over(claim_draw=True):
            raise HTTPException(400, "Esa posición ya está terminada.")

        level = body.level if is_valid_difficulty(body.level) else 45
        analyzed = ai_analyze_move(board, level)
        if not analyzed:
            raise HTTPException(404, "No hay jugadas disponibles.")

        eval_after_played = None
        if body.from_square and body.to:
            try:
                played = chess.Board(body.fen)
                move = resolve_move(played, body.from_square, body.to, body.promotion)
                if move is None:
                    raise ValueError("Movimiento inválido.")
                played.push(move)
                eval_after_played = sanitize_eval(evaluate_board(played))
            except Exception:
                eval_after_played = None  # jugada inválida — no debería pasar si viene del historial real

        return {
            "suggested": {
                "from": analyzed["move"]["from"],
                "to": analyzed["move"]["to"],
                "san": analyzed["move"]["san"],
                "piece": analyzed["move"]["piece"],
            },
            "evalAfterSuggested": sanitize_eval(analyzed["score"]),
            "evalAfterPlayed": eval_after_played,
        }


    @router.post("/api/games/{game_id}/move")
    async def play_move(game_id: str, body: MoveRequest, username: str = Depends(auth_dependency)):
        entry = await get_owned_game(game_id, username)
        board = load_board(entry)

        if board.is_game_over(claim_draw=True):
            raise HTTPException(400, "La partida ya terminó.")
        turn = "w" if board.turn == chess.WHITE else "b"
        if turn != entry["humanColor"]:
            raise HTTPException(400, "No es el turno del jugador.")

        move = resolve_move(board, body.from_square, body.to, body.promotion)
        if move is None:
            raise HTTPException(400, "Movimiento ilegal.")

        # A partir de aquí la jugada ya fue validada contra board.legal_moves.
        # Si la serialización o python-chess fallan inesperadamente, dejamos que
        # el error llegue al handler 500 con request-id en vez de disfrazarlo de
        # un 400 "Movimiento ilegal", que ocultaría un bug real del servidor.
        human_move = move_to_dict(board, move)
        board.push(move)

        entry["lastMove"] = {
            "from": human_move["from"],
            "to": human_move["to"],
            "by": "human",
            "captured": human_move["captured"],
            "piece": human_move["piece"],
        }

        if not board.is_game_over(claim_draw=True):
            cpu_move = get_cpu_move(board, entry["difficulty"], entry.get("ghostStyle"))
            if cpu_move:
                board.push_san(cpu_move["san"])
                entry["lastMove"] = {
                    "from": cpu_move["from"],
                    "to": cpu_move["to"],
                    "by": "cpu",
                    "captured": cpu_move["captured"],
                    "piece": cpu_move["piece"],
                }

        cpu_color_for_move = "b" if entry["humanColor"] == "w" else "w"
        entry["moves"] = board_sans(board, entry.get("handicap"), cpu_color_for_move, entry.get("initialFen"))
        await store.update_game(game_id, entry)
        return serialize_game(game_id, entry, board)


    @router.delete("/api/games/{game_id}", status_code=204)
    async def delete_game(game_id: str, username: str = Depends(auth_dependency)):
        await get_owned_game(game_id, username)
        existed = await store.delete_game(game_id)
        if not existed:
            raise HTTPException(404, "Partida no encontrada.")
        return None

    return router
