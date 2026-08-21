"""auth.py — Hasheo de contraseñas (bcrypt) y tokens de sesión (JWT). Nada
de sesiones con estado en el servidor: el token lleva el username adentro,
firmado, y el propio navegador lo guarda y lo manda en cada request. Mismo
espíritu que M2M_API_KEYS (una variable de entorno, sin base de datos de
sesiones aparte) pero para humanos con contraseña en vez de una key fija.
"""

import hashlib
import os
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
if _ENVIRONMENT in {"production", "prod"} and (
    JWT_SECRET == _DEV_JWT_SECRET or len(JWT_SECRET) < 32
):
    raise RuntimeError("JWT_SECRET debe configurarse con al menos 32 caracteres en producción.")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=BCRYPT_ROUNDS)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        return False  # hash corrupto/con formato inválido — no revienta, solo no valida


def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "exp": datetime.now(timezone.utc) + timedelta(days=TOKEN_EXPIRY_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_token(token: str) -> Optional[str]:
    """Devuelve el username si el token es válido, o None si no lo es (
    expirado, firma inválida, formato roto, lo que sea) — nunca levanta
    excepción, para que el llamador solo tenga que chequear None."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


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
