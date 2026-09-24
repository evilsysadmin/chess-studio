"""auth.py — Password hashing and signed JWT helpers.

New password hashes use Argon2id. Existing bcrypt hashes remain verifiable so
legacy accounts keep working until their password is changed or reset.
"""

import hashlib
import os
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from argon2 import PasswordHasher, Type
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

_DEV_JWT_SECRET = "dev-secret-cambiar-en-produccion"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEV_JWT_SECRET)
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_DAYS = 30
PASSWORD_RESET_MINUTES = 30

_session_version_claim: ContextVar[int | None] = ContextVar("session_version_claim", default=None)
_account_session_version: ContextVar[int | None] = ContextVar("account_session_version", default=None)

# OWASP's resource-conscious Argon2id baseline: 19 MiB, t=2, p=1.
# Parameters stay explicit so security-cost changes are deliberate/reviewable.
_ARGON2 = PasswordHasher(
    time_cost=2,
    memory_cost=19_456,
    parallelism=1,
    hash_len=32,
    salt_len=16,
    type=Type.ID,
)
_BCRYPT_PREFIXES = ("$2a$", "$2b$", "$2y$")

# Compatibility contract for the existing test harness, which monkeypatches
# this symbol while exercising legacy bcrypt fixtures. New password writes do
# not use it; production hashing is always Argon2id.
try:
    BCRYPT_ROUNDS = int(os.environ.get("BCRYPT_ROUNDS", "12"))
except ValueError:
    BCRYPT_ROUNDS = 12
BCRYPT_ROUNDS = max(4, min(BCRYPT_ROUNDS, 16))

_ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()
_DEPLOYED_ENVIRONMENTS = {"production", "prod", "staging", "stage"}
if _ENVIRONMENT in _DEPLOYED_ENVIRONMENTS and (
    JWT_SECRET == _DEV_JWT_SECRET or len(JWT_SECRET) < 32
):
    raise RuntimeError("JWT_SECRET debe configurarse con al menos 32 caracteres en staging/producción.")


def hash_password(password: str) -> str:
    """Hash newly-created or changed passwords with Argon2id."""
    return _ARGON2.hash(password)


def is_legacy_bcrypt_hash(password_hash: str) -> bool:
    return isinstance(password_hash, str) and password_hash.startswith(_BCRYPT_PREFIXES)


def verify_password(password: str, password_hash: str) -> bool:
    """Verify Argon2id hashes while preserving read compatibility with bcrypt."""
    if not isinstance(password_hash, str) or not password_hash:
        return False

    if password_hash.startswith("$argon2"):
        try:
            return bool(_ARGON2.verify(password_hash, password))
        except (VerifyMismatchError, VerificationError, InvalidHashError):
            return False

    if is_legacy_bcrypt_hash(password_hash):
        try:
            return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
        except (ValueError, TypeError):
            return False

    return False


def _normalized_session_version(value) -> int | None:
    if value is None:
        return 0
    if isinstance(value, bool):
        return None
    try:
        version = int(value)
    except (TypeError, ValueError):
        return None
    return version if version >= 0 else None


def remember_account_session_version(value) -> None:
    version = _normalized_session_version(value)
    _account_session_version.set(version)


def current_session_version_claim() -> int | None:
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
