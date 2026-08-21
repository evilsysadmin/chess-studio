"""Persistencia de cuentas de usuario."""

from datetime import datetime, timezone
import time
from typing import Optional

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "users"
_memory_users: dict[str, dict] = {}
_last_activity_write_monotonic: dict[str, float] = {}
_ACTIVITY_WRITE_INTERVAL_S = 30.0


class UserAlreadyExists(RuntimeError):
    """La creación perdió una carrera contra otro registro del mismo username."""


class UserEmailAlreadyExists(RuntimeError):
    """El email ya pertenece a otra cuenta (incluida una carrera concurrente)."""


_email_index_ready = False


async def _ensure_email_index(col) -> None:
    """Índice único parcial: cuentas legacy sin email siguen siendo válidas."""
    global _email_index_ready
    if _email_index_ready or col is None:
        return
    try:
        await col.create_index(
            [("email", 1)],
            unique=True,
            partialFilterExpression={"email": {"$type": "string"}},
            name="uniq_recovery_email",
        )
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo preparar el índice de emails.") from exc
    _email_index_ready = True


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.")
    return None


async def get_user(username: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        try:
            doc = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        if doc:
            doc.pop("_id", None)
            doc["username"] = username
        return doc
    return _memory_users.get(username)


async def create_user(username: str, password_hash: str, email: str | None = None) -> dict:
    created_at = datetime.now(timezone.utc).isoformat()
    doc = {"username": username, "password_hash": password_hash, "created_at": created_at, "last_activity": created_at}
    if email:
        doc["email"] = email
    col = await _get_collection()
    if col is not None:
        if email:
            await _ensure_email_index(col)
        try:
            stored = {"_id": username, "password_hash": password_hash, "created_at": created_at, "last_activity": created_at}
            if email:
                stored["email"] = email
            await col.insert_one(stored)
        except DuplicateKeyError as exc:
            # Puede ser username o email; distinguimos para dar un 409 útil.
            if email and await col.find_one({"email": email}, {"_id": 1}):
                raise UserEmailAlreadyExists(email) from exc
            raise UserAlreadyExists(username) from exc
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
    else:
        _memory_users[username] = doc
    return doc


async def get_user_by_email(email: str) -> Optional[dict]:
    col = await _get_collection()
    if col is not None:
        try:
            doc = await col.find_one({"email": email})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        if doc:
            username = doc.pop("_id", None)
            doc["username"] = username
        return doc
    for username, user in _memory_users.items():
        if user.get("email") == email:
            return {**user, "username": username}
    return None


async def update_email(username: str, email: str | None) -> None:
    col = await _get_collection()
    if col is not None:
        if email:
            await _ensure_email_index(col)
        try:
            if email:
                await col.update_one({"_id": username}, {"$set": {"email": email}})
            else:
                await col.update_one({"_id": username}, {"$unset": {"email": ""}})
        except DuplicateKeyError as exc:
            raise UserEmailAlreadyExists(email or "") from exc
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        return
    user = _memory_users.get(username)
    if user is None:
        return
    if email:
        user["email"] = email
    else:
        user.pop("email", None)


async def update_password(username: str, password_hash: str) -> None:
    col = await _get_collection()
    if col is not None:
        try:
            await col.update_one({"_id": username}, {"$set": {"password_hash": password_hash}})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        return
    user = _memory_users.get(username)
    if user is not None:
        user["password_hash"] = password_hash


async def list_usernames() -> list[str]:
    col = await _get_collection()
    if col is not None:
        try:
            cursor = col.find({}, {"_id": 1})
            return [doc["_id"] async for doc in cursor]
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
    return list(_memory_users.keys())


async def touch_last_activity(username: str, *, force: bool = False) -> str:
    """Actualiza la última actividad con coalescing para no martillear Mongo.

    Cada request autenticada puede pasar por aquí, pero una cuenta activa escribe
    como máximo una vez cada 30 segundos por proceso. La presencia del panel de
    admin es deliberadamente aproximada: sirve para saber si alguien está usando
    la app, no pretende ser un websocket de presencia en tiempo real.
    """
    now_mono = time.monotonic()
    previous = _last_activity_write_monotonic.get(username)
    if not force and previous is not None and now_mono - previous < _ACTIVITY_WRITE_INTERVAL_S:
        return ""

    value = datetime.now(timezone.utc).isoformat()
    col = await _get_collection()
    if col is not None:
        try:
            fields = {"last_activity": value}
            # `force=True` se usa en login (y tras reset, que también entrega
            # sesión nueva). Guardamos un ancla de último acceso además del
            # heartbeat para que cuentas legacy nunca vuelvan a quedar como
            # “Sin actividad” por carecer del campo histórico.
            if force:
                fields["last_login"] = value
            result = await col.update_one({"_id": username}, {"$set": fields})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para usuarios.") from exc
        # Tokens válidos de cuentas borradas no deberían recrear usuarios.
        if result.matched_count == 0:
            return value
    else:
        user = _memory_users.get(username)
        if user is not None:
            user["last_activity"] = value
            if force:
                user["last_login"] = value

    _last_activity_write_monotonic[username] = now_mono
    return value
