"""Pawn Slug Game Director: versioned stage content outside the frame loop.

The browser remains authoritative for frame-critical simulation: input,
movement, rendering, collisions, shooting, hit detection and immediate AI.
This API serves validated, deterministic stage content only.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query


PAWN_SLUG_MANIFEST_SCHEMA_VERSION = 1
PAWN_SLUG_MANIFEST_ROOT = Path(__file__).with_name("pawn_slug_manifests")
_STAGE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
_MAX_SEED = 2_147_483_647


class PawnSlugManifestError(ValueError):
    """Raised when repository-owned Pawn Slug content violates its contract."""


def _canonical_bytes(payload: Any) -> bytes:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _number(value: Any, *, label: str, positive: bool = False, nonnegative: bool = False) -> float | int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise PawnSlugManifestError(f"{label} must be finite")
    if positive and value <= 0:
        raise PawnSlugManifestError(f"{label} must be positive")
    if nonnegative and value < 0:
        raise PawnSlugManifestError(f"{label} must be non-negative")
    return value


def _validate_manifest(payload: Any, *, expected_stage_id: str) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise PawnSlugManifestError("manifest must be an object")
    if payload.get("id") != expected_stage_id:
        raise PawnSlugManifestError("manifest id does not match requested stage")
    version = payload.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise PawnSlugManifestError("manifest version must be a positive integer")

    world = payload.get("world")
    if not isinstance(world, dict):
        raise PawnSlugManifestError("world must be an object")
    width = _number(world.get("width"), label="world.width", positive=True)
    _number(world.get("groundY"), label="world.groundY")
    boss_x = _number(world.get("bossX"), label="world.bossX")
    extraction_x = _number(world.get("extractionX"), label="world.extractionX")
    if boss_x <= 0 or boss_x >= extraction_x:
        raise PawnSlugManifestError("bossX must be inside the stage before extraction")
    if extraction_x > width:
        raise PawnSlugManifestError("extractionX must be inside the stage")

    profiles = payload.get("enemyProfiles")
    if not isinstance(profiles, dict) or not profiles:
        raise PawnSlugManifestError("enemyProfiles must be a non-empty object")
    for enemy_type, profile in profiles.items():
        if not isinstance(enemy_type, str) or not enemy_type or not isinstance(profile, dict):
            raise PawnSlugManifestError("enemy profiles require non-empty type keys and object values")
        _number(profile.get("hp"), label=f"{enemy_type}.hp", positive=True)
        _number(profile.get("speed"), label=f"{enemy_type}.speed", nonnegative=True)
        _number(profile.get("score"), label=f"{enemy_type}.score", nonnegative=True)
        _number(profile.get("xp"), label=f"{enemy_type}.xp", nonnegative=True)
        _number(profile.get("width"), label=f"{enemy_type}.width", positive=True)
        _number(profile.get("height"), label=f"{enemy_type}.height", positive=True)
        if "midBoss" in profile and not isinstance(profile["midBoss"], bool):
            raise PawnSlugManifestError(f"{enemy_type}.midBoss must be boolean")

    spawns = payload.get("spawns")
    if not isinstance(spawns, list):
        raise PawnSlugManifestError("spawns must be an array")
    spawn_ids: set[str] = set()
    for spawn in spawns:
        if not isinstance(spawn, dict):
            raise PawnSlugManifestError("spawn entries must be objects")
        spawn_id = spawn.get("id")
        enemy_type = spawn.get("type")
        if not isinstance(spawn_id, str) or not spawn_id or spawn_id in spawn_ids:
            raise PawnSlugManifestError("spawn ids must be non-empty and unique")
        if not isinstance(enemy_type, str) or enemy_type not in profiles:
            raise PawnSlugManifestError(f"spawn {spawn_id} references an unknown enemy type")
        _number(spawn.get("x"), label=f"spawn {spawn_id}.x")
        if "y" in spawn:
            _number(spawn["y"], label=f"spawn {spawn_id}.y")
        spawn_ids.add(spawn_id)

    return payload


def _safe_stage_id(stage_id: str) -> str:
    if not _STAGE_ID_RE.fullmatch(stage_id or ""):
        raise HTTPException(404, "Stage de Pawn Slug no encontrado.")
    return stage_id


@lru_cache(maxsize=16)
def _load_manifest_cached(root: str, stage_id: str) -> tuple[dict[str, Any], str]:
    path = Path(root) / f"{stage_id}.json"
    if not path.is_file():
        raise FileNotFoundError(stage_id)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise PawnSlugManifestError(f"cannot read {stage_id}") from exc
    manifest = _validate_manifest(payload, expected_stage_id=stage_id)
    revision = hashlib.sha256(_canonical_bytes(manifest)).hexdigest()
    return manifest, revision


def load_pawn_slug_manifest(stage_id: str, *, root: Path | None = None) -> tuple[dict[str, Any], str]:
    """Load validated repository content without exposing cached mutation."""
    safe_id = _safe_stage_id(stage_id)
    base = (root or PAWN_SLUG_MANIFEST_ROOT).resolve()
    try:
        manifest, revision = _load_manifest_cached(str(base), safe_id)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Stage de Pawn Slug no encontrado.") from exc
    except PawnSlugManifestError as exc:
        raise HTTPException(500, "El manifiesto de Pawn Slug no supera validación.") from exc
    return json.loads(json.dumps(manifest, ensure_ascii=False)), revision


def pawn_slug_stage_envelope(stage_id: str, seed: int, *, root: Path | None = None) -> dict[str, Any]:
    manifest, revision = load_pawn_slug_manifest(stage_id, root=root)
    instance_material = (
        f"pawn-slug-stage-v{PAWN_SLUG_MANIFEST_SCHEMA_VERSION}:{manifest['id']}:{manifest['version']}:{seed}:{revision}"
    ).encode("utf-8")
    instance_id = hashlib.sha256(instance_material).hexdigest()[:24]
    return {
        "schemaVersion": PAWN_SLUG_MANIFEST_SCHEMA_VERSION,
        "stageId": manifest["id"],
        "contentVersion": manifest["version"],
        "seed": seed,
        "instanceId": instance_id,
        "manifestRevision": revision,
        "manifest": manifest,
    }


def build_pawn_slug_router(*, auth_dependency) -> APIRouter:
    router = APIRouter(prefix="/api/pawn-slug", tags=["pawn-slug"])

    @router.get("/stages/{stage_id}")
    async def stage_manifest(
        stage_id: str,
        seed: int = Query(default=0, ge=0, le=_MAX_SEED),
        _username: str = Depends(auth_dependency),
    ):
        return pawn_slug_stage_envelope(stage_id, seed)

    return router
