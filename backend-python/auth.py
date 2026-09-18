"""auth.py — Hasheo de contraseñas (bcrypt) y tokens de sesión (JWT).

Las sesiones siguen siendo JWT firmados y transportados por el navegador, pero
cada token incluye una versión de sesión. El backend compara esa versión con la
cuenta para poder revocar credenciales antiguas tras cambiar la contraseña sin
mantener una tabla de sesiones por dispositivo.
"""

import hashlib
import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

# En desarrollo local, sin configurar nada, usa una clave fija — no es un
# problema de seguridad real para correr esto en tu propia máquina, pero
# para un despliegue real hace falta configurar JWT_SECRET en el entorno
# (si no, cualquiera que lea el código fuente podría firmar tokens él mismo).
_DEV_JWT_SECRET = "dev-secret-cambiar-en-produccion"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEV_JWT_SECRET)
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_DAYS = 30  # una sesión larga, no hay "recordarme" aparte
PASSWORD_RESET_MINUTES = 30

# La request autenticada y la carga de la cuenta comparten estas dos piezas de
# contexto sin globals mutables por usuario. ContextVar queda aislado por task
# ASGI, así que dos requests concurrentes no pueden pisarse la versión.
_session_version_claim: ContextVar[int | None] = ContextVar("session_version_claim", default=None)
_account_session_version: ContextVar[int | None] = ContextVar("account_session_version", default=None)

# Coste bcrypt de producción. Los tests lo bajan temporalmente a 4 mediante
# monkeypatch para conservar hashing real sin pagar el coste CPU de 12 rounds
# en cada alta/login de la suite.
try:
    BCRYPT_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "12"))
except ValueError:
    BCRYPT_ROUNDS = 12
BCRYPT_ROUNDS = max(4, min(BCRYPT_ROUNDS, 16))

# Fallar cerrado en Internet. Es preferible que Render marque el deploy como
# fallido a arrancar con una clave conocida por cualquiera que vea el repo.
_ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
_DEPLOYED_ENVIRONMENTS = {"production", "prod", "staging", "stage"}
if _ENVIRONMENT in _DEPLOYED_ENVIRONMENTS and (
    JWT_SECRET == _DEV_JWT_SECRET or len(JWT_SECRET) < 32
):
    raise RuntimeError("JWT_SECRET debe configurarse con al menos 32 caracteres en staging/producción.")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False  # hash corrupto/con formato inválido — no revienta, solo no valida


def _normalized_session_version(value) -> int | None:
    if value is None:
        return 0  # rollout compatible: JWT legacy sin `sv` pertenece a versión 0
    if isinstance(value, bool):
        return None
    try:
        version = int(value)
    except (TypeError, ValueError):
        return None
    return version if version >= 0 else None


def remember_account_session_version(value) -> None:
    """Anota la versión autoritativa cargada por users_store para esta task."""
    version = _normalized_session_version(value)
    _account_session_version.set(version)


def current_session_version_claim() -> int | None:
    """Versión declarada por el JWT que se está autenticando, si existe."""
    return _session_version_claim.get()


def create_token(username: str, session_version: int | None = None) -> str:
    if session_version is None:
        session_version = _account_session_version.get()
    version = _normalized_session_version(session_version)
    if version is None:
        version = 0
    payload = {
        "sub": username,
        "purpose": "session",
        "sv": version,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_session_token(token: str) -> Optional[tuple[str, int]]:
    """Devuelve ``(username, session_version)`` para un JWT de sesión válido.

    Los tokens legacy sin ``purpose``/``sv`` siguen siendo versión 0 durante el
    rollout. En cuanto la cuenta avance de versión por un cambio de contraseña,
    esos tokens dejan de coincidir y quedan revocados.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") not in (None, "session"):
            return None
        username = payload.get("sub")
        version = _normalized_session_version(payload.get("sv"))
        if not isinstance(username, str) or not username or version is None:
            return None
        _session_version_claim.set(version)
        return username, version
    except jwt.PyJWTError:
        return None


def verify_token(token: str) -> Optional[str]:
    """Compatibilidad para logging/rate-limit: devuelve sólo el username."""
    verified = verify_session_token(token)
    return verified[0] if verified else None


def _password_fingerprint(password_hash: str) -> str:
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:24]


def create_password_reset_token(username: str, password_hash: str) -> str:
    payload = {
        "sub": username,
        "purpose": "password_reset",
        "pwd": _password_fingerprint(password_hash),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=PASSWORD_RESET_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_password_reset_token(token: str, password_hash: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("purpose") != "password_reset":
            return None
        if payload.get("pwd") != _password_fingerprint(password_hash):
            return None
        return payload.get("sub")
    except jwt.PyJWTError:
        return None
