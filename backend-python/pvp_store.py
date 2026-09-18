"""Persistence for War Room human-vs-human matchmaking and live matches."""

from __future__ import annotations

import asyncio
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

ROSTER_COLLECTION = "pvp_roster"
CHALLENGE_COLLECTION = "pvp_challenges"
MATCH_COLLECTION = "pvp_matches"
ROSTER_TTL_SECONDS = 45
CHALLENGE_TTL_SECONDS = 75

_memory_roster: dict[str, dict[str, Any]] = {}
_memory_challenges: dict[str, dict[str, Any]] = {}
_memory_matches: dict[str, dict[str, Any]] = {}
_memory_lock: asyncio.Lock | None = None
_memory_lock_loop = None
_index_lock: asyncio.Lock | None = None
_index_lock_loop = None
_indexes_ready = False


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _memory_guard() -> asyncio.Lock:
    global _memory_lock, _memory_lock_loop
    loop = asyncio.get_running_loop()
    if _memory_lock is None or _memory_lock_loop is not loop:
        _memory_lock = asyncio.Lock()
        _memory_lock_loop = loop
    return _memory_lock


def _index_guard() -> asyncio.Lock:
    global _index_lock, _index_lock_loop
    loop = asyncio.get_running_loop()
    if _index_lock is None or _index_lock_loop is not loop:
        _index_lock = asyncio.Lock()
        _index_lock_loop = loop
    return _index_lock


async def _ensure_indexes(roster, challenges, matches) -> None:
    """Declare Mongo invariants and hot-query indexes once per process."""
    global _indexes_ready
    if _indexes_ready:
        return
    async with _index_guard():
        if _indexes_ready:
            return
        try:
            await roster.create_index(
                "last_seen",
                expireAfterSeconds=ROSTER_TTL_SECONDS,
                name="pvp_roster_last_seen_ttl",
            )
            await challenges.create_index(
                [("pair_key", 1)],
                unique=True,
                partialFilterExpression={"status": "pending", "pair_key": {"$type": "string"}},
                name="pvp_pending_pair_unique",
            )
            await challenges.create_index(
                [("challenger", 1), ("status", 1), ("created_at", -1)],
                name="pvp_challenger_status_created",
            )
            await challenges.create_index(
                [("opponent", 1), ("status", 1), ("created_at", -1)],
                name="pvp_opponent_status_created",
            )
            await matches.create_index(
                [("white", 1), ("status", 1), ("updated_at", -1)],
                name="pvp_white_status_updated",
            )
            await matches.create_index(
                [("black", 1), ("status", 1), ("updated_at", -1)],
                name="pvp_black_status_updated",
            )
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("No se pudieron preparar los índices del 1v1.") from exc
        _indexes_ready = True


async def _collections():
    db = await get_db()
    if db is not None:
        collections = db[ROSTER_COLLECTION], db[CHALLENGE_COLLECTION], db[MATCH_COLLECTION]
        await _ensure_indexes(*collections)
        return collections
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para el 1v1 de War Room.")
    return None


def _public(doc: dict[str, Any] | None) -> dict[str, Any] | None:
    if not doc:
        return None
    row = dict(doc)
    if "_id" in row:
        row.setdefault("id", str(row["_id"]))
        row.pop("_id", None)
    row.pop("pair_key", None)
    row.pop("challenge_id", None)
    row.pop("acceptance_state", None)
    return row


def _active_since(now: datetime | None = None) -> datetime:
    return (now or utcnow()) - timedelta(seconds=ROSTER_TTL_SECONDS)


def _challenge_cutoff(now: datetime | None = None) -> datetime:
    return (now or utcnow()) - timedelta(seconds=CHALLENGE_TTL_SECONDS)


def _challenge_pair_key(challenger: str, opponent: str) -> str:
    """Stable unordered identity for one pair without leaking names into indexes."""
    left, right = sorted((str(challenger), str(opponent)))
    return hashlib.sha256(f"{left}\0{right}".encode("utf-8")).hexdigest()


async def upsert_roster(username: str, *, rating: int, tier: str) -> dict[str, Any]:
    now = utcnow()
    collections = await _collections()
    payload = {
        "username": username,
        "rating": int(rating),
        "tier": str(tier),
        "last_seen": now,
    }
    if collections is None:
        async with _memory_guard():
            previous = _memory_roster.get(username) or {}
            row = {**previous, **payload, "joined_at": previous.get("joined_at") or now}
            _memory_roster[username] = row
            return dict(row)
    roster, _, _ = collections
    try:
        await roster.update_one(
            {"_id": username},
            {"$set": payload, "$setOnInsert": {"joined_at": now}},
            upsert=True,
        )
        return _public(await roster.find_one({"_id": username})) or payload
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo actualizar el roster 1v1.") from exc


async def leave_roster(username: str) -> None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            _memory_roster.pop(username, None)
            for challenge in _memory_challenges.values():
                if challenge.get("status") == "pending" and username in {challenge.get("challenger"), challenge.get("opponent")}:
                    challenge["status"] = "cancelled"
                    challenge["resolved_at"] = utcnow()
        return
    roster, challenges, _ = collections
    now = utcnow()
    try:
        await roster.delete_one({"_id": username})
        await challenges.update_many(
            {
                "status": "pending",
                "$or": [{"challenger": username}, {"opponent": username}],
            },
            {"$set": {"status": "cancelled", "resolved_at": now}},
        )
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo abandonar el roster 1v1.") from exc


async def active_roster(now: datetime | None = None) -> list[dict[str, Any]]:
    cutoff = _active_since(now)
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            stale = [name for name, row in _memory_roster.items() if row.get("last_seen") < cutoff]
            for name in stale:
                _memory_roster.pop(name, None)
            return [dict(row) for row in _memory_roster.values()]
    roster, _, _ = collections
    try:
        cursor = roster.find({"last_seen": {"$gte": cutoff}}).sort([("rating", -1), ("username", 1)])
        return [_public(row) async for row in cursor]
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo leer el roster 1v1.") from exc


async def roster_member(username: str, now: datetime | None = None) -> dict[str, Any] | None:
    cutoff = _active_since(now)
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_roster.get(username)
            if not row or row.get("last_seen") < cutoff:
                return None
            return dict(row)
    roster, _, _ = collections
    try:
        return _public(await roster.find_one({"_id": username, "last_seen": {"$gte": cutoff}}))
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo consultar el roster 1v1.") from exc


async def create_challenge(challenge: dict[str, Any]) -> dict[str, Any]:
    collections = await _collections()
    pair_key = _challenge_pair_key(challenge["challenger"], challenge["opponent"])
    if collections is None:
        async with _memory_guard():
            pair = {challenge["challenger"], challenge["opponent"]}
            for current in _memory_challenges.values():
                if current.get("status") == "pending" and {current.get("challenger"), current.get("opponent")} == pair:
                    return dict(current)
            _memory_challenges[challenge["id"]] = dict(challenge)
            return dict(challenge)
    _, challenges, _ = collections
    try:
        existing = await challenges.find_one({
            "status": "pending",
            "$or": [
                {"challenger": challenge["challenger"], "opponent": challenge["opponent"]},
                {"challenger": challenge["opponent"], "opponent": challenge["challenger"]},
            ],
            "created_at": {"$gte": _challenge_cutoff()},
        })
        if existing:
            return _public(existing) or challenge
        try:
            await challenges.insert_one({
                "_id": challenge["id"],
                **{k: v for k, v in challenge.items() if k != "id"},
                "pair_key": pair_key,
            })
        except DuplicateKeyError:
            # Two callers may both observe "no pending challenge". The unique
            # partial index is the authority; the loser reuses the winner.
            winner = await challenges.find_one({"status": "pending", "pair_key": pair_key})
            if winner:
                return _public(winner) or challenge
            raise
        return challenge
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo crear el reto 1v1.") from exc


async def list_challenges(username: str, now: datetime | None = None) -> list[dict[str, Any]]:
    cutoff = _challenge_cutoff(now)
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            stamp = now or utcnow()
            for row in _memory_challenges.values():
                if row.get("status") == "pending" and row.get("created_at") < cutoff:
                    row["status"] = "expired"
                    row["resolved_at"] = stamp
            rows = [
                dict(row) for row in _memory_challenges.values()
                if username in {row.get("challenger"), row.get("opponent")}
                and row.get("status") in {"pending", "accepted"}
            ]
            return sorted(rows, key=lambda row: row.get("created_at"), reverse=True)
    _, challenges, _ = collections
    try:
        await challenges.update_many(
            {"status": "pending", "created_at": {"$lt": cutoff}},
            {"$set": {"status": "expired", "resolved_at": now or utcnow()}},
        )
        cursor = challenges.find({
            "$or": [{"challenger": username}, {"opponent": username}],
            "status": {"$in": ["pending", "accepted"]},
        }).sort("created_at", -1).limit(24)
        return [_public(row) async for row in cursor]
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudieron leer los retos 1v1.") from exc


async def get_challenge(challenge_id: str) -> dict[str, Any] | None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_challenges.get(challenge_id)
            return dict(row) if row else None
    _, challenges, _ = collections
    try:
        return _public(await challenges.find_one({"_id": challenge_id}))
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo leer el reto 1v1.") from exc


async def cancel_challenge(challenge_id: str, username: str) -> dict[str, Any] | None:
    """Cancel an outgoing pending challenge; repeated cancellation is idempotent."""
    now = utcnow()
    cutoff = _challenge_cutoff(now)
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_challenges.get(challenge_id)
            if not row or row.get("challenger") != username:
                return None
            if row.get("status") == "cancelled":
                return dict(row)
            if row.get("status") != "pending" or row.get("created_at") < cutoff:
                return None
            row.update(status="cancelled", resolved_at=now)
            return dict(row)
    _, challenges, _ = collections
    try:
        row = await challenges.find_one_and_update(
            {
                "_id": challenge_id,
                "status": "pending",
                "challenger": username,
                "created_at": {"$gte": cutoff},
            },
            {"$set": {"status": "cancelled", "resolved_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        if row is not None:
            return _public(row)
        return _public(await challenges.find_one({
            "_id": challenge_id,
            "status": "cancelled",
            "challenger": username,
        }))
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo cancelar el reto 1v1.") from exc


async def decline_challenge(challenge_id: str, username: str) -> dict[str, Any] | None:
    now = utcnow()
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_challenges.get(challenge_id)
            if not row or row.get("status") != "pending" or row.get("opponent") != username:
                return None
            row.update(status="declined", resolved_at=now)
            return dict(row)
    _, challenges, _ = collections
    try:
        row = await challenges.find_one_and_update(
            {"_id": challenge_id, "status": "pending", "opponent": username},
            {"$set": {"status": "declined", "resolved_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        return _public(row)
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo rechazar el reto 1v1.") from exc


async def accept_challenge(
    challenge_id: str,
    username: str,
    match: dict[str, Any],
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """Accept a challenge with a crash-recoverable two-document saga.

    The match is staged first under a deterministic id and remains invisible to
    gameplay reads. The challenge CAS then points at that match and a final
    write activates it. A retry can resume after either crash window without
    requiring Mongo transactions/replica-set semantics.
    """
    now = utcnow()
    match_id = str(match["id"])
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_challenges.get(challenge_id)
            if not row or row.get("opponent") != username:
                return None
            if row.get("status") == "pending":
                if row.get("created_at") < _challenge_cutoff(now):
                    row.update(status="expired", resolved_at=now)
                    return None
                row.update(status="accepted", resolved_at=now, match_id=match_id)
            elif row.get("status") != "accepted" or row.get("match_id") != match_id:
                return None

            canonical = _memory_matches.get(match_id)
            if canonical is None:
                canonical = {
                    **dict(match),
                    "challenge_id": challenge_id,
                    "acceptance_state": "staged",
                }
                _memory_matches[match_id] = canonical
            elif canonical.get("challenge_id") not in {None, challenge_id}:
                raise PersistentStorageUnavailable("El id de partida 1v1 colisionó con otro reto.")

            canonical["challenge_id"] = challenge_id
            canonical["acceptance_state"] = "active"
            return dict(row), _public(canonical) or dict(match)

    _, challenges, matches = collections
    staged_doc = {
        "_id": match_id,
        **{k: v for k, v in match.items() if k != "id"},
        "challenge_id": challenge_id,
        "acceptance_state": "staged",
    }
    try:
        try:
            await matches.insert_one(staged_doc)
            canonical = staged_doc
        except DuplicateKeyError:
            canonical = await matches.find_one({"_id": match_id, "challenge_id": challenge_id})
            if canonical is None:
                raise PersistentStorageUnavailable("El id de partida 1v1 colisionó con otro reto.")

        row = await challenges.find_one_and_update(
            {
                "_id": challenge_id,
                "status": "pending",
                "opponent": username,
                "created_at": {"$gte": _challenge_cutoff(now)},
            },
            {"$set": {"status": "accepted", "resolved_at": now, "match_id": match_id}},
            return_document=ReturnDocument.AFTER,
        )
        if row is None:
            row = await challenges.find_one({
                "_id": challenge_id,
                "status": "accepted",
                "opponent": username,
                "match_id": match_id,
            })
        if row is None:
            await matches.delete_one({
                "_id": match_id,
                "challenge_id": challenge_id,
                "acceptance_state": "staged",
            })
            return None

        activated = await matches.find_one_and_update(
            {"_id": match_id, "challenge_id": challenge_id},
            {"$set": {"acceptance_state": "active"}},
            return_document=ReturnDocument.AFTER,
        )
        if activated is None:
            raise PersistentStorageUnavailable("La partida 1v1 aceptada no pudo activarse.")
        return _public(row) or {}, _public(activated) or {}
    except PyMongoError as exc:
        # A storage error deliberately leaves a staged match in place. The
        # deterministic id lets the next retry resume instead of duplicating it.
        raise PersistentStorageUnavailable("No se pudo aceptar el reto 1v1.") from exc


async def get_match(match_id: str) -> dict[str, Any] | None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_matches.get(match_id)
            if not row or row.get("acceptance_state") == "staged":
                return None
            return _public(row)
    _, _, matches = collections
    try:
        return _public(await matches.find_one({
            "_id": match_id,
            "acceptance_state": {"$ne": "staged"},
        }))
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo leer la partida 1v1.") from exc


async def update_match(match_id: str, *, expected_revision: int, changes: dict[str, Any]) -> dict[str, Any] | None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            row = _memory_matches.get(match_id)
            if not row or int(row.get("revision", 0)) != int(expected_revision):
                return None
            row.update(changes)
            row["revision"] = int(expected_revision) + 1
            return dict(row)
    _, _, matches = collections
    try:
        row = await matches.find_one_and_update(
            {"_id": match_id, "revision": int(expected_revision)},
            {"$set": changes, "$inc": {"revision": 1}},
            return_document=ReturnDocument.AFTER,
        )
        return _public(row)
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo actualizar la partida 1v1.") from exc


async def active_match_for_user(username: str) -> dict[str, Any] | None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            rows = [
                row for row in _memory_matches.values()
                if row.get("status") in {"starting", "active"}
                and row.get("acceptance_state") != "staged"
                and username in {row.get("white"), row.get("black")}
            ]
            if not rows:
                return None
            return dict(max(rows, key=lambda row: row.get("updated_at") or row.get("created_at")))
    _, _, matches = collections
    try:
        row = await matches.find_one(
            {
                "status": {"$in": ["starting", "active"]},
                "acceptance_state": {"$ne": "staged"},
                "$or": [{"white": username}, {"black": username}],
            },
            sort=[("updated_at", -1)],
        )
        return _public(row)
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudo recuperar la partida 1v1 activa.") from exc


async def delete_user_data(username: str) -> None:
    collections = await _collections()
    if collections is None:
        async with _memory_guard():
            _memory_roster.pop(username, None)
            for cid in [cid for cid, row in _memory_challenges.items() if username in {row.get("challenger"), row.get("opponent")}]:
                _memory_challenges.pop(cid, None)
            for mid in [mid for mid, row in _memory_matches.items() if username in {row.get("white"), row.get("black")}]:
                _memory_matches.pop(mid, None)
        return
    roster, challenges, matches = collections
    try:
        await roster.delete_one({"_id": username})
        await challenges.delete_many({"$or": [{"challenger": username}, {"opponent": username}]})
        await matches.delete_many({"$or": [{"white": username}, {"black": username}]})
    except PyMongoError as exc:
        raise PersistentStorageUnavailable("No se pudieron borrar los datos 1v1 del usuario.") from exc
