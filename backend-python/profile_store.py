"""Persistencia del perfil, un documento por username autenticado.

v16.6dm41 añade PATCH optimista por clave. El payload público sigue siendo el
backup flexible de siempre; las revisiones viven en metadata privada del
servidor y permiten que dos pestañas cambien claves distintas sin pisarse.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from pymongo.errors import DuplicateKeyError, PyMongoError

from db import PersistentStorageUnavailable, get_db, persistent_storage_required

COLLECTION = "profile"
_META_KEY = "__profile_meta__"
_memory_profiles: dict[str, dict] = {}


@dataclass(frozen=True)
class ProfilePatchConflict:
    profile: dict
    revisions: dict[str, int]
    conflicts: dict[str, dict[str, int]]


async def _get_collection():
    db = await get_db()
    if db is not None:
        return db[COLLECTION]
    if persistent_storage_required():
        raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.")
    return None


def _public_payload(doc: Optional[dict]) -> dict:
    if not doc:
        return {}
    return {key: value for key, value in doc.items() if key not in {"_id", _META_KEY}}


def _meta(doc: Optional[dict]) -> tuple[dict[str, int], int]:
    raw = (doc or {}).get(_META_KEY) or {}
    raw_revisions = raw.get("key_revisions") or {}
    revisions = {
        str(key): max(0, int(value))
        for key, value in raw_revisions.items()
        if isinstance(key, str) and isinstance(value, (int, float))
    }
    write_revision = max(0, int(raw.get("write_revision") or 0))
    return revisions, write_revision


def _public_with_revisions(doc: Optional[dict]) -> dict:
    payload = _public_payload(doc)
    revisions, _ = _meta(doc)
    return {**payload, "revisions": revisions}


def _next_full_revisions(previous: dict, previous_revisions: dict[str, int], replacement: dict) -> dict[str, int]:
    before = previous.get("data") if isinstance(previous.get("data"), dict) else {}
    after = replacement.get("data") if isinstance(replacement.get("data"), dict) else {}
    revisions = dict(previous_revisions)
    for key in set(before) | set(after):
        if before.get(key) != after.get(key) or (key in before) != (key in after):
            revisions[key] = revisions.get(key, 0) + 1
    return revisions


def _build_internal(username: str, payload: dict, revisions: dict[str, int], write_revision: int) -> dict:
    return {
        **payload,
        "_id": username,
        _META_KEY: {
            "key_revisions": revisions,
            "write_revision": write_revision,
        },
    }


async def get_profile(username: str) -> Optional[dict]:
    """Devuelve payload público + revisiones por clave.

    `None` conserva la distinción entre cuenta sin perfil y un documento real
    vacío. El endpoint puede seguir serializando ambos de forma compatible.
    """
    col = await _get_collection()
    if col is not None:
        try:
            doc = await col.find_one({"_id": username})
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc
        return _public_with_revisions(doc) if doc else None
    doc = _memory_profiles.get(username)
    return _public_with_revisions(doc) if doc else None


async def save_profile(username: str, data: dict) -> dict:
    """PUT compatible: reemplaza el documento completo.

    Se mantiene para importaciones/restauraciones explícitas y clientes viejos.
    Las revisiones de las claves modificadas avanzan para que un PATCH posterior
    pueda detectar que partía de una foto antigua.
    """
    safe_data = {
        key: value
        for key, value in data.items()
        if key not in {"_id", _META_KEY, "revisions"}
    }
    col = await _get_collection()
    if col is not None:
        try:
            previous_doc = await col.find_one({"_id": username})
            previous = _public_payload(previous_doc)
            previous_revisions, write_revision = _meta(previous_doc)
            revisions = _next_full_revisions(previous, previous_revisions, safe_data)
            doc = _build_internal(username, safe_data, revisions, write_revision + 1)
            await col.replace_one({"_id": username}, doc, upsert=True)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc
    else:
        previous_doc = _memory_profiles.get(username)
        previous = _public_payload(previous_doc)
        previous_revisions, write_revision = _meta(previous_doc)
        revisions = _next_full_revisions(previous, previous_revisions, safe_data)
        _memory_profiles[username] = _build_internal(username, safe_data, revisions, write_revision + 1)
    return {**safe_data, "revisions": revisions}


async def patch_profile(
    username: str,
    changes: dict,
    expected_revisions: dict,
) -> dict | ProfilePatchConflict:
    """Fusiona cambios por clave con compare-and-swap optimista.

    `changes` contiene únicamente entradas de `data`; `None` significa borrar
    la clave. Cada clave declara la revisión desde la que fue editada. Si una
    de ellas cambió en servidor devolvemos un conflicto 409 al endpoint con la
    foto remota actual; claves independientes no entran en conflicto.
    """
    clean_changes = {str(key): value for key, value in changes.items() if isinstance(key, str)}
    clean_expected = {
        str(key): max(0, int(value))
        for key, value in expected_revisions.items()
        if isinstance(key, str) and isinstance(value, (int, float))
    }

    col = await _get_collection()

    # Mongo usa un CAS global interno sólo para hacer atómica la escritura. La
    # decisión de conflicto sigue siendo por clave, así que una carrera en otra
    # clave simplemente reintenta contra la foto nueva.
    for _attempt in range(5):
        try:
            current_doc = await col.find_one({"_id": username}) if col is not None else _memory_profiles.get(username)
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc

        current = _public_payload(current_doc)
        revisions, write_revision = _meta(current_doc)
        current_data = current.get("data") if isinstance(current.get("data"), dict) else {}

        conflicts = {}
        for key in clean_changes:
            expected = clean_expected.get(key, 0)
            actual = revisions.get(key, 0)
            if expected != actual:
                conflicts[key] = {"expected": expected, "actual": actual}
        if conflicts:
            return ProfilePatchConflict(
                profile={**current, "revisions": revisions},
                revisions=revisions,
                conflicts=conflicts,
            )

        next_data = dict(current_data)
        next_revisions = dict(revisions)
        for key, value in clean_changes.items():
            if value is None:
                next_data.pop(key, None)
            else:
                next_data[key] = value
            next_revisions[key] = next_revisions.get(key, 0) + 1

        next_payload = {**current, "data": next_data}
        next_doc = _build_internal(username, next_payload, next_revisions, write_revision + 1)

        if col is None:
            _memory_profiles[username] = next_doc
            return {**next_payload, "revisions": next_revisions}

        try:
            if current_doc is None:
                result = await col.replace_one({"_id": username}, next_doc, upsert=True)
                if result.upserted_id is not None or result.matched_count:
                    return {**next_payload, "revisions": next_revisions}
            else:
                current_meta = current_doc.get(_META_KEY)
                query = {"_id": username}
                if isinstance(current_meta, dict) and "write_revision" in current_meta:
                    query[f"{_META_KEY}.write_revision"] = write_revision
                else:
                    query[_META_KEY] = {"$exists": False}
                result = await col.replace_one(query, next_doc, upsert=False)
                if result.matched_count:
                    return {**next_payload, "revisions": next_revisions}
        except DuplicateKeyError:
            # Otro request ganó la creación inicial. Releer y decidir por clave.
            continue
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc

    raise PersistentStorageUnavailable("No se pudo confirmar el perfil tras varios intentos concurrentes.")


async def delete_profile(username: str) -> bool:
    col = await _get_collection()
    if col is not None:
        try:
            result = await col.delete_one({"_id": username})
            return result.deleted_count > 0
        except PyMongoError as exc:
            raise PersistentStorageUnavailable("MongoDB no está disponible para perfiles.") from exc
    return _memory_profiles.pop(username, None) is not None
