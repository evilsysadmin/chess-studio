"""main.py — API del Estudio de Ajedrez, en FastAPI."""

from __future__ import annotations

import json
import logging
import math
import os
import random
import time
import uuid
from typing import Optional

import chess
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import game_store as store
import profile_store as pstore
import users_store as ustore
from db import PersistentStorageUnavailable
from auth import hash_password, verify_password, create_token, verify_token
from chess_ai import analyze_move as ai_analyze_move
from chess_ai import evaluate_board, get_cpu_move, move_to_dict

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
EXPOSE_API_DOCS = os.environ.get("EXPOSE_API_DOCS", "false").strip().lower() in {"1", "true", "yes", "on"}
ALLOW_REGISTRATION = os.environ.get("ALLOW_REGISTRATION", "true").strip().lower() in {"1", "true", "yes", "on"}

app = FastAPI(
    title="Estudio de Ajedrez API",
    docs_url="/docs" if EXPOSE_API_DOCS else None,
    redoc_url="/redoc" if EXPOSE_API_DOCS else None,
    openapi_url="/openapi.json" if EXPOSE_API_DOCS else None,
)

# Logger de acceso propio. Uvicorn mantiene sus access logs normales, pero
# esta línea añade el dato que más nos interesa al depurar una partida:
# quién generó la petición. Usamos el logger ya configurado por Uvicorn para
# que funcione igual en Docker, local y Render sin inventar otra configuración.
access_logger = logging.getLogger("uvicorn.error")


def _request_id(request: Request) -> str:
    existing = getattr(request.state, "request_id", None)
    if existing:
        return str(existing)
    incoming = (request.headers.get("x-request-id") or "").strip()
    if 6 <= len(incoming) <= 80 and all(c.isalnum() or c in "-_." for c in incoming):
        value = incoming
    else:
        value = uuid.uuid4().hex[:12]
    request.state.request_id = value
    return value


def _request_username(request: Request) -> str:
    """Identidad asociada a la request, si existe.

    Para rutas autenticadas podemos leer el JWT sin tocar Mongo. Login y
    registro no traen JWT todavía; esas rutas escriben ``request.state.username``
    después de autenticar/crear la cuenta para que el middleware también las
    atribuya correctamente. Nunca se loguea el token ni la contraseña.
    """
    state_username = getattr(request.state, "username", None)
    if state_username:
        return str(state_username)

    header = request.headers.get("authorization")
    if not header or not header.startswith("Bearer "):
        return "-"
    username = verify_token(header[len("Bearer "):])
    return username or "-"


@app.middleware("http")
async def log_request_with_user(request: Request, call_next):
    started = time.perf_counter()
    request_id = _request_id(request)
    username_before = _request_username(request)
    status_code = 500
    raised = False
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        raised = True
        elapsed_ms = (time.perf_counter() - started) * 1000
        username = _request_username(request)
        if username == "-":
            username = username_before
        access_logger.exception(
            "request request_id=%s user=%s method=%s path=%s status=500 duration_ms=%.1f",
            request_id,
            username,
            request.method,
            request.url.path,
            elapsed_ms,
        )
        # El detalle técnico completo queda en el traceback de Render; al
        # navegador sólo vuelve una referencia segura para correlacionarlo.
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor.", "requestId": request_id},
            headers={"X-Request-ID": request_id},
        )
    finally:
        if not raised:
            elapsed_ms = (time.perf_counter() - started) * 1000
            username = _request_username(request)
            if username == "-":
                username = username_before
            access_logger.info(
                "request request_id=%s user=%s method=%s path=%s status=%s duration_ms=%.1f",
                request_id,
                username,
                request.method,
                request.url.path,
                status_code,
                elapsed_ms,
            )


@app.exception_handler(PersistentStorageUnavailable)
async def persistent_storage_unavailable_handler(request: Request, exc: PersistentStorageUnavailable):
    # Si MONGO_URL está configurada, una caída de Mongo NO equivale a
    # "usuario/perfil inexistente". Devolvemos 503 para que el frontend no
    # borre ni reemplace datos válidos por una caché/default local.
    return JSONResponse(
        status_code=503,
        content={"detail": "La base de datos no está disponible temporalmente.", "requestId": _request_id(request)},
        headers={"X-Request-ID": _request_id(request)},
    )

_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
_CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.environ.get("CORS_ORIGINS", ",".join(_DEFAULT_CORS_ORIGINS)).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-API-Key"],
    expose_headers=["X-Request-ID"],
)

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


# `ADMIN_USERNAMES` — mismo espíritu que M2M_API_KEYS: una lista separada
# por comas en una variable de entorno, no un flag hardcodeado en el
# código ni una columna nueva que migrar en cada usuario. Sin configurar
# (caso por defecto), el set queda vacío — nadie es admin, cero cambio de
# comportamiento respecto a como estaba antes. Los usernames ya se
# normalizan a minúscula en el registro/login, así que la comparación acá
# también lo hace, para no depender de que quien configure la variable
# recuerde escribirlo exactamente igual.
_ADMIN_USERNAMES = {u.strip().lower() for u in os.environ.get("ADMIN_USERNAMES", "").split(",") if u.strip()}


def is_admin(username: str) -> bool:
    # Comodín pensado para desarrollo local: ADMIN_USERNAMES="*" convierte
    # cualquier cuenta autenticada en admin. En producción conviene usar una
    # lista explícita de usernames.
    return "*" in _ADMIN_USERNAMES or username.lower() in _ADMIN_USERNAMES


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

class RegisterRequest(BaseModel):
    username: str
    password: str


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


async def get_user_or_m2m(request: Request) -> str:
    """Autenticación para endpoints de cálculo reutilizables.

    Un humano entra con JWT. Automatizaciones de confianza pueden usar una
    X-API-Key configurada en M2M_API_KEYS. No existe acceso anónimo.
    """
    if has_valid_api_key(request):
        request.state.username = "m2m"
        return "m2m"
    return await get_current_user(request)


async def get_owned_game(game_id: str, username: str) -> dict:
    """Carga una partida únicamente si pertenece al usuario autenticado.

    Las partidas creadas antes de V10 no tenían owner. Se rechazan en lugar
    de adjudicárselas al primer usuario que conozca el UUID: seguridad antes
    que una migración implícita ambigua.
    """
    entry = await store.get_game(game_id)
    if not entry:
        raise HTTPException(404, "Partida no encontrada.")
    owner = entry.get("owner")
    if owner is None:
        raise HTTPException(409, "Partida antigua sin propietario. Inicia una partida nueva.")
    if owner != username:
        # 404 evita confirmar a otro usuario que ese UUID existe.
        raise HTTPException(404, "Partida no encontrada.")
    return entry


@app.post("/api/auth/register", status_code=201)
@limiter.limit("5/hour")
async def register(body: RegisterRequest, request: Request):
    if not ALLOW_REGISTRATION:
        raise HTTPException(403, "El registro público está deshabilitado.")
    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "El usuario tiene que tener al menos 3 caracteres.")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña tiene que tener al menos 6 caracteres.")
    existing = await ustore.get_user(username)
    if existing:
        raise HTTPException(409, "Ese usuario ya existe.")
    try:
        await ustore.create_user(username, hash_password(body.password))
    except ustore.UserAlreadyExists:
        # Cubre la carrera entre el GET anterior y el INSERT único de Mongo.
        raise HTTPException(409, "Ese usuario ya existe.")
    request.state.username = username
    return {"token": create_token(username), "username": username}


@app.post("/api/auth/login")
@limiter.limit("10/minute")
async def login(body: LoginRequest, request: Request):
    username = body.username.strip().lower()
    user = await ustore.get_user(username)
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Usuario o contraseña incorrectos.")
    request.state.username = username
    return {"token": create_token(username), "username": username}


@app.get("/api/auth/me")
async def me(username: str = Depends(get_current_user)):
    return {"username": username, "isAdmin": is_admin(username)}


def _profile_json(data: dict, key: str, default):
    raw = data.get(key)
    if not isinstance(raw, str):
        return default
    try:
        value = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return default
    return value


def _longest_win_streak(records: list[dict]) -> int:
    ordered = sorted(
        (r for r in records if isinstance(r, dict)),
        key=lambda r: str(r.get("date") or ""),
    )
    best = current = 0
    for record in ordered:
        if record.get("outcome") == "win":
            current += 1
            best = max(best, current)
        else:
            current = 0
    return best


def _extract_summary_stats(profile: Optional[dict]) -> dict:
    """Resumen enriquecido para el panel de admin.

    Todo sale de la foto de perfil que ya sincroniza el frontend: abrir el
    panel NO dispara análisis del motor ni recorre partidas activas. Si un
    dato todavía no existe (por ejemplo, nunca se buscó la peor jugada), se
    devuelve None y la UI muestra un guion.
    """
    data = (profile or {}).get("data") or {}

    tournament = _profile_json(data, "chess-study-tournament", {})
    if not isinstance(tournament, dict):
        tournament = {}

    rating_data = _profile_json(data, "chess-study-player-rating", {})
    if not isinstance(rating_data, dict):
        rating_data = {}

    rating_history = _profile_json(data, "chess-study-rating-history", [])
    if not isinstance(rating_history, list):
        rating_history = []

    game_history = _profile_json(data, "chess-study-game-history", [])
    if not isinstance(game_history, list):
        game_history = []

    combat_history = _profile_json(data, "chess-study-combat-history", [])
    if not isinstance(combat_history, list):
        combat_history = []

    worst_cache = _profile_json(data, "chess-study-worst-move-cache", {})
    if not isinstance(worst_cache, dict):
        worst_cache = {}

    achievements = _profile_json(data, "chess-study-achievements", [])
    if not isinstance(achievements, list):
        achievements = []

    puzzles_solved = _profile_json(data, "chess-study-puzzles-solved", 0)
    puzzle_best_streak = _profile_json(data, "chess-study-puzzle-best-streak", 0)

    personal_puzzles = _profile_json(data, "chess-study-personal-puzzles", [])
    if not isinstance(personal_puzzles, list):
        personal_puzzles = []

    rivalry = _profile_json(data, "chess-study-cpu-rivalry", {})
    if not isinstance(rivalry, dict):
        rivalry = {}

    daily_challenge = _profile_json(data, "chess-study-daily-challenge", {})
    if not isinstance(daily_challenge, dict):
        daily_challenge = {}

    all_records = [r for r in [*game_history, *combat_history] if isinstance(r, dict)]
    wins = sum(1 for r in all_records if r.get("outcome") == "win")
    draws = sum(1 for r in all_records if r.get("outcome") == "draw")
    losses = sum(1 for r in all_records if r.get("outcome") == "loss")
    total_games = len(all_records)

    best_difficulty_win = None
    for record in all_records:
        if record.get("outcome") != "win":
            continue
        try:
            difficulty = int(round(float(record.get("difficulty"))))
        except (TypeError, ValueError):
            continue
        best_difficulty_win = difficulty if best_difficulty_win is None else max(best_difficulty_win, difficulty)

    human_captures = queens_captured = queens_lost = 0
    white_games = black_games = 0
    for record in game_history:
        if not isinstance(record, dict):
            continue
        human_color = record.get("humanColor")
        if human_color == "w":
            white_games += 1
        elif human_color == "b":
            black_games += 1
        for index, move in enumerate(record.get("moves") or []):
            if not isinstance(move, dict):
                continue
            mover = "w" if index % 2 == 0 else "b"
            if not move.get("captured"):
                continue
            captured_piece = move.get("capturedPiece")
            if mover == human_color:
                human_captures += 1
                if captured_piece == "q":
                    queens_captured += 1
            elif captured_piece == "q":
                queens_lost += 1

    worst_move = None
    analyzed_games = 0
    for game_id, cached in worst_cache.items():
        if not isinstance(cached, dict):
            continue
        worst = cached.get("worst")
        if not isinstance(worst, dict):
            continue
        analyzed_games += 1
        try:
            loss = int(worst.get("loss"))
        except (TypeError, ValueError):
            continue
        candidate = {
            "gameId": game_id,
            "played": worst.get("played"),
            "suggested": worst.get("suggested"),
            "loss": loss,
            "moveNumber": worst.get("moveNumber"),
            "severity": worst.get("severity"),
            "analyzedAt": cached.get("analyzedAt"),
        }
        if worst_move is None or loss > worst_move["loss"]:
            worst_move = candidate

    rating_values = []
    for point in rating_history:
        if not isinstance(point, dict):
            continue
        try:
            rating_values.append(int(round(float(point.get("rating")))))
        except (TypeError, ValueError):
            pass
    current_rating = rating_data.get("rating")
    try:
        current_rating = int(round(float(current_rating))) if current_rating is not None else None
    except (TypeError, ValueError):
        current_rating = None
    if current_rating is not None:
        rating_values.append(current_rating)

    recent = sorted(all_records, key=lambda r: str(r.get("date") or ""), reverse=True)[:5]

    rivalry_games = 0
    rivalry_record = rivalry.get("record")
    if isinstance(rivalry_record, dict):
        try:
            rivalry_games = int(rivalry_record.get("games") or rivalry.get("totalGames") or 0)
        except (TypeError, ValueError):
            rivalry_games = 0
    else:
        # Compatibilidad con perfiles V7: antes había un marcador por personalidad.
        for row in (rivalry.get("byPersona") or {}).values():
            if isinstance(row, dict):
                try:
                    rivalry_games += int(row.get("games") or 0)
                except (TypeError, ValueError):
                    pass

    sin_labels = {
        "human:MISSED_MATE": "mates ignorados",
        "human:ALLOWED_MATE": "mates regalados",
        "human:QUEEN_EN_PRISE_TO_PAWN": "damas expuestas a peón",
        "human:STALEMATE_BLUNDER": "ahogados criminales",
        "cpu:PAWN_TAKES_QUEEN": "damas perdidas contra peón",
        "cpu:KNIGHT_FORK": "horquillas de caballo sufridas",
        "cpu:PAWN_FORK": "horquillas de peón sufridas",
    }
    incidents = rivalry.get("incidents") or {}
    most_common_sin = None
    if isinstance(incidents, dict):
        candidates = []
        for key, value in incidents.items():
            if key not in sin_labels:
                continue
            try:
                count = int(value)
            except (TypeError, ValueError):
                continue
            candidates.append((count, key))
        if candidates:
            count, key = max(candidates)
            most_common_sin = {"label": sin_labels[key], "count": count}

    return {
        "tournamentPoints": tournament.get("points"),
        "tournamentWins": tournament.get("wins"),
        "rating": current_rating,
        "ratingGames": rating_data.get("games"),
        "ratingPeak": max(rating_values) if rating_values else current_rating,
        # Compatibilidad con la columna que ya existía: partidas normales
        # guardadas en game-history, sin mezclar Combate.
        "gamesPlayed": len(game_history),
        "combatBattles": len(combat_history),
        "totalGames": total_games,
        "wins": wins,
        "draws": draws,
        "losses": losses,
        "winPct": round((wins / total_games) * 100) if total_games else None,
        "longestWinStreak": _longest_win_streak(all_records),
        "bestDifficultyWin": best_difficulty_win,
        "humanCaptures": human_captures,
        "queensCaptured": queens_captured,
        "queensLost": queens_lost,
        "whiteGames": white_games,
        "blackGames": black_games,
        "analyzedGames": analyzed_games,
        "worstMove": worst_move,
        "achievements": len(achievements),
        "puzzlesSolved": puzzles_solved if isinstance(puzzles_solved, (int, float)) else 0,
        "puzzleBestStreak": puzzle_best_streak if isinstance(puzzle_best_streak, (int, float)) else 0,
        "personalPuzzles": len(personal_puzzles),
        "rivalryGames": rivalry_games,
        "mostCommonSin": most_common_sin,
        "dailyBestStreak": daily_challenge.get("bestStreak", 0) if isinstance(daily_challenge, dict) else 0,
        "recentForm": [r.get("outcome") for r in recent if r.get("outcome") in {"win", "draw", "loss"}],
    }


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


@app.post("/api/games", status_code=201)
async def create_game(body: NewGameRequest, username: str = Depends(get_current_user)):
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
        "owner": username,
        "moves": board_sans(board, body.handicap, cpu_color),
        "difficulty": rounded_difficulty,
        "humanColor": human_color,
        "handicap": body.handicap,
        "lastMove": last_move,
    }
    await store.create_game(game_id, entry)
    return serialize_game(game_id, entry, board)


@app.get("/api/games/{game_id}")
async def get_game(game_id: str, username: str = Depends(get_current_user)):
    entry = await get_owned_game(game_id, username)
    return serialize_game(game_id, entry, load_board(entry))


@app.get("/api/games/{game_id}/moves")
async def legal_moves(game_id: str, square: str, username: str = Depends(get_current_user)):
    entry = await get_owned_game(game_id, username)
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
async def hint(game_id: str, username: str = Depends(get_current_user)):
    entry = await get_owned_game(game_id, username)
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
async def undo(game_id: str, username: str = Depends(get_current_user)):
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
async def analyze(request: Request, body: AnalyzeRequest, _actor: str = Depends(get_user_or_m2m)):
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
async def analyze_move_endpoint(request: Request, body: AnalyzeMoveRequest, _actor: str = Depends(get_user_or_m2m)):
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
async def play_move(game_id: str, body: MoveRequest, username: str = Depends(get_current_user)):
    entry = await get_owned_game(game_id, username)
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
async def delete_game(game_id: str, username: str = Depends(get_current_user)):
    await get_owned_game(game_id, username)
    existed = await store.delete_game(game_id)
    if not existed:
        raise HTTPException(404, "Partida no encontrada.")
    return None


# Perfil por usuario autenticado: torneo, ejército, rating, logros, etc.
# El backend lo trata como un passthrough; el dueño siempre sale del JWT,
# nunca del body enviado por el cliente.

@app.get("/api/profile")
async def get_profile(username: str = Depends(get_current_user)):
    profile = await pstore.get_profile(username)
    return profile or {}


@app.put("/api/profile")
async def save_profile(body: dict, username: str = Depends(get_current_user)):
    saved = await pstore.save_profile(username, body)
    return saved


@app.get("/")
@limiter.exempt
async def root(_username: str = Depends(get_current_user)):
    # Útil especialmente detrás de un dominio propio: abrir el hostname en el
    # navegador confirma que el tráfico ha llegado a ESTA app en vez de mostrar
    # el 404 genérico que FastAPI devolvía antes al no existir la ruta raíz.
    return {
        "ok": True,
        "service": "Chess Studio API",
        "health": "/api/health",
    }


@app.get("/api/health")
@limiter.exempt
async def health():
    return {"ok": True}
