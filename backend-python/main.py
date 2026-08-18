"""main.py — API del Estudio de Ajedrez, en FastAPI."""

from __future__ import annotations

import json
import logging
import math
import os
import random
import uuid
from typing import Optional

import chess
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import game_store as store
import profile_store as pstore
import users_store as ustore
from auth import hash_password, verify_password, create_token, verify_token
from chess_ai import analyze_move as ai_analyze_move
from chess_ai import evaluate_board, get_cpu_move, move_to_dict

app = FastAPI(title="Estudio de Ajedrez API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uvicorn ya imprime su propia línea de acceso (algo tipo `INFO: IP:puerto
# - "METODO /ruta HTTP/1.1" status`), pero esa línea no tiene forma de
# saber quién hizo el request — uvicorn no entiende nada de JWT ni de esta
# app, solo ve bytes ASGI. Se desactiva esa línea por defecto (para que
# nunca quede una duplicada) y se reemplaza por esta, mismo espíritu, con
# el username agregado si el request vino con un token válido. Puramente
# informativo — a diferencia de get_current_user (que SÍ exige un token
# válido para las rutas protegidas), esto no exige nada, solo registra lo
# que haya, incluido "anon" para tráfico sin autenticar.
logging.getLogger("uvicorn.access").disabled = True

access_logger = logging.getLogger("chess.access")
access_logger.setLevel(logging.INFO)
if not access_logger.handlers:
    _access_handler = logging.StreamHandler()
    _access_handler.setFormatter(logging.Formatter("%(message)s"))
    access_logger.addHandler(_access_handler)
    access_logger.propagate = False


@app.middleware("http")
async def log_request_with_user(request: Request, call_next):
    response = await call_next(request)
    header = request.headers.get("authorization")
    username = None
    if header and header.startswith("Bearer "):
        username = verify_token(header[len("Bearer "):])
    client = f"{request.client.host}:{request.client.port}" if request.client else "?"
    access_logger.info(
        f'INFO:     {client} - "{request.method} {request.url.path} HTTP/1.1" {response.status_code} - user={username or "anon"}'
    )
    return response

# Rate limiting por IP — sin esto, cualquiera con curl puede hacer que un
# hosting gratuito (o de pago) se quede corto de cómputo mandando cientos
# de requests por segundo a un endpoint que corre minimax de verdad.
# `default_limits` cubre TODO lo que no tenga su propio @limiter.limit —
# 120/minuto es generoso para jugar de verdad (una jugada humana por vez) y
# para recorrer un replay (hasta 24 llamadas seguidas al analizar una
# partida), pero corta en seco un script sin ningún freno. `/api/analyze`
# se usa poco (pistas, apertura de la CPU) y se queda en 60/minuto.
# `/api/analyze-move` es el que más golpea "Buscar mi peor jugada de
# siempre" (puede encadenar muchas partidas seguidas) — 60/minuto ahí
# hacía que esa búsqueda tardara la vida, así que sube a 180/minuto. El
# frontend igual sigue pausando sus propias llamadas con un throttle
# cliente (`gameReport.js`, `ANALYZE_MOVE_MIN_GAP_MS`) para no ir MÁS
# rápido de lo que un hosting gratuito puede sostener de verdad, aunque el
# límite del servidor lo permitiría.
limiter = Limiter(key_func=get_remote_address, default_limits=["120/minute"])

# ---------- Auth M2M (empieza chico, sin usuarios ni sesiones) ----------
#
# Primer paso de un tema pendiente más grande (auth humano, perfiles por
# usuario, storage por usuario) que se decidió NO encarar entero de una —
# esto es solo la pieza M2M: una lista fija de API keys por variable de
# entorno, sin base de datos, sin login, sin nada que un humano jugando
# desde el navegador necesite tocar nunca. El frontend actual no manda
# ningún header nuevo y sigue funcionando exactamente igual que antes —
# esto es 100% aditivo, no un requisito nuevo para nadie.
#
# `M2M_API_KEYS` sin configurar (el caso por defecto, incluido en
# desarrollo local) deja el set vacío — ninguna key valida nunca, cero
# diferencia de comportamiento respecto a como estaba antes.
_M2M_API_KEYS = {k.strip() for k in os.environ.get("M2M_API_KEYS", "").split(",") if k.strip()}


def get_api_key(request: Request) -> Optional[str]:
    key = request.headers.get("x-api-key")
    return key if key and key in _M2M_API_KEYS else None


def has_valid_api_key(request: Request) -> bool:
    return get_api_key(request) is not None


def require_user_or_m2m(request: Request) -> Optional[str]:
    """Exige o bien un token de usuario válido, o bien una API key M2M
    válida — cualquiera de las dos alcanza. Usado en `/api/analyze` y
    `/api/analyze-move`: corren el motor de verdad (cómputo caro) y
    quedaban abiertos a cualquiera con internet, con nada más que el
    rate limit por IP como freno — el log de producción mostró tráfico
    anónimo real golpeándolos, sin ninguna cuenta ni key de por medio."""
    if has_valid_api_key(request):
        return None
    header = request.headers.get("authorization")
    if header and header.startswith("Bearer "):
        username = verify_token(header[len("Bearer "):])
        if username:
            return username
    raise HTTPException(401, "Hace falta iniciar sesión o mandar una API key válida.")


# `ADMIN_USERNAMES` — mismo espíritu que M2M_API_KEYS: una lista separada
# por comas en una variable de entorno, no un flag hardcodeado en el
# código ni una columna nueva que migrar en cada usuario. Sin configurar
# (caso por defecto), el set queda vacío — nadie es admin, cero cambio de
# comportamiento respecto a como estaba antes. Los usernames ya se
# normalizan a minúscula en el registro/login, así que la comparación acá
# también lo hace, para no depender de que quien configure la variable
# recuerde escribirlo exactamente igual.
_ADMIN_USERNAMES = {u.strip().lower() for u in os.environ.get("ADMIN_USERNAMES", "").split(",") if u.strip()}

# `INVITE_CODES` — mismo patrón otra vez: lista separada por comas en una
# variable de entorno. Sin configurar (caso por defecto), el set queda
# vacío y el registro sigue abierto, cero cambio de comportamiento. Con
# la variable configurada, registrarse exige mandar uno de estos códigos
# — pensado para compartir un link tipo "tu-app.com/?invite=XYZ" con
# conocidos, no para gestionar invitaciones individuales (eso sería un
# sistema bastante más grande: base de datos de códigos, de un solo uso,
# revocables — decisión consciente de no construir eso todavía).
_INVITE_CODES = {c.strip() for c in os.environ.get("INVITE_CODES", "").split(",") if c.strip()}


def is_admin(username: str) -> bool:
    return username.lower() in _ADMIN_USERNAMES


def api_key_bucket(request: Request) -> str:
    """key_func para el límite M2M: cada API key tiene su propio balde de
    cupo, separado del tráfico público por IP — dos scripts con keys
    distintas no se pisan el cupo entre sí, ni se lo pisan a la IP
    pública que comparten si corren desde la misma máquina."""
    return get_api_key(request) or ""

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Fuerza que usa el motor cuando el humano pide una pista: casi siempre
# juega su mejor jugada, independientemente de la dificultad de la CPU en
# esa partida (una pista floja no serviría de mucho).
HINT_STRENGTH = 95


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


# Hándicap de material — convención clásica de ajedrez ("odds"), siglos de
# uso: quitarle una pieza al rival más fuerte en vez de que el más débil
# reciba puntos extra o parta con ventaja de tiempo. Casillas del lado
# de rey (knight/rook) porque es la convención habitual, y f2/f7 para el
# peón (el clásico "pawn odds"). Formato: {nombre: (casilla_blancas, casilla_negras)}.
HANDICAP_SQUARES = {
    "pawn": (chess.F2, chess.F7),
    "knight": (chess.G1, chess.G8),
    "rook": (chess.H1, chess.H8),
    "queen": (chess.D1, chess.D8),
}


def apply_handicap(board: chess.Board, handicap: Optional[str], cpu_color: str) -> None:
    """Saca del tablero la pieza del hándicap, del lado de la CPU nada más
    — el humano siempre juega con las 16 piezas completas."""
    if not handicap or handicap not in HANDICAP_SQUARES:
        return
    white_sq, black_sq = HANDICAP_SQUARES[handicap]
    square = white_sq if cpu_color == "w" else black_sq
    board.remove_piece_at(square)


def load_board(entry: dict) -> chess.Board:
    board = chess.Board()
    human_color = entry.get("humanColor", "w")
    cpu_color = "b" if human_color == "w" else "w"
    apply_handicap(board, entry.get("handicap"), cpu_color)
    for san in entry.get("moves") or []:
        board.push_san(san)
    return board


def board_sans(board: chess.Board, handicap: Optional[str] = None, cpu_color: Optional[str] = None) -> list[str]:
    """La lista de jugadas en SAN, reconstruida jugada por jugada desde el
    inicio (SAN depende del contexto de la posición, no se puede sacar
    directo de los objetos Move sin reproducir la partida). Si la partida
    tiene hándicap, hay que reaplicarlo en el tablero temporal también —
    si no, la notación podría salir ambigua o directamente incorrecta
    (una jugada que era legal/no ambigua solo porque faltaba una pieza del
    hándicap, reproducida contra un tablero que sí la tiene)."""
    sans = []
    temp = chess.Board()
    apply_handicap(temp, handicap, cpu_color)
    for mv in board.move_stack:
        sans.append(temp.san(mv))
        temp.push(mv)
    return sans


def serialize_game(game_id: str, entry: dict, board: chess.Board) -> dict:
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
    temp = chess.Board()
    for mv in board.move_stack:
        san = temp.san(mv)
        captured = temp.is_capture(mv)
        captured_piece = None
        if captured:
            target = temp.piece_at(mv.to_square)
            if target is not None:
                captured_piece = chess.piece_symbol(target.piece_type)
            elif temp.is_en_passant(mv):
                captured_piece = "p"
        mover = temp.piece_at(mv.from_square)
        history.append(
            {
                "san": san,
                "from": chess.square_name(mv.from_square),
                "to": chess.square_name(mv.to_square),
                "piece": chess.piece_symbol(mover.piece_type) if mover else None,
                "captured": captured,
                "capturedPiece": captured_piece,
            }
        )
        temp.push(mv)

    return {
        "id": game_id,
        "fen": board.fen(),
        "turn": "w" if board.turn == chess.WHITE else "b",
        "humanColor": entry["humanColor"],
        "difficulty": entry["difficulty"],
        "status": status,
        "isGameOver": board.is_game_over(),
        "history": history,
        "lastMove": entry.get("lastMove"),
    }


# ---------- Modelos de entrada ----------
# "from" es palabra reservada en Python, así que el campo se llama
# `from_square` en el código pero se sigue mandando/recibiendo como "from"
# en el JSON (alias) — el frontend no ve ninguna diferencia.

class AdminEditUserRequest(BaseModel):
    rating: Optional[int] = None
    tournamentPoints: Optional[int] = None
    tournamentWins: Optional[int] = None


class RegisterRequest(BaseModel):
    username: str
    password: str
    inviteCode: Optional[str] = None


class LoginRequest(BaseModel):
    username: str
    password: str


class NewGameRequest(BaseModel):
    difficulty: float = 50
    color: str = "w"
    handicap: Optional[str] = None  # None | "pawn" | "knight" | "rook" | "queen" — ver HANDICAP_SQUARES


class MoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    from_square: str = Field(alias="from")
    to: str
    promotion: Optional[str] = None


class AnalyzeRequest(BaseModel):
    fen: str
    level: float = HINT_STRENGTH


class AnalyzeMoveRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fen: str
    from_square: Optional[str] = Field(default=None, alias="from")
    to: Optional[str] = None
    promotion: Optional[str] = None
    level: float = 45


# ---------- Rutas ----------

# Auth: registro abierto (cualquiera con el link se crea una cuenta),
# usuario+contraseña nada más — sin email, sin OAuth. Para "compartir con
# unos conocidos", es la opción con menos piezas externas (no depende de
# un proveedor ni de mandar mails).

def get_current_user_optional(authorization: Optional[str] = None) -> Optional[str]:
    """No se usa como Depends() de FastAPI directo -- ver get_current_user
    más abajo, que sí lo es. Esta versión queda para tests/uso directo."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return verify_token(authorization[len("Bearer "):])


async def get_current_user(request: Request) -> str:
    """Dependencia real para las rutas protegidas — 401 si no hay token
    válido. El username va adentro del token (firmado), no hace falta ir
    a buscarlo a la base de datos solo para autenticar cada request."""
    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        raise HTTPException(401, "Falta el token de sesión.")
    username = verify_token(header[len("Bearer "):])
    if not username:
        raise HTTPException(401, "Sesión inválida o expirada. Inicia sesión de nuevo.")
    return username


@app.post("/api/auth/register", status_code=201)
async def register(body: RegisterRequest):
    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "El usuario tiene que tener al menos 3 caracteres.")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña tiene que tener al menos 6 caracteres.")
    if _INVITE_CODES and (body.inviteCode or "").strip() not in _INVITE_CODES:
        raise HTTPException(403, "Código de invitación inválido o faltante.")
    existing = await ustore.get_user(username)
    if existing:
        raise HTTPException(409, "Ese usuario ya existe.")
    await ustore.create_user(username, hash_password(body.password))
    return {"token": create_token(username), "username": username}


@app.post("/api/auth/login")
async def login(body: LoginRequest):
    username = body.username.strip().lower()
    user = await ustore.get_user(username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Usuario o contraseña incorrectos.")
    return {"token": create_token(username), "username": username}


@app.get("/api/auth/me")
async def me(username: str = Depends(get_current_user)):
    return {"username": username, "isAdmin": is_admin(username)}


def _extract_summary_stats(profile: Optional[dict]) -> dict:
    """Parseo defensivo del perfil para el panel de admin — cada valor es
    un string JSON (así los guarda profileBackup.js), y cualquier usuario
    puede tener datos parciales, viejos, o corruptos. Un campo roto no
    debe tumbar el resumen entero, así que cada `json.loads` va con su
    propio try/except."""
    data = (profile or {}).get("data") or {}

    tournament_points = None
    tournament_wins = None
    try:
        tournament = json.loads(data.get("chess-study-tournament", "{}"))
        tournament_points = tournament.get("points")
        tournament_wins = tournament.get("wins")
    except (json.JSONDecodeError, AttributeError):
        pass

    rating = None
    try:
        rating_data = json.loads(data.get("chess-study-player-rating", "{}"))
        rating = rating_data.get("rating")
    except (json.JSONDecodeError, AttributeError):
        pass

    games_played = None
    try:
        history = json.loads(data.get("chess-study-game-history", "[]"))
        games_played = len(history) if isinstance(history, list) else None
    except (json.JSONDecodeError, AttributeError):
        pass

    return {
        "tournamentPoints": tournament_points,
        "tournamentWins": tournament_wins,
        "rating": rating,
        "gamesPlayed": games_played,
    }


def _extract_detail_stats(profile: Optional[dict]) -> dict:
    """Igual criterio defensivo que _extract_summary_stats — más campos,
    para la vista de detalle de un usuario puntual (no la lista completa,
    ahí alcanza con el resumen)."""
    data = (profile or {}).get("data") or {}
    detail = _extract_summary_stats(profile)

    win_streak = None
    best_win_streak = None
    try:
        tournament = json.loads(data.get("chess-study-tournament", "{}"))
        win_streak = tournament.get("winStreak")
        best_win_streak = tournament.get("bestWinStreak")
    except (json.JSONDecodeError, AttributeError):
        pass

    achievements_count = None
    try:
        achievements = json.loads(data.get("chess-study-achievements", "[]"))
        achievements_count = len(achievements) if isinstance(achievements, list) else None
    except (json.JSONDecodeError, AttributeError):
        pass

    puzzles_solved = None
    try:
        puzzles_solved = int(data.get("chess-study-puzzles-solved", "0"))
    except (ValueError, TypeError):
        pass

    detail.update({
        "winStreak": win_streak,
        "bestWinStreak": best_win_streak,
        "achievementsCount": achievements_count,
        "puzzlesSolved": puzzles_solved,
    })
    return detail


@app.get("/api/admin/users")
async def admin_list_users(username: str = Depends(get_current_user)):
    if not is_admin(username):
        raise HTTPException(403, "No tienes permiso para ver esto.")

    usernames = await ustore.list_usernames()
    result = []
    for uname in usernames:
        user = await ustore.get_user(uname)
        profile = await pstore.get_profile(uname)
        result.append({
            "username": uname,
            "createdAt": (user or {}).get("created_at"),
            **_extract_summary_stats(profile),
        })
    return {"users": result}


@app.get("/api/admin/users/{target_username}")
async def admin_get_user(target_username: str, username: str = Depends(get_current_user)):
    if not is_admin(username):
        raise HTTPException(403, "No tienes permiso para ver esto.")

    target = target_username.strip().lower()
    user = await ustore.get_user(target)
    if not user:
        raise HTTPException(404, "Ese usuario no existe.")

    profile = await pstore.get_profile(target)
    return {
        "username": target,
        "createdAt": user.get("created_at"),
        **_extract_detail_stats(profile),
    }


@app.patch("/api/admin/users/{target_username}")
async def admin_edit_user(target_username: str, body: AdminEditUserRequest, username: str = Depends(get_current_user)):
    """Edita campos puntuales del perfil de otro usuario — escribe
    directo en los mismos JSON strings que ya usa profileBackup.js, para
    que el propio usuario los vea sincronizados normal la próxima vez que
    abra la app, sin ningún camino especial."""
    if not is_admin(username):
        raise HTTPException(403, "No tienes permiso para hacer esto.")

    target = target_username.strip().lower()
    user = await ustore.get_user(target)
    if not user:
        raise HTTPException(404, "Ese usuario no existe.")

    profile = await pstore.get_profile(target) or {}
    data = dict(profile.get("data") or {})

    if body.rating is not None:
        try:
            rating_data = json.loads(data.get("chess-study-player-rating", "{}"))
        except (json.JSONDecodeError, AttributeError):
            rating_data = {}
        rating_data["rating"] = body.rating
        data["chess-study-player-rating"] = json.dumps(rating_data)

    if body.tournamentPoints is not None or body.tournamentWins is not None:
        try:
            tournament = json.loads(data.get("chess-study-tournament", "{}"))
        except (json.JSONDecodeError, AttributeError):
            tournament = {}
        if body.tournamentPoints is not None:
            tournament["points"] = body.tournamentPoints
        if body.tournamentWins is not None:
            tournament["wins"] = body.tournamentWins
        data["chess-study-tournament"] = json.dumps(tournament)

    await pstore.save_profile(target, {**profile, "data": data})
    updated_profile = await pstore.get_profile(target)
    return {
        "username": target,
        "createdAt": user.get("created_at"),
        **_extract_detail_stats(updated_profile),
    }


@app.delete("/api/admin/users/{target_username}")
async def admin_delete_user(target_username: str, username: str = Depends(get_current_user)):
    if not is_admin(username):
        raise HTTPException(403, "No tienes permiso para hacer esto.")

    target = target_username.strip().lower()
    if target == username.strip().lower():
        raise HTTPException(400, "No puedes borrar tu propia cuenta desde acá.")

    deleted = await ustore.delete_user(target)
    if not deleted:
        raise HTTPException(404, "Ese usuario no existe.")

    await pstore.delete_profile(target)
    return {"deleted": True, "username": target}


@app.post("/api/games", status_code=201)
async def create_game(body: NewGameRequest):
    if not is_valid_difficulty(body.difficulty):
        raise HTTPException(400, "Dificultad inválida. Tiene que ser un número entre 0 y 100.")
    if body.color not in ("w", "b", "random"):
        raise HTTPException(400, "Color inválido. Usa 'w', 'b' o 'random'.")

    game_id = str(uuid.uuid4())
    board = chess.Board()
    human_color = resolve_human_color(body.color)
    cpu_color = "b" if human_color == "w" else "w"
    apply_handicap(board, body.handicap, cpu_color)
    rounded_difficulty = round(float(body.difficulty))
    last_move = None

    if human_color == "b":
        opening = get_cpu_move(board, rounded_difficulty)
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
        "moves": board_sans(board, body.handicap, cpu_color),
        "difficulty": rounded_difficulty,
        "humanColor": human_color,
        "handicap": body.handicap,
        "lastMove": last_move,
    }
    await store.create_game(game_id, entry)
    return serialize_game(game_id, entry, board)


@app.get("/api/games/{game_id}")
async def get_game(game_id: str):
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    return serialize_game(game_id, entry, load_board(entry))


@app.get("/api/games/{game_id}/moves")
async def legal_moves(game_id: str, square: str):
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    board = load_board(entry)
    try:
        from_sq = chess.parse_square(square)
    except ValueError:
        raise HTTPException(400, "Casilla inválida.")

    moves = [m for m in board.legal_moves if m.from_square == from_sq]
    return {
        "moves": [
            {
                "to": chess.square_name(m.to_square),
                "san": board.san(m),
                "promotion": m.promotion is not None,
            }
            for m in moves
        ]
    }


@app.get("/api/games/{game_id}/hint")
async def hint(game_id: str):
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    board = load_board(entry)

    if board.is_game_over():
        raise HTTPException(400, "La partida ya terminó.")
    turn = "w" if board.turn == chess.WHITE else "b"
    if turn != entry["humanColor"]:
        raise HTTPException(400, "No es tu turno.")

    suggestion = get_cpu_move(board, HINT_STRENGTH)
    if not suggestion:
        raise HTTPException(404, "No hay jugadas disponibles.")
    return suggestion


@app.post("/api/games/{game_id}/undo")
async def undo(game_id: str):
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    board = load_board(entry)

    if len(board.move_stack) == 0:
        raise HTTPException(400, "No hay jugadas para deshacer.")

    undo_count = 2 if entry.get("lastMove") and entry["lastMove"].get("by") == "cpu" else 1
    for _ in range(undo_count):
        if len(board.move_stack) == 0:
            break
        board.pop()

    cpu_color_for_entry = "b" if entry.get("humanColor", "w") == "w" else "w"
    remaining_sans = board_sans(board, entry.get("handicap"), cpu_color_for_entry)
    if not remaining_sans:
        entry["lastMove"] = None
    else:
        # Reconstruimos el último movimiento verbose reproduciendo hasta el final.
        last_mv = board.move_stack[-1]
        mover_before = chess.Board()
        for mv in board.move_stack[:-1]:
            mover_before.push(mv)
        side_that_moved = "w" if (len(remaining_sans) - 1) % 2 == 0 else "b"
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


@app.post("/api/analyze")
@limiter.limit("60/minute", exempt_when=has_valid_api_key)
@limiter.limit("1000/minute", key_func=api_key_bucket, exempt_when=lambda request: not has_valid_api_key(request))
async def analyze(request: Request, body: AnalyzeRequest, _: Optional[str] = Depends(require_user_or_m2m)):
    try:
        board = chess.Board(body.fen)
    except ValueError:
        raise HTTPException(400, "FEN inválido.")
    if board.is_game_over():
        raise HTTPException(400, "Esa posición ya está terminada.")

    level = body.level if is_valid_difficulty(body.level) else HINT_STRENGTH
    suggestion = get_cpu_move(board, level)
    if not suggestion:
        raise HTTPException(404, "No hay jugadas disponibles.")
    return suggestion


_PROMOTION_PIECES = {"q": chess.QUEEN, "r": chess.ROOK, "b": chess.BISHOP, "n": chess.KNIGHT}


def resolve_move(board: chess.Board, from_sq: str, to_sq: str, promotion: Optional[str]) -> Optional[chess.Move]:
    """Encuentra la jugada legal que corresponde a un from/to (más la pieza
    de coronación, si hace falta elegir). Construir el UCI a mano
    (`f"{from}{to}{promo}"`) es tentador pero incorrecto: agregar la letra
    de coronación a un movimiento que NO corona lo corrompe. Buscar entre
    las jugadas legales de verdad evita ese problema de raíz."""
    try:
        from_square = chess.parse_square(from_sq)
        to_square = chess.parse_square(to_sq)
    except ValueError:
        return None

    candidates = [m for m in board.legal_moves if m.from_square == from_square and m.to_square == to_square]
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]

    # Más de una candidata solo pasa en una coronación (una jugada por cada
    # pieza posible) — elegimos la que pidieron, o dama por defecto.
    wanted = _PROMOTION_PIECES.get((promotion or "q").lower(), chess.QUEEN)
    for move in candidates:
        if move.promotion == wanted:
            return move
    return candidates[0]


MATE_SCORE_SENTINEL = 100000.0


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


@app.post("/api/analyze-move")
@limiter.limit("180/minute", exempt_when=has_valid_api_key)
@limiter.limit("1000/minute", key_func=api_key_bucket, exempt_when=lambda request: not has_valid_api_key(request))
async def analyze_move_endpoint(request: Request, body: AnalyzeMoveRequest, _: Optional[str] = Depends(require_user_or_m2m)):
    try:
        board = chess.Board(body.fen)
    except ValueError:
        raise HTTPException(400, "FEN inválido.")
    if board.is_game_over():
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


@app.post("/api/games/{game_id}/move")
async def play_move(game_id: str, body: MoveRequest):
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    board = load_board(entry)

    if board.is_game_over():
        raise HTTPException(400, "La partida ya terminó.")
    turn = "w" if board.turn == chess.WHITE else "b"
    if turn != entry["humanColor"]:
        raise HTTPException(400, "No es el turno del jugador.")

    try:
        move = resolve_move(board, body.from_square, body.to, body.promotion)
        if move is None:
            raise ValueError("Movimiento ilegal.")
        human_move = move_to_dict(board, move)
        board.push(move)
    except Exception:
        raise HTTPException(400, "Movimiento ilegal.")

    entry["lastMove"] = {
        "from": human_move["from"],
        "to": human_move["to"],
        "by": "human",
        "captured": human_move["captured"],
        "piece": human_move["piece"],
    }

    if not board.is_game_over():
        cpu_move = get_cpu_move(board, entry["difficulty"])
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
    entry["moves"] = board_sans(board, entry.get("handicap"), cpu_color_for_move)
    await store.update_game(game_id, entry)
    return serialize_game(game_id, entry, board)


@app.delete("/api/games/{game_id}", status_code=204)
async def delete_game(game_id: str):
    existed = await store.delete_game(game_id)
    if not existed:
        raise HTTPException(404, "Partida no encontrada.")
    return None


# Perfil único (sin cuentas): torneo, ejército de combate, rating, logros...
# todo lo que el frontend ya sabe exportar/importar como JSON
# (profileBackup.js) se guarda acá tal cual, sin que el backend necesite
# entender su forma interna — es un passthrough puro.

@app.get("/api/profile")
async def get_profile(username: str = Depends(get_current_user)):
    profile = await pstore.get_profile(username)
    return profile or {}


@app.put("/api/profile")
async def save_profile(body: dict, username: str = Depends(get_current_user)):
    saved = await pstore.save_profile(username, body)
    return saved


@app.get("/api/health")
@limiter.exempt
async def health():
    return {"ok": True}
