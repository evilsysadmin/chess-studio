"""main.py — API del Estudio de Ajedrez, en FastAPI."""

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
import hmac
import re
import ipaddress
from contextlib import asynccontextmanager
from typing import Optional
from urllib.parse import quote, urlsplit

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

import profile_store as pstore
import users_store as ustore
from db import PersistentStorageUnavailable
from auth import (
    hash_password, verify_password, create_token, verify_token,
    create_password_reset_token, verify_password_reset_token,
)
from email_service import send_password_reset_email
from request_limits import RequestBodyLimitMiddleware
from api_models import (
    ActivityHeartbeatRequest, ForgotPasswordRequest, LoginRequest, RegisterRequest, ResetPasswordRequest,
    UpdateEmailRequest,
)
from narrative_api import build_narrative_router
from game_api import build_game_router
from admin_api import build_admin_router
from system_api import build_system_router
from observability import record_http_request, sanitize_client_release
from structured_logging import emit_http_event
from observability_history import schedule_history_flush
from resilience import request_enter, request_exit, should_shed, record_shed
from release_info import backend_release
from grafana_telemetry import annotate_http_span, configure as configure_grafana_telemetry, shutdown as shutdown_grafana_telemetry, start_http_span

ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
EXPOSE_API_DOCS = os.environ.get("EXPOSE_API_DOCS", "false").strip().lower() in {"1", "true", "yes", "on"}
ALLOW_REGISTRATION = os.environ.get("ALLOW_REGISTRATION", "true").strip().lower() in {"1", "true", "yes", "on"}
INVITE_CODE = os.environ.get("INVITE_CODE", "").strip()
PASSWORD_RESET_URL = os.environ.get("PASSWORD_RESET_URL", "http://localhost:5173/").strip()
# En Render puede existir un servicio creado antes del Blueprint: en ese caso
# una RESEND_API_KEY válida no debe quedar inutilizada porque faltase el flag
# redundante. El flag explícito sigue mandando (sirve para apagar el flujo).
_email_recovery_flag = os.environ.get("ENABLE_EMAIL_RECOVERY", "").strip().lower()
ENABLE_EMAIL_RECOVERY = (
    _email_recovery_flag in {"1", "true", "yes", "on"}
    if _email_recovery_flag
    else bool(os.environ.get("RESEND_API_KEY", "").strip())
)


@asynccontextmanager
async def app_lifespan(_app: FastAPI):
    configure_grafana_telemetry(
        service_name="chess-studio-api",
        service_version=backend_release(),
        environment=ENVIRONMENT,
    )
    try:
        yield
    finally:
        shutdown_grafana_telemetry()


app = FastAPI(
    title="Estudio de Ajedrez API",
    docs_url="/docs" if EXPOSE_API_DOCS else None,
    redoc_url="/redoc" if EXPOSE_API_DOCS else None,
    openapi_url="/openapi.json" if EXPOSE_API_DOCS else None,
    lifespan=app_lifespan,
)

# Logger operativo estructurado. Incluye username autenticado para poder ver uso
# e investigar incidencias, pero nunca IP, bodies, FEN, contraseñas ni tokens.
# El username NO se usa como label de métricas para evitar alta cardinalidad.
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


def _client_release(request: Request) -> str | None:
    return sanitize_client_release(request.headers.get("x-client-release"))


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


def _client_network(request: Request) -> tuple[str | None, str | None]:
    """Última red observada, sin lookup externo ni confianza ciega en proxies.

    Cloudflare sólo se considera fuente de IP si también llega CF-Ray. Fuera
    de Cloudflare usamos la dirección resuelta por ASGI (útil en local/Render).
    Guardamos un único valor por cuenta; nunca construimos historial de IPs.
    """
    cloudflare_request = bool((request.headers.get("cf-ray") or "").strip())
    raw_ip = (request.headers.get("cf-connecting-ip") or "").strip() if cloudflare_request else ""
    if not raw_ip and request.client:
        raw_ip = str(request.client.host or "").strip()
    try:
        client_ip = str(ipaddress.ip_address(raw_ip)) if raw_ip else None
    except ValueError:
        client_ip = None
    raw_country = (request.headers.get("cf-ipcountry") or "").strip().upper() if cloudflare_request else ""
    country = raw_country if re.fullmatch(r"[A-Z]{2}", raw_country) and raw_country not in {"XX", "T1"} else None
    return client_ip, country


def rate_limit_key(request: Request) -> str:
    """Clave estable y justa para límites de API.

    Las rutas autenticadas se limitan por cuenta, evitando que varios usuarios
    detrás de la misma NAT compartan el mismo bucket. Antes de autenticar
    (login/registro y tráfico anónimo) se conserva el límite por dirección
    cliente resuelta por ASGI/Uvicorn.
    """
    username = _request_username(request)
    if username != "-":
        return f"user:{username}"
    return f"ip:{get_remote_address(request)}"


@app.middleware("http")
async def log_request_with_user(request: Request, call_next):
    started = time.perf_counter()
    request_id = _request_id(request)
    client_release = _client_release(request)
    inflight = request_enter()
    status_code = 500
    raised = False
    span_context = start_http_span(request.method)
    span = span_context.__enter__()
    try:
        if should_shed(request.url.path, inflight):
            status_code = 503
            record_shed()
            request.state.route_label = request.url.path
            return JSONResponse(
                status_code=503,
                content={
                    "detail": "Servicio ocupado; la función secundaria se ha aplazado para proteger las partidas.",
                    "requestId": request_id,
                    "degraded": True,
                },
                headers={"X-Request-ID": request_id, "Retry-After": "5"},
            )
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    except Exception:
        raised = True
        elapsed_ms = (time.perf_counter() - started) * 1000
        route_obj = request.scope.get("route")
        route_pattern = getattr(request.state, "route_label", None) or getattr(route_obj, "path", None) or "unmatched"
        emit_http_event(
            access_logger,
            request_id=request_id,
            method=request.method,
            route=route_pattern,
            status_code=500,
            duration_ms=elapsed_ms,
            client_release=client_release,
            username=_request_username(request),
            exception=True,
        )
        # El detalle técnico completo queda en el traceback del servidor; al
        # cliente sólo vuelve una referencia segura para correlacionarlo.
        return JSONResponse(
            status_code=500,
            content={"detail": "Error interno del servidor.", "requestId": request_id},
            headers={"X-Request-ID": request_id},
        )
    finally:
        elapsed_ms = (time.perf_counter() - started) * 1000
        request_exit()
        route_obj = request.scope.get("route")
        route_pattern = getattr(request.state, "route_label", None) or getattr(route_obj, "path", None) or "unmatched"
        record_http_request(
            request.method,
            route_pattern,
            status_code,
            elapsed_ms,
            client_release=client_release,
        )
        annotate_http_span(
            span,
            method=request.method,
            route=route_pattern,
            status_code=status_code,
        )
        # El evento OTLP se emite mientras el span sigue activo. Así Grafana
        # puede correlacionar el log seguro de Loki con la traza de Tempo.
        if not raised:
            emit_http_event(
                access_logger,
                request_id=request_id,
                method=request.method,
                route=route_pattern,
                status_code=status_code,
                duration_ms=elapsed_ms,
                client_release=client_release,
                username=_request_username(request),
            )
        try:
            span_context.__exit__(None, None, None)
        except Exception:
            pass
        schedule_history_flush()


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
    # Frontend público con dominio propio. Se mantiene el origen github.io
    # mientras haya enlaces/cache de releases anteriores en circulación.
    "https://chess-studio.shadowops.dpdns.org",
}
_CONFIGURED_CORS_ORIGINS = {
    normalized
    for raw in os.environ.get("CORS_ORIGINS", "").split(",")
    if (normalized := _normalize_cors_origin(raw))
}
_CORS_ORIGINS = sorted(_DEFAULT_CORS_ORIGINS | _CONFIGURED_CORS_ORIGINS)

# Rate limiting por identidad autenticada y, antes de login, por IP. Sin esto,
# cualquiera con curl puede hacer que un hosting gratuito se quede corto mandando cientos
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
limiter = Limiter(key_func=rate_limit_key, default_limits=["120/minute"])

# ---------- Auth M2M ----------
#
# Las integraciones servidor-a-servidor pueden autenticarse con una lista
# fija de API keys suministrada por entorno. El navegador no necesita ni
# recibe estas credenciales. Sin `M2M_API_KEYS`, ninguna key M2M es válida.
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
    # PATCH forma parte del contrato público de /api/profile y debe cruzar CORS.
    # Si se omite aquí, los navegadores que tienen progreso local pendiente
    # hacen correctamente el preflight pero Starlette lo rechaza con 400 antes
    # de que el PATCH llegue a FastAPI. Incógnito suele ocultar el problema
    # porque no trae la marca local dirty y sólo necesita el GET inicial.
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-API-Key", "X-Request-ID", "X-Client-Release"],
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

# ---------- Modelos de entrada ----------
# "from" es palabra reservada en Python, así que el campo se llama
# `from_square` en el código pero se sigue mandando/recibiendo como "from"
# en el JSON (alias) — el frontend no ve ninguna diferencia.






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


async def _touch_activity_best_effort(username: str, *, force: bool = False, request: Request | None = None) -> None:
    """La presencia es telemetría útil, nunca una dependencia del juego.

    Si Mongo tiene un tropiezo puntual no vamos a convertir un heartbeat o un
    análisis perfectamente válido en un 503 solo porque no pudimos actualizar
    el puntito verde del panel admin. Las operaciones que SÍ necesitan Mongo
    siguen propagando su error normalmente.
    """
    try:
        client_ip, client_country = _client_network(request) if request else (None, None)
        await ustore.touch_last_activity(username, force=force, client_ip=client_ip, client_country=client_country)
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
    await _touch_activity_best_effort(username, request=request)
    return username


async def require_admin(username: str = Depends(get_current_user)) -> str:
    if not is_admin(username):
        raise HTTPException(403, "No tienes permisos de administrador.")
    return username

# LLM narrative transport: facts stay authoritative in Chess Studio.
app.include_router(build_narrative_router(auth_dependency=get_current_user, admin_dependency=require_admin, is_admin_check=is_admin))
app.include_router(build_admin_router(auth_dependency=get_current_user, admin_dependency=require_admin, limiter=limiter))
app.include_router(build_system_router(auth_dependency=get_current_user, is_admin_check=is_admin, limiter=limiter))


async def get_user_or_m2m(request: Request) -> str:
    """Autenticación para endpoints de cálculo reutilizables.

    Un humano entra con JWT. Automatizaciones de confianza pueden usar una
    X-API-Key configurada en M2M_API_KEYS. No existe acceso anónimo.
    """
    if has_valid_api_key(request):
        request.state.username = "m2m"
        return "m2m"
    return await get_current_user(request)


app.include_router(
    build_game_router(
        auth_dependency=get_current_user,
        compute_auth_dependency=get_user_or_m2m,
        limiter=limiter,
        has_valid_api_key=has_valid_api_key,
        api_key_bucket=api_key_bucket,
    )
)


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
    try:
        # La cuenta acaba de nacer y todavía no se ha entregado ningún token.
        # Si quedó un perfil huérfano de una eliminación antigua con el mismo
        # username, debe desaparecer antes del primer login: un alta nueva es
        # siempre vanilla y jamás hereda datos de una identidad anterior.
        await pstore.delete_profile(username)
    except PersistentStorageUnavailable as exc:
        # No entregamos una cuenta cuyo estado inicial no podemos garantizar.
        # El rollback deja el username disponible para reintentar el alta.
        try:
            await ustore.delete_user(username)
        except PersistentStorageUnavailable:
            access_logger.error("No se pudo revertir el alta incompleta de user=%s", username)
        raise HTTPException(503, "No se pudo inicializar el perfil nuevo. Reintenta en unos segundos.") from exc
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
    await _touch_activity_best_effort(username, force=True, request=request)
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
@limiter.limit("10/hour")
async def update_recovery_email(request: Request, body: UpdateEmailRequest, username: str = Depends(get_current_user)):
    # Guardar/cambiar el email de la cuenta no depende del proveedor de envío.
    # ENABLE_EMAIL_RECOVERY sólo controla el flujo público de reset: una mala
    # variable de despliegue no debe impedir al usuario preparar su cuenta.
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
    payload = {
        "username": username,
        "isAdmin": is_admin(username),
        "email": (user or {}).get("email"),
        "emailRecoveryEnabled": ENABLE_EMAIL_RECOVERY,
    }
    return payload


@app.post("/api/auth/activity", status_code=204)
@limiter.limit("30/minute")
async def activity_heartbeat(request: Request, payload: Optional[ActivityHeartbeatRequest] = None, username: str = Depends(get_current_user)):
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
    client_ip, client_country = _client_network(request)
    await ustore.touch_last_activity(
        username, force=True, activity=activity, foreground=foreground, release=release,
        client_ip=client_ip, client_country=client_country,
    )
    return None




# Feedback/admin routes live in admin_api.py.


# Perfil por usuario autenticado: torneo, ejército, rating, logros, etc.
# El backend lo trata como un passthrough; el dueño siempre sale del JWT,
# nunca del body enviado por el cliente.

@app.get("/api/profile")
@limiter.limit("60/minute")
async def get_profile(request: Request, username: str = Depends(get_current_user)):
    profile = await pstore.get_profile(username)
    return profile or {}


@app.put("/api/profile")
@limiter.limit("20/minute")
async def save_profile(request: Request, body: dict, username: str = Depends(get_current_user)):
    saved = await pstore.save_profile(username, body)
    return saved


@app.patch("/api/profile")
@limiter.limit("60/minute")
async def patch_profile(request: Request, body: dict, username: str = Depends(get_current_user)):
    changes = body.get("data") if isinstance(body, dict) else None
    revisions = body.get("revisions") if isinstance(body, dict) else None
    if not isinstance(changes, dict) or not isinstance(revisions, dict):
        raise HTTPException(400, "PATCH de perfil inválido.")
    if len(changes) > 128 or len(revisions) > 128:
        raise HTTPException(413, "PATCH de perfil demasiado grande.")
    if any(len(str(key)) > 160 for key in changes) or any(len(str(key)) > 160 for key in revisions):
        raise HTTPException(400, "PATCH de perfil contiene una clave inválida.")
    result = await pstore.patch_profile(username, changes, revisions)
    if isinstance(result, pstore.ProfilePatchConflict):
        raise HTTPException(
            409,
            detail={
                "message": "El perfil cambió en otra pestaña; relee y fusiona las claves en conflicto.",
                "conflicts": result.conflicts,
                "profile": result.profile,
                "revisions": result.revisions,
            },
        )
    return result
