"""main.py — API del Estudio de Ajedrez, en FastAPI."""

from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import random
import time
import uuid
import hmac
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote, urlsplit

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
import feedback_store as fstore
from db import PersistentStorageUnavailable
from auth import (
    hash_password, verify_password, create_token, verify_token,
    create_password_reset_token, verify_password_reset_token,
)
from chess_ai import analyze_move as ai_analyze_move
from chess_ai import evaluate_board, get_cpu_move, move_to_dict
from chess_core import apply_handicap, board_sans, load_board, resolve_move, serialize_game
from email_service import send_password_reset_email
from request_limits import RequestBodyLimitMiddleware
from narrative_api import build_narrative_router

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
EXPOSE_API_DOCS = os.environ.get("EXPOSE_API_DOCS", "false").strip().lower() in {"1", "true", "yes", "on"}
ALLOW_REGISTRATION = os.environ.get("ALLOW_REGISTRATION", "true").strip().lower() in {"1", "true", "yes", "on"}
INVITE_CODE = os.environ.get("INVITE_CODE", "").strip()
PASSWORD_RESET_URL = os.environ.get("PASSWORD_RESET_URL", "http://localhost:5173/").strip()
ENABLE_EMAIL_RECOVERY = os.environ.get("ENABLE_EMAIL_RECOVERY", "false").strip().lower() in {"1", "true", "yes", "on"}

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

# CORS: el navegador manda únicamente el *origin* (scheme + host + puerto),
# nunca la ruta de GitHub Pages. Es fácil configurar por accidente
# CORS_ORIGINS=https://evilsysadmin.github.io/chess-studio/ en Render y que
# Starlette lo rechace porque el Origin real es https://evilsysadmin.github.io.
# Normalizamos cualquier URL configurada y conservamos siempre los orígenes
# conocidos de desarrollo + GitHub Pages. CORS no es una barrera de auth:
# los endpoints siguen exigiendo JWT; esto sólo permite al navegador llegar.
def _normalize_cors_origin(raw: str) -> str:
    value = (raw or "").strip()
    if not value:
        return ""
    try:
        parsed = urlsplit(value if "://" in value else f"https://{value}")
    except ValueError:
        return ""
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


_DEFAULT_CORS_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://evilsysadmin.github.io",
}
_CONFIGURED_CORS_ORIGINS = {
    normalized
    for raw in os.environ.get("CORS_ORIGINS", "").split(",")
    if (normalized := _normalize_cors_origin(raw))
}
_CORS_ORIGINS = sorted(_DEFAULT_CORS_ORIGINS | _CONFIGURED_CORS_ORIGINS)

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
    if not key:
        return None
    for configured in _M2M_API_KEYS:
        if hmac.compare_digest(key, configured):
            return configured
    return None


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
    # Comodín pensado exclusivamente para desarrollo local.
    return "*" in _ADMIN_USERNAMES or username.lower() in _ADMIN_USERNAMES


if ENVIRONMENT in {"production", "prod"} and "*" in _ADMIN_USERNAMES:
    raise RuntimeError('ADMIN_USERNAMES="*" no está permitido en producción.')


def api_key_bucket(request: Request) -> str:
    """key_func para el límite M2M: cada API key tiene su propio balde de
    cupo, separado del tráfico público por IP — dos scripts con keys
    distintas no se pisan el cupo entre sí, ni se lo pisan a la IP
    pública que comparten si corren desde la misma máquina."""
    return get_api_key(request) or ""

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

MAX_REQUEST_BODY_BYTES = 1_048_576  # 1 MiB; la API solo acepta JSON pequeño.
# Cuenta bytes reales, no solo Content-Length: también cubre cuerpos chunked.
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)

# Añadido DESPUÉS de SlowAPI/body-limit para que CORS sea la capa exterior y
# pueda contestar preflight OPTIONS antes de rate-limit/routing.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)

@app.middleware("http")
async def security_baseline(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
    if ENVIRONMENT in {"production", "prod"}:
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return response

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


# Las reglas puras/replay/serialización viven en chess_core.py.


# ---------- Modelos de entrada ----------
# "from" es palabra reservada en Python, así que el campo se llama
# `from_square` en el código pero se sigue mandando/recibiendo como "from"
# en el JSON (alias) — el frontend no ve ninguna diferencia.


class ActivityHeartbeatRequest(BaseModel):
    activity: Optional[str] = Field(default=None, max_length=40)
    foreground: Optional[bool] = None
    release: Optional[str] = Field(default=None, max_length=32)

class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)
    email: Optional[str] = Field(default=None, max_length=254)
    invite_code: Optional[str] = Field(default=None, alias="inviteCode", max_length=128)


class LoginRequest(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(max_length=254)


class ResetPasswordRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    token: str = Field(max_length=4096)
    new_password: str = Field(alias="newPassword", max_length=128)


class UpdateEmailRequest(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=128)


class AdminInsightsRequest(BaseModel):
    username: str = Field(max_length=64)


class FeedbackRequest(BaseModel):
    category: str = Field(default="other", max_length=24)
    message: str = Field(max_length=2000)
    context: Optional[str] = Field(default="Home", max_length=80)


class AdminFeedbackStatusRequest(BaseModel):
    status: str = Field(max_length=16)


class AdminDeleteUserRequest(BaseModel):
    username: str = Field(max_length=64)


class GhostStyle(BaseModel):
    # Sesgos derivados de partidas reales del usuario. El rango estrecho
    # evita que un cliente manipulado convierta el desempate de estilo en una
    # orden arbitraria para el motor.
    capture: float = Field(default=0.0, ge=-1.0, le=1.0)
    pawn: float = Field(default=0.0, ge=-1.0, le=1.0)
    queen: float = Field(default=0.0, ge=-1.0, le=1.0)
    check: float = Field(default=0.0, ge=-1.0, le=1.0)
    castle: float = Field(default=0.0, ge=-1.0, le=1.0)


class NewGameRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    difficulty: float = 50
    color: str = "w"
    handicap: Optional[str] = None  # None | "pawn" | "knight" | "rook" | "queen" — ver HANDICAP_SQUARES
    starting_fen: Optional[str] = Field(default=None, alias="startingFen")
    ghost_style: Optional[GhostStyle] = Field(default=None, alias="ghostStyle")


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




_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

def _normalize_email(value: str | None) -> str | None:
    email = (value or "").strip().lower()
    if not email:
        return None
    if len(email) > 254 or not _EMAIL_RE.fullmatch(email):
        raise HTTPException(400, "Introduce un email válido.")
    return email


def _password_reset_link(token: str) -> str:
    base = PASSWORD_RESET_URL or "http://localhost:5173/"
    separator = "&" if "?" in base else "?"
    return f"{base}{separator}resetToken={quote(token, safe='')}"


# ---------- Rutas ----------

# Auth humano: usuario+contraseña + email opcional de recuperación, sin OAuth.
# `INVITE_CODE` puede gatear las altas y `ALLOW_REGISTRATION` cerrarlas por
# completo. Login/registro y el flujo de reset son las rutas de identidad que
# necesariamente son públicas.

def get_current_user_optional(authorization: Optional[str] = None) -> Optional[str]:
    """No se usa como Depends() de FastAPI directo -- ver get_current_user
    más abajo, que sí lo es. Esta versión queda para tests/uso directo."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return verify_token(authorization[len("Bearer "):])


async def _touch_activity_best_effort(username: str, *, force: bool = False) -> None:
    """La presencia es telemetría útil, nunca una dependencia del juego.

    Si Mongo tiene un tropiezo puntual no vamos a convertir un heartbeat o un
    análisis perfectamente válido en un 503 solo porque no pudimos actualizar
    el puntito verde del panel admin. Las operaciones que SÍ necesitan Mongo
    siguen propagando su error normalmente.
    """
    try:
        await ustore.touch_last_activity(username, force=force)
    except PersistentStorageUnavailable:
        access_logger.warning("No se pudo actualizar last_activity para user=%s", username)


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
    try:
        account_exists = await ustore.user_exists(username)
    except PersistentStorageUnavailable as exc:
        # Auth falla cerrado: si no podemos comprobar que la cuenta sigue
        # existiendo, no concedemos acceso basándonos solo en un JWT viejo.
        raise HTTPException(503, "No se puede verificar la sesión temporalmente.") from exc
    if not account_exists:
        raise HTTPException(401, "La cuenta ya no existe.")
    await _touch_activity_best_effort(username)
    return username


async def require_admin(username: str = Depends(get_current_user)) -> str:
    if not is_admin(username):
        raise HTTPException(403, "No tienes permisos de administrador.")
    return username

# LLM narrative transport: facts stay authoritative in Chess Studio.
app.include_router(build_narrative_router(auth_dependency=get_current_user, admin_dependency=require_admin))


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
        raise HTTPException(403, "El registro está deshabilitado temporalmente.")
    if INVITE_CODE:
        supplied = (body.invite_code or "").strip()
        if not supplied or not hmac.compare_digest(supplied, INVITE_CODE):
            # No distinguimos entre ausente e incorrecto: menos información
            # gratis para quien esté tanteando el endpoint.
            raise HTTPException(403, "Código de invitación no válido.")
    username = body.username.strip().lower()
    if len(username) < 3:
        raise HTTPException(400, "El usuario tiene que tener al menos 3 caracteres.")
    if len(body.password) < 6:
        raise HTTPException(400, "La contraseña tiene que tener al menos 6 caracteres.")
    email = _normalize_email(body.email) if ENABLE_EMAIL_RECOVERY else None
    if ENABLE_EMAIL_RECOVERY and not email:
        raise HTTPException(400, "El email es obligatorio para cuentas nuevas.")
    existing = await ustore.get_user(username)
    if existing:
        raise HTTPException(409, "Ese usuario ya existe.")
    if email and await ustore.get_user_by_email(email):
        raise HTTPException(409, "Ese email ya está asociado a otra cuenta.")
    try:
        await ustore.create_user(username, hash_password(body.password), email=email)
    except ustore.UserEmailAlreadyExists:
        raise HTTPException(409, "Ese email ya está asociado a otra cuenta.")
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
    await _touch_activity_best_effort(username, force=True)
    return {"token": create_token(username), "username": username}


@app.post("/api/auth/forgot-password")
@limiter.limit("5/hour")
async def forgot_password(body: ForgotPasswordRequest, request: Request):
    if not ENABLE_EMAIL_RECOVERY:
        raise HTTPException(404, "Recuperación por email no habilitada.")
    # Respuesta deliberadamente idéntica exista o no la cuenta: no regalamos
    # un enumerador de usuarios/emails a Internet.
    email = _normalize_email(body.email)
    user = await ustore.get_user_by_email(email) if email else None
    if user and user.get("password_hash"):
        reset_token = create_password_reset_token(user["username"], user["password_hash"])
        reset_url = _password_reset_link(reset_token)
        await asyncio.to_thread(send_password_reset_email, email, reset_url)
    return {"ok": True, "message": "Si ese email está registrado, recibirás un enlace de recuperación."}


@app.post("/api/auth/reset-password")
@limiter.limit("10/hour")
async def reset_password(body: ResetPasswordRequest, request: Request):
    if not ENABLE_EMAIL_RECOVERY:
        raise HTTPException(404, "Recuperación por email no habilitada.")
    if len(body.new_password) < 6:
        raise HTTPException(400, "La contraseña tiene que tener al menos 6 caracteres.")
    # El username está firmado dentro del token, pero necesitamos el hash
    # actual para que el enlace quede invalidado en cuanto se use/cambie.
    try:
        import jwt as _jwt
        unverified = _jwt.decode(body.token, options={"verify_signature": False})
        username = str(unverified.get("sub") or "").strip().lower()
    except Exception:
        username = ""
    user = await ustore.get_user(username) if username else None
    if not user or verify_password_reset_token(body.token, user.get("password_hash", "")) != username:
        raise HTTPException(400, "El enlace de recuperación no es válido o ha caducado.")
    await ustore.update_password(username, hash_password(body.new_password))
    request.state.username = username
    await _touch_activity_best_effort(username, force=True)
    return {"token": create_token(username), "username": username}


@app.put("/api/auth/email")
async def update_recovery_email(body: UpdateEmailRequest, username: str = Depends(get_current_user)):
    if not ENABLE_EMAIL_RECOVERY:
        raise HTTPException(404, "Recuperación por email no habilitada.")
    user = await ustore.get_user(username)
    if not user or not verify_password(body.password, user.get("password_hash", "")):
        raise HTTPException(401, "La contraseña actual no es correcta.")
    email = _normalize_email(body.email)
    if not email:
        raise HTTPException(400, "El email de recuperación no puede quedar vacío.")
    owner = await ustore.get_user_by_email(email)
    if owner and owner.get("username") != username:
        raise HTTPException(409, "Ese email ya está asociado a otra cuenta.")
    try:
        await ustore.update_email(username, email)
    except ustore.UserEmailAlreadyExists:
        raise HTTPException(409, "Ese email ya está asociado a otra cuenta.")
    return {"username": username, "email": email}


@app.get("/api/auth/me")
async def me(username: str = Depends(get_current_user)):
    user = await ustore.get_user(username)
    payload = {"username": username, "isAdmin": is_admin(username)}
    if ENABLE_EMAIL_RECOVERY:
        payload["email"] = (user or {}).get("email")
    return payload


@app.post("/api/auth/activity", status_code=204)
async def activity_heartbeat(payload: Optional[ActivityHeartbeatRequest] = None, username: str = Depends(get_current_user)):
    # Telemetría deliberadamente gruesa: sólo etiquetas de pantalla/acción,
    # nunca jugadas, FEN, mensajes, rivales ni contenido privado.
    allowed = {
        "Menú principal", "Partida", "Partida rápida", "Torneo", "Combat Chess", "Replay",
        "Así juegas", "Historial", "Puzzle", "Aprendizaje", "Aperturas",
        "Laboratorio", "Espectador", "Panel admin", "Experimento 3D", "Navegando",
    }
    activity = payload.activity if payload and payload.activity in allowed else None
    foreground = payload.foreground if payload else None
    raw_release = (payload.release or '').strip() if payload else ''
    release = raw_release if re.fullmatch(r"v[0-9A-Za-z][0-9A-Za-z._-]{0,30}", raw_release) else None
    await ustore.touch_last_activity(username, force=True, activity=activity, foreground=foreground, release=release)
    return None


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

    game_activity = _profile_json(data, "chess-study-game-activity", [])
    if not isinstance(game_activity, list):
        game_activity = []

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

    series_history = _profile_json(data, "chess-study-series-history", [])
    if not isinstance(series_history, list):
        series_history = []

    # V13: "chess-study-career". Conservamos lectura del prototipo
    # "career-meta" por compatibilidad con alguna build intermedia.
    career_meta = _profile_json(data, "chess-study-career", None)
    if not isinstance(career_meta, dict):
        career_meta = _profile_json(data, "chess-study-career-meta", {})
    if not isinstance(career_meta, dict):
        career_meta = {}
    career_activity = career_meta.get("milestones") if isinstance(career_meta.get("milestones"), list) else career_meta.get("activity") if isinstance(career_meta.get("activity"), list) else []
    current_season = career_meta.get("season") if isinstance(career_meta.get("season"), dict) else None
    puzzle_rush = career_meta.get("puzzleRush") if isinstance(career_meta.get("puzzleRush"), dict) else {}
    run_records = career_meta.get("runRecords") if isinstance(career_meta.get("runRecords"), dict) else {}
    career_records = career_meta.get("records") if isinstance(career_meta.get("records"), dict) else {}
    contract_stats = career_meta.get("contracts") if isinstance(career_meta.get("contracts"), dict) else career_meta.get("contractStats") if isinstance(career_meta.get("contractStats"), dict) else {}
    analysis_archive = _profile_json(data, "chess-study-analysis-archive", {})
    if not isinstance(analysis_archive, dict):
        analysis_archive = {}
    analysis_rows = [row for row in analysis_archive.values() if isinstance(row, dict)]
    accuracy_values = []
    pressure_moves = pressure_incidents = missed_conversions = desperate_saves = 0
    for row in analysis_rows:
        try:
            acc = float(row.get("accuracy"))
            if math.isfinite(acc): accuracy_values.append(acc)
        except (TypeError, ValueError):
            pass
        try: pressure_moves += int(row.get("pressureMoves") or 0)
        except (TypeError, ValueError): pass
        try: pressure_incidents += int(row.get("pressureIncidents") or 0)
        except (TypeError, ValueError): pass
        try:
            peak = float(row.get("peakPerspectiveEval"))
            if math.isfinite(peak) and peak >= 300 and row.get("outcome") not in {None, "win"}: missed_conversions += 1
        except (TypeError, ValueError):
            pass
        try:
            trough = float(row.get("troughPerspectiveEval"))
            if math.isfinite(trough) and trough <= -300 and row.get("outcome") in {"win", "draw"}: desperate_saves += 1
        except (TypeError, ValueError):
            pass
    series_won = sum(1 for row in series_history if isinstance(row, dict) and row.get("winner") == "human")
    series_lost = sum(1 for row in series_history if isinstance(row, dict) and row.get("winner") == "cpu")

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
    material_donated = 0
    piece_values = {"p": 1, "n": 3, "b": 3, "r": 5, "q": 9, "k": 0}
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
            captured_piece = move.get("capturedPiece") or move.get("captured")
            if mover == human_color:
                human_captures += 1
                if captured_piece == "q":
                    queens_captured += 1
            else:
                material_donated += piece_values.get(captured_piece or move.get("captured"), 0)
                if captured_piece == "q" or move.get("captured") == "q":
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
            "index": worst.get("index"),
            "played": worst.get("played"),
            "playedFrom": worst.get("playedFrom"),
            "playedTo": worst.get("playedTo"),
            "playedPiece": worst.get("playedPiece"),
            "suggested": worst.get("suggested"),
            "suggestedFrom": worst.get("suggestedFrom"),
            "suggestedTo": worst.get("suggestedTo"),
            "suggestedPiece": worst.get("suggestedPiece"),
            "loss": loss,
            "moveNumber": worst.get("moveNumber"),
            "severity": worst.get("severity"),
            "evalAfterSuggested": worst.get("evalAfterSuggested"),
            "evalAfterPlayed": worst.get("evalAfterPlayed"),
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

    def recent_mode_label(row: dict) -> tuple[str, str]:
        # Historial estándar y Combat comparten el feed, pero no la estructura.
        # Etiquetamos solo con metadatos ya persistidos; nunca inferimos contenido privado.
        if row.get("variant") in {"combat", "roguelike"} or row.get("roguelikeMode") is not None:
            if row.get("roguelikeMode") == "campaign":
                return "Combat Chess · Campaña", "combat"
            if row.get("roguelikeMode") in {"tower", "endless"}:
                return "Combat Chess · Torre", "combat"
            return "Combat Chess", "combat"
        mode = str(row.get("mode") or "casual")
        labels = {
            "tournament": "Torneo",
            "practice": "Práctica",
            "ghost": "Rival Ghost",
            "nemesis-training": "Némesis",
            "sudden": "Muerte súbita",
            "casual": "Rápida",
        }
        return labels.get(mode, "Rápida"), mode

    recent = sorted(all_records, key=lambda r: str(r.get("date") or ""), reverse=True)[:5]
    recent_game_activity = []

    # Builds nuevas guardan el ciclo de vida explícito de cada partida. Si
    # existe ese journal, es la fuente preferida para Admin porque permite
    # distinguir iniciada/cancelada/finalizada sin inventarlo a partir del
    # historial final. Builds antiguas caen al historial tradicional de abajo.
    lifecycle_rows = [row for row in game_activity if isinstance(row, dict)]
    for row in sorted(lifecycle_rows, key=lambda r: str(r.get("date") or ""), reverse=True)[:12]:
        state = str(row.get("state") or "").lower()
        if state not in {"started", "cancelled", "finished"}:
            continue
        mode_label = row.get("modeLabel")
        if not isinstance(mode_label, str) or not mode_label.strip():
            mode_label, _ = recent_mode_label({"mode": row.get("mode")})
        activity_type = "combat" if str(mode_label).startswith("Combat Chess") else str(row.get("mode") or "casual")
        outcome = row.get("outcome")
        if state == "started":
            text = "Partida iniciada"
        elif state == "cancelled":
            text = "Partida cancelada"
        else:
            result = {"win": "Victoria", "loss": "Derrota", "draw": "Tablas"}.get(outcome)
            text = f"Partida finalizada · {result}" if result else "Partida finalizada"
        recent_game_activity.append({
            "date": row.get("date"),
            "text": text,
            "detail": row.get("detail") if isinstance(row.get("detail"), str) else None,
            "type": activity_type,
            "modeLabel": mode_label,
        })

    if not recent_game_activity:
        for row in recent:
            outcome = row.get("outcome")
            result_label = {"win": "victoria", "loss": "derrota", "draw": "tablas"}.get(outcome, outcome or "partida")
            mode_label, activity_type = recent_mode_label(row)
            details = []
            if row.get("difficulty") is not None:
                details.append(f"CPU {row.get('difficulty')}")
            tc = row.get("timeControl") if isinstance(row.get("timeControl"), dict) else {}
            if tc.get("label"):
                details.append(str(tc.get("label")))
            elif tc.get("id") and tc.get("id") != "none":
                details.append(str(tc.get("id")))
            recent_game_activity.append({
                "date": row.get("date"),
                "text": result_label.capitalize(),
                "detail": " · ".join(details) or None,
                "type": activity_type,
                "modeLabel": mode_label,
            })

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
        "seriesPlayed": len(series_history),
        "seriesWon": series_won,
        "seriesLost": series_lost,
        "recentForm": [r.get("outcome") for r in recent if r.get("outcome") in {"win", "draw", "loss"}],
        "recentActivity": sorted([
            *recent_game_activity,
            *[
                {"date": row.get("date"), "text": row.get("text"), "detail": row.get("detail"), "type": row.get("type")}
                for row in career_activity[:8] if isinstance(row, dict)
            ],
        ], key=lambda row: str(row.get("date") or ""), reverse=True)[:8],
        "currentSeason": {
            "number": current_season.get("id") or current_season.get("number"),
            "games": current_season.get("games", 0) if isinstance(current_season.get("games"), (int, float)) else len(current_season.get("games") or []),
            "target": current_season.get("targetGames", 20),
        } if current_season else None,
        "puzzleRushBest": career_records.get("puzzleRushBest", puzzle_rush.get("bestScore", 0)),
        "streakRunBest": career_records.get("bestStreakRun", run_records.get("streakBest", 0)),
        "bossBestStage": career_records.get("bestBossStage", run_records.get("bossBestStage", 0)),
        "cupBestScore": career_records.get("bestCupScore", 0),
        "suddenDeathWins": career_records.get("suddenDeathWins", 0),
        "avgAccuracy": round(sum(accuracy_values) / len(accuracy_values)) if accuracy_values else None,
        "analysisArchiveGames": len(analysis_rows),
        "pressureMoves": pressure_moves,
        "pressureIncidents": pressure_incidents,
        "pressureIncidentPct": round((pressure_incidents / pressure_moves) * 100) if pressure_moves else None,
        "missedConversions": missed_conversions,
        "desperateSaves": desperate_saves,
        "materialDonated": material_donated,
        "contractsCompleted": contract_stats.get("completed", 0),
        "contractsOffered": contract_stats.get("offered", 0),
    }


def _extract_admin_insights_payload(profile: Optional[dict]) -> dict:
    """Datos necesarios para reutilizar en Admin el mismo ``Así juegas``.

    Se entrega sólo bajo una ruta admin autenticada y sólo al pedir los
    detalles de un usuario. No se devuelve el perfil entero ni secretos de
    sesión: únicamente historiales/estadísticas que la propia pantalla
    ``Así juegas`` consume en el navegador del dueño de la cuenta.
    """
    data = (profile or {}).get("data") or {}

    game_history = _profile_json(data, "chess-study-game-history", [])
    if not isinstance(game_history, list):
        game_history = []

    combat_history = _profile_json(data, "chess-study-combat-history", [])
    if not isinstance(combat_history, list):
        combat_history = []

    rating_history = _profile_json(data, "chess-study-rating-history", [])
    if not isinstance(rating_history, list):
        rating_history = []

    rivalry = _profile_json(data, "chess-study-cpu-rivalry", {})
    if not isinstance(rivalry, dict):
        rivalry = {}

    achievements = _profile_json(data, "chess-study-achievements", [])
    if not isinstance(achievements, list):
        achievements = []

    personal_puzzles = _profile_json(data, "chess-study-personal-puzzles", [])
    if not isinstance(personal_puzzles, list):
        personal_puzzles = []

    puzzles_solved = _profile_json(data, "chess-study-puzzles-solved", 0)
    if not isinstance(puzzles_solved, (int, float)):
        puzzles_solved = 0

    summary = _extract_summary_stats(profile)
    return {
        "gameHistory": game_history,
        "combatHistory": combat_history,
        "ratingHistory": rating_history,
        "rivalry": rivalry,
        "extras": {
            "achievementsUnlocked": len(achievements),
            "puzzlesSolved": puzzles_solved,
            "personalPuzzles": len(personal_puzzles),
            "worstMove": summary.get("worstMove"),
        },
    }


def _foreground_summary(user_doc: dict, *, freshness_seconds: int = 150) -> dict:
    """Estado aproximado de pestaña visible, sin fingir tiempo real.

    El cliente reporta como máximo cada dos minutos y además en cambios de
    visibilidad. Si la pestaña muere sin poder enviar el último evento, el
    estado visible caduca solo tras un pequeño margen.
    """
    raw = user_doc.get("foreground_updated_at")
    reported = user_doc.get("is_foreground")
    if raw is None or not isinstance(reported, bool):
        return {"foreground": None, "foregroundAgeSeconds": None}
    try:
        parsed = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        age = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        return {"foreground": None, "foregroundAgeSeconds": None}
    active = bool(reported) and age <= max(1, int(freshness_seconds))
    return {"foreground": active, "foregroundAgeSeconds": age}


def _presence_summary(last_activity) -> dict:
    if not last_activity:
        return {"lastActivity": None, "presence": "never", "presenceAgeSeconds": None}
    try:
        parsed = datetime.fromisoformat(str(last_activity).replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        age = max(0, int((datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds()))
    except (TypeError, ValueError):
        return {"lastActivity": str(last_activity), "presence": "offline", "presenceAgeSeconds": None}

    if age <= 150:
        presence = "online"
    elif age <= 5 * 60:
        presence = "idle"
    elif age <= 15 * 60:
        presence = "recent"
    else:
        presence = "offline"
    return {"lastActivity": parsed.astimezone(timezone.utc).isoformat(), "presence": presence, "presenceAgeSeconds": age}


@app.post("/api/feedback", status_code=201)
@limiter.limit("10/hour")
async def submit_feedback(request: Request, body: FeedbackRequest, username: str = Depends(get_current_user)):
    category = (body.category or "other").strip().lower()
    allowed_categories = {"bug", "idea", "ux", "other"}
    if category not in allowed_categories:
        raise HTTPException(400, "Categoría de feedback inválida.")
    message = (body.message or "").strip()
    if len(message) < 3:
        raise HTTPException(400, "Cuéntanos un poco más para poder usar el feedback.")
    context = (body.context or "Home").strip() or "Home"
    created = await fstore.create_feedback(
        username=username,
        category=category,
        message=message,
        context=context,
    )
    return {"feedback": created}


@app.get("/api/admin/feedback")
async def admin_list_feedback(username: str = Depends(require_admin)):
    rows = await fstore.list_feedback(limit=100)
    return {
        "feedback": rows,
        "newCount": sum(1 for row in rows if row.get("status") == "new"),
    }


@app.post("/api/admin/feedback/{feedback_id}/status")
async def admin_update_feedback_status(
    feedback_id: str,
    body: AdminFeedbackStatusRequest,
    username: str = Depends(require_admin),
):
    status = (body.status or "").strip().lower()
    if status not in {"new", "read", "resolved"}:
        raise HTTPException(400, "Estado de feedback inválido.")
    updated = await fstore.update_feedback_status(feedback_id, status)
    if not updated:
        raise HTTPException(404, "Feedback no encontrado.")
    return {"feedback": updated}


@app.get("/api/admin/users")
async def admin_list_users(username: str = Depends(require_admin)):

    usernames = await ustore.list_usernames()
    result = []
    for uname in usernames:
        user = await ustore.get_user(uname)
        profile = await pstore.get_profile(uname)
        user_doc = user or {}
        # Cuentas antiguas podían no tener `last_activity`. Desde V16.6 el
        # login fuerza también `last_login`; mientras migran, created_at es
        # mejor fallback que mostrar “Sin actividad” como si nunca hubieran
        # existido. El siguiente login/heartbeat reemplaza enseguida ese dato.
        activity_anchor = user_doc.get("last_activity") or user_doc.get("last_login") or user_doc.get("created_at")
        result.append({
            "username": uname,
            "createdAt": user_doc.get("created_at"),
            "currentActivity": user_doc.get("current_activity"),
            "clientRelease": user_doc.get("client_release"),
            **_presence_summary(activity_anchor),
            **_foreground_summary(user_doc),
            **_extract_summary_stats(profile),
        })
    return {"users": result}


async def _resolve_admin_target_username(raw_username: str) -> str:
    """Resuelve una cuenta sin depender de que el username sea URL-safe.

    Las versiones históricas sólo exigían longitud mínima, por lo que puede
    haber nombres con caracteres reservados. El endpoint POST nuevo recibe el
    valor en JSON; esta resolución conserva además compatibilidad de mayúsculas
    con cuentas antiguas.
    """
    candidate = (raw_username or "").strip()
    if not candidate:
        raise HTTPException(400, "Falta el usuario a consultar.")

    if await ustore.get_user(candidate):
        return candidate

    lowered = candidate.lower()
    if lowered != candidate and await ustore.get_user(lowered):
        return lowered

    # Compatibilidad con cuentas muy antiguas creadas antes de normalizar a
    # minúsculas. Sólo se ejecuta en el panel admin y únicamente tras fallar
    # las búsquedas directas.
    for existing in await ustore.list_usernames():
        if str(existing).casefold() == candidate.casefold():
            return str(existing)

    raise HTTPException(404, "Usuario no encontrado.")


async def _admin_insights_response(target_username: str) -> dict:
    resolved = await _resolve_admin_target_username(target_username)
    profile = await pstore.get_profile(resolved)
    return {
        "username": resolved,
        **_extract_admin_insights_payload(profile),
    }


@app.post("/api/admin/user-insights")
async def admin_user_insights_post(body: AdminInsightsRequest, username: str = Depends(require_admin)):
    return await _admin_insights_response(body.username)


@app.post("/api/admin/delete-user")
async def admin_delete_user(body: AdminDeleteUserRequest, username: str = Depends(require_admin)):

    target = await _resolve_admin_target_username(body.username)
    if target == username:
        raise HTTPException(409, "No puedes borrar tu propia cuenta desde el panel de admin.")

    # Cascada deliberada: una cuenta borrada no debe dejar perfil ni savegames
    # activos. El historial/estadísticas del jugador viven dentro del perfil.
    deleted_games = await store.delete_games_by_owner(target)
    await pstore.delete_profile(target)
    deleted = await ustore.delete_user(target)
    if not deleted:
        raise HTTPException(404, "Usuario no encontrado.")

    return {"deleted": True, "username": target, "deletedGames": deleted_games}


# Compatibilidad con V15.2/V15.3 ya desplegadas. La UI nueva usa POST para
# evitar problemas con caracteres reservados dentro del username.
@app.get("/api/admin/users/{target_username}/insights")
async def admin_user_insights(target_username: str, username: str = Depends(require_admin)):
    return await _admin_insights_response(target_username)


@app.post("/api/games", status_code=201)
async def create_game(body: NewGameRequest, username: str = Depends(get_current_user)):
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


@app.get("/api/games/{game_id}")
async def get_game(game_id: str, username: str = Depends(get_current_user)):
    entry = await get_owned_game(game_id, username)
    return serialize_game(game_id, entry, load_board(entry))


@app.get("/api/games/{game_id}/hint")
async def hint(game_id: str, username: str = Depends(get_current_user)):
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


@app.post("/api/analyze")
@limiter.limit("60/minute", exempt_when=has_valid_api_key)
@limiter.limit("1000/minute", key_func=api_key_bucket, exempt_when=lambda request: not has_valid_api_key(request))
async def analyze(request: Request, body: AnalyzeRequest, _actor: str = Depends(get_user_or_m2m)):
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


@app.post("/api/games/{game_id}/move")
async def play_move(game_id: str, body: MoveRequest, username: str = Depends(get_current_user)):
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


@app.get("/api/status")
async def public_status(_username: str = Depends(get_current_user)):
    """Estado ligero para la cabecera autenticada.

    Solo está disponible tras login y expone un agregado (nunca usernames).
    Si Mongo está temporalmente indisponible el proceso sigue estando UP; en
    ese caso la presencia queda como desconocida en vez de convertir un fallo
    de storage en un falso "backend DOWN".
    """
    try:
        online_users = await ustore.count_online_users(window_seconds=150)
        # Privacidad: la presencia pública autenticada representa jugadores,
        # no al operador de la instancia. El request autenticado acaba de
        # refrescar su propia actividad, así que si quien consulta es admin lo
        # retiramos del agregado. Resultado: admin solo -> 0 usuarios online;
        # admin + N jugadores -> N. Nunca exponemos identidades.
        if is_admin(_username):
            online_users = max(0, online_users - 1)
        return {"ok": True, "onlineUsers": online_users, "presenceAvailable": True}
    except PersistentStorageUnavailable:
        return {"ok": True, "onlineUsers": None, "presenceAvailable": False}
