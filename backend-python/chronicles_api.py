"""Chronicles Game Director: versioned world manifests and run identity.

The browser still owns frame-critical simulation (input, rendering, animation,
movement interpolation and combat feedback). This API owns validated world
content and stable run metadata that can safely move out of the frontend
without putting the game loop behind network latency.
"""

from __future__ import annotations

import hashlib
import json
import re
import secrets
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field

import chronicles_run_store
from operation_idempotency_core import (
    InvalidIdempotencyKey,
    normalize_idempotency_key,
    operation_fingerprint,
)


CHRONICLES_MANIFEST_SCHEMA_VERSION = 1
CHRONICLES_MAP_ROOT = Path(__file__).with_name("chronicles_maps")
CHRONICLES_RUN_NAMESPACE = uuid.UUID("e73c9496-fffd-4dc4-a0d0-8c7b6060a116")
_MAP_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_CONTENT_GROUPS = ("triggers", "interactables", "treasures", "traps", "exits")
_MAX_SEED = 2_147_483_647


class ChroniclesManifestError(ValueError):
    """Raised when repository-owned Chronicles content violates its contract."""


class CreateChroniclesRunRequest(BaseModel):
    map_id: str = Field(default="crypt-eight-squares", alias="mapId")

    model_config = {"populate_by_name": True, "extra": "forbid"}


def _canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _walkable(grid: list[str], x: Any, y: Any, *, label: str) -> None:
    if not isinstance(x, int) or isinstance(x, bool) or not isinstance(y, int) or isinstance(y, bool):
        raise ChroniclesManifestError(f"{label} requires integer coordinates")
    if y < 0 or y >= len(grid) or x < 0 or x >= len(grid[0]):
        raise ChroniclesManifestError(f"{label} is outside the grid")
    if grid[y][x] == "#":
        raise ChroniclesManifestError(f"{label} cannot occupy a wall")


def _validate_manifest(payload: Any, *, expected_map_id: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ChroniclesManifestError("manifest must be an object")
    if payload.get("id") != expected_map_id:
        raise ChroniclesManifestError("manifest id does not match requested map")
    version = payload.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise ChroniclesManifestError("manifest version must be a positive integer")

    grid = payload.get("grid")
    if not isinstance(grid, list) or not grid or not all(isinstance(row, str) and row for row in grid):
        raise ChroniclesManifestError("manifest grid must be a non-empty string array")
    width = len(grid[0])
    if any(len(row) != width for row in grid):
        raise ChroniclesManifestError("manifest grid must be rectangular")

    party_start = payload.get("partyStart")
    if not isinstance(party_start, dict):
        raise ChroniclesManifestError("manifest partyStart must be an object")
    _walkable(grid, party_start.get("x"), party_start.get("y"), label="partyStart")
    direction = party_start.get("direction")
    if not isinstance(direction, int) or isinstance(direction, bool) or direction not in (0, 1, 2, 3):
        raise ChroniclesManifestError("partyStart direction must be 0..3")

    if not isinstance(payload.get("initialFlags", {}), dict):
        raise ChroniclesManifestError("initialFlags must be an object")

    enemy_ids: set[str] = set()
    hp_keys: set[str] = set()
    enemies = payload.get("enemies", [])
    if not isinstance(enemies, list):
        raise ChroniclesManifestError("enemies must be an array")
    for enemy in enemies:
        if not isinstance(enemy, dict):
            raise ChroniclesManifestError("enemy entries must be objects")
        enemy_id = enemy.get("id")
        hp_key = enemy.get("hpKey")
        if not isinstance(enemy_id, str) or not enemy_id or enemy_id in enemy_ids:
            raise ChroniclesManifestError("enemy ids must be non-empty and unique")
        if not isinstance(hp_key, str) or not hp_key or hp_key in hp_keys:
            raise ChroniclesManifestError("enemy hpKey values must be non-empty and unique")
        enemy_ids.add(enemy_id)
        hp_keys.add(hp_key)
        _walkable(grid, enemy.get("x"), enemy.get("y"), label=f"enemy {enemy_id}")

    content_ids: set[str] = set()
    for group in _CONTENT_GROUPS:
        entries = payload.get(group, [])
        if not isinstance(entries, list):
            raise ChroniclesManifestError(f"{group} must be an array")
        for entry in entries:
            if not isinstance(entry, dict):
                raise ChroniclesManifestError(f"{group} entries must be objects")
            entry_id = entry.get("id")
            if not isinstance(entry_id, str) or not entry_id or entry_id in content_ids:
                raise ChroniclesManifestError("content ids must be non-empty and unique")
            content_ids.add(entry_id)
            has_x = "x" in entry
            has_y = "y" in entry
            if has_x != has_y:
                raise ChroniclesManifestError(f"{group} {entry_id} requires both x and y")
            if has_x:
                _walkable(grid, entry.get("x"), entry.get("y"), label=f"{group} {entry_id}")
            elif not isinstance(entry.get("tile"), str) or len(entry["tile"]) != 1:
                raise ChroniclesManifestError(f"{group} {entry_id} requires coordinates or one tile marker")
            if not isinstance(entry.get("action"), dict):
                raise ChroniclesManifestError(f"{group} {entry_id} requires an action")

    return payload


def _safe_map_id(map_id: str) -> str:
    if not _MAP_ID_RE.fullmatch(map_id or ""):
        raise HTTPException(404, "Mapa de Chronicles no encontrado.")
    return map_id


@lru_cache(maxsize=32)
def _load_manifest_cached(root: str, map_id: str) -> tuple[dict[str, Any], str]:
    path = Path(root) / f"{map_id}.json"
    if not path.is_file():
        raise FileNotFoundError(map_id)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ChroniclesManifestError(f"cannot read {map_id}") from exc
    manifest = _validate_manifest(payload, expected_map_id=map_id)
    revision = hashlib.sha256(_canonical_bytes(manifest)).hexdigest()
    return manifest, revision


def load_chronicles_manifest(map_id: str, *, root: Path | None = None) -> tuple[dict[str, Any], str]:
    """Load and validate repository-owned content without exposing cached mutation."""
    safe_id = _safe_map_id(map_id)
    base = (root or CHRONICLES_MAP_ROOT).resolve()
    try:
        manifest, revision = _load_manifest_cached(str(base), safe_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Mapa de Chronicles no encontrado.") from exc
    except ChroniclesManifestError as exc:
        raise HTTPException(500, "El manifiesto de Chronicles no supera validación.") from exc
    return json.loads(json.dumps(manifest, ensure_ascii=False)), revision


def chronicles_area_envelope(map_id: str, seed: int, *, root: Path | None = None) -> dict[str, Any]:
    manifest, revision = load_chronicles_manifest(map_id, root=root)
    instance_material = (
        f"chronicles-area-v{CHRONICLES_MANIFEST_SCHEMA_VERSION}:{manifest['id']}:{manifest['version']}:{seed}:{revision}"
    ).encode("utf-8")
    instance_id = hashlib.sha256(instance_material).hexdigest()[:24]
    return {
        "schemaVersion": CHRONICLES_MANIFEST_SCHEMA_VERSION,
        "mapId": manifest["id"],
        "contentVersion": manifest["version"],
        "seed": seed,
        "instanceId": instance_id,
        "manifestRevision": revision,
        "manifest": manifest,
    }


def _run_id(username: str, idempotency_key: str | None) -> str:
    if idempotency_key:
        return str(uuid.uuid5(CHRONICLES_RUN_NAMESPACE, f"{username}:{idempotency_key}"))
    return str(uuid.uuid4())


def _run_bootstrap_payload(run: dict[str, Any]) -> dict[str, Any]:
    area = chronicles_area_envelope(run["currentMapId"], run["seed"])
    if (
        area["contentVersion"] != run["contentVersion"]
        or area["manifestRevision"] != run["manifestRevision"]
    ):
        raise HTTPException(409, "La revisión de contenido de esta run ya no está disponible.")
    return {**run, "area": area}


def build_chronicles_router(*, auth_dependency) -> APIRouter:
    router = APIRouter(prefix="/api/chronicles", tags=["chronicles"])

    @router.get("/maps/{map_id}")
    async def area_manifest(
        map_id: str,
        seed: int = Query(default=0, ge=0, le=_MAX_SEED),
        _username: str = Depends(auth_dependency),
    ):
        return chronicles_area_envelope(map_id, seed)

    @router.post("/runs", status_code=201)
    async def create_run(
        body: CreateChroniclesRunRequest,
        username: str = Depends(auth_dependency),
        raw_idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
    ):
        try:
            idempotency_key = normalize_idempotency_key(raw_idempotency_key)
        except InvalidIdempotencyKey as exc:
            raise HTTPException(400, str(exc)) from exc

        manifest, revision = load_chronicles_manifest(body.map_id)
        fingerprint = operation_fingerprint({"mapId": body.map_id})
        try:
            run = await chronicles_run_store.create_or_replay_run(
                run_id=_run_id(username, idempotency_key),
                owner=username,
                seed=secrets.randbelow(_MAX_SEED + 1),
                map_id=body.map_id,
                content_version=manifest["version"],
                manifest_revision=revision,
                create_fingerprint=fingerprint,
            )
            return _run_bootstrap_payload(run)
        except ValueError as exc:
            if str(exc) == "idempotency-conflict":
                raise HTTPException(409, "La misma Idempotency-Key se reutilizó con otra configuración de run.") from exc
            raise

    @router.get("/runs/{run_id}")
    async def get_run(run_id: str, username: str = Depends(auth_dependency)):
        row = await chronicles_run_store.get_run(run_id, username)
        if row is None:
            raise HTTPException(404, "Run de Chronicles no encontrada.")
        return row

    return router
