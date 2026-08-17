"""auth.py — Hasheo de contraseñas (bcrypt) y tokens de sesión (JWT). Nada
de sesiones con estado en el servidor: el token lleva el username adentro,
firmado, y el propio navegador lo guarda y lo manda en cada request. Mismo
espíritu que M2M_API_KEYS (una variable de entorno, sin base de datos de
sesiones aparte) pero para humanos con contraseña en vez de una key fija.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

# En desarrollo local, sin configurar nada, usa una clave fija — no es un
# problema de seguridad real para correr esto en tu propia máquina, pero
# para un despliegue real hace falta configurar JWT_SECRET en el entorno
# (si no, cualquiera que lea el código fuente podría firmar tokens él mismo).
JWT_SECRET = os.environ.get("JWT_SECRET", "dev-secret-cambiar-en-produccion")
JWT_ALGORITHM = "HS256"
TOKEN_EXPIRY_DAYS = 30  # una sesión larga, no hay "recordarme" aparte


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


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
