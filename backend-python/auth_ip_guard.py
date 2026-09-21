"""Shared IP guard for repeated failed public-auth requests."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import ipaddress
import math
from typing import Any

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "auth_ip_guard"
WINDOW_SECONDS = 10 * 60
FAILURE_LIMIT = 10
BLOCK_SECONDS = 15 * 60
RETENTION_SECONDS = 24 * 60 * 60
CAS_ATTEMPTS = 8
BLOCK_CACHE_LIMIT = 4096

_memory: dict[str, dict[str, Any]] = {}
_blocked_cache: dict[str, datetime] = {}
_index_ready = False


def ip_key(client_ip: str, secret: str) -> str:
    """Return a stable keyed fingerprint without persisting the clear client IP."""
    normalized = str(ipaddress.ip_address(str(client_ip or "").strip()))
    key = str(secret or "").encode("utf-8")
    if not key:
        raise ValueError("secret es obligatorio")
    message = b"chess-studio:auth-ip-guard\\x00" + normalized.encode("ascii")
    return hmac.new(key, message, hashlib.sha256).hexdigest()[:32]


def _as_utc(value: Any) -> datetime | None:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def retry_after_seconds(doc: dict[str, Any] | None, *, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    blocked_until = _as_utc((doc or {}).get("blocked_until"))
    if blocked_until is None or blocked_until <= now:
        return 0
    return max(1, int(math.ceil((blocked_until - now).total_seconds())))


def state_after_failure(
    doc: dict[str, Any] | None,
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    current = doc or {}
    window_started = _as_utc(current.get("window_started_at"))
    blocked_until = _as_utc(current.get("blocked_until"))

    expired_block = blocked_until is not None and blocked_until <= now
    expired_window = (
        window_started is None
        or (now - window_started).total_seconds() >= WINDOW_SECONDS
    )
    reset = expired_block or expired_window

    try:
        previous_failures = max(0, int(current.get("failures", 0)))
    except (TypeError, ValueError):
        previous_failures = 0

    failures = 1 if reset else previous_failures + 1
    next_window_started = now if reset else window_started
    next_blocked_until = None
    if failures >= FAILURE_LIMIT:
        next_blocked_until = now + timedelta(seconds=BLOCK_SECONDS)

    return {
        "window_started_at": next_window_started,
        "failures": failures,
        "blocked_until": next_blocked_until,
        "updated_at": now,
    }


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable(
            "MongoDB no está disponible para el guard de IP de auth."
        )
    return None


async def _ensure_index(col) -> None:
    global _index_ready
    if _index_ready or col is None:
        return
    try:
        await col.create_index(
            "updated_at",
            expireAfterSeconds=RETENTION_SECONDS,
            name="auth_ip_guard_ttl",
        )
    except PyMongoError as exc:
        raise PersistentStorageUnavailable(
            "No se pudo preparar el TTL del guard de IP de auth."
        ) from exc
    _index_ready = True


def _cached_retry_after(identity: str, *, now: datetime | None = None) -> int:
    now = now or datetime.now(timezone.utc)
    blocked_until = _blocked_cache.get(identity)
    if blocked_until is None:
        return 0
    if blocked_until <= now:
        _blocked_cache.pop(identity, None)
        return 0
    return max(1, int(math.ceil((blocked_until - now).total_seconds())))


def _remember_active_block(identity: str, doc: dict[str, Any] | None) -> None:
    blocked_until = _as_utc((doc or {}).get("blocked_until"))
    now = datetime.now(timezone.utc)
    if blocked_until is None or blocked_until <= now:
        _blocked_cache.pop(identity, None)
        return

    _blocked_cache[identity] = blocked_until
    if len(_blocked_cache) <= BLOCK_CACHE_LIMIT:
        return

    expired = [key for key, value in _blocked_cache.items() if value <= now]
    for key in expired:
        _blocked_cache.pop(key, None)
    while len(_blocked_cache) > BLOCK_CACHE_LIMIT:
        _blocked_cache.pop(next(iter(_blocked_cache)))


async def retry_after(identity: str) -> int:
    cached = _cached_retry_after(identity)
    if cached:
        return cached

    col = await _get_collection()
    if col is not None:
        await _ensure_index(col)
        try:
            doc = await col.find_one({"_id": identity}, {"blocked_until": 1})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable(
                "No se pudo consultar el guard de IP de auth."
            ) from exc
        value = retry_after_seconds(doc)
        if value:
            _remember_active_block(identity, doc)
        return value

    doc = _memory.get(identity)
    value = retry_after_seconds(doc)
    if value:
        _remember_active_block(identity, doc)
    if value == 0 and doc is not None:
        blocked_until = _as_utc(doc.get("blocked_until"))
        updated_at = _as_utc(doc.get("updated_at"))
        now = datetime.now(timezone.utc)
        if (
            blocked_until is not None
            and blocked_until <= now
            and updated_at is not None
            and (now - updated_at).total_seconds() >= RETENTION_SECONDS
        ):
            _memory.pop(identity, None)
    return value


async def record_failure(identity: str) -> int:
    col = await _get_collection()
    if col is None:
        next_state = state_after_failure(_memory.get(identity))
        _memory[identity] = next_state
        retry = retry_after_seconds(next_state)
        if retry:
            _remember_active_block(identity, next_state)
        return retry

    await _ensure_index(col)
    for _attempt in range(CAS_ATTEMPTS):
        try:
            current = await col.find_one({"_id": identity})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable(
                "No se pudo consultar el guard de IP de auth."
            ) from exc

        next_state = state_after_failure(current)
        if current is None:
            try:
                await col.insert_one({
                    "_id": identity,
                    "_guard_version": 1,
                    **next_state,
                })
                retry = retry_after_seconds(next_state)
                if retry:
                    _remember_active_block(identity, next_state)
                return retry
            except DuplicateKeyError:
                continue
            except PyMongoError as exc:
                raise PersistentStorageUnavailable(
                    "No se pudo registrar el fallo de IP de auth."
                ) from exc

        try:
            version = max(0, int(current.get("_guard_version", 0)))
        except (TypeError, ValueError):
            version = 0
        version_filter: Any = (
            version
            if "_guard_version" in current
            else {"$exists": False}
        )
        try:
            result = await col.update_one(
                {"_id": identity, "_guard_version": version_filter},
                {
                    "$set": next_state,
                    "$inc": {"_guard_version": 1},
                },
            )
        except PyMongoError as exc:
            raise PersistentStorageUnavailable(
                "No se pudo registrar el fallo de IP de auth."
            ) from exc
        if result.matched_count == 1:
            retry = retry_after_seconds(next_state)
            if retry:
                _remember_active_block(identity, next_state)
            return retry

    raise PersistentStorageUnavailable(
        "Demasiada contención al actualizar el guard de IP de auth."
    )
