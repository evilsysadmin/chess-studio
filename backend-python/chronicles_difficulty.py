"""Authoritative encounter difficulty for Chronicles runs.

The frontend exposes the same bounded progression policy for presentation, but
the backend owns the snapshot that actually shapes encounter stats. A run keeps
its starting party level so F5, another renderer and another device reconstruct
the same threat instead of recalculating from whatever the profile looks like
later.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


CHRONICLES_DIFFICULTY_VERSION = 1
CHRONICLES_PARTY_LEVEL_CAP = 12
CHRONICLES_ENEMY_LEVEL_CAP = 20
CHRONICLES_DEPTH_PRESSURE_CAP = 6
CHRONICLES_ABOVE_PARTY_CAP = 1
CHRONICLES_MIN_APPLIED_DELTA = -2
CHRONICLES_MAX_APPLIED_DELTA = 3


def _bounded_int(value: Any, minimum: int, maximum: int, fallback: int) -> int:
    if isinstance(value, bool):
        return fallback
    try:
        number = int(value)
    except (TypeError, ValueError):
        return fallback
    return max(minimum, min(maximum, number))


def chronicles_difficulty_band(*, party_level: int, depth: int = 0) -> dict[str, int]:
    """Mirror the deliberately sub-linear frontend progression policy."""
    safe_party = _bounded_int(party_level, 1, CHRONICLES_PARTY_LEVEL_CAP, 1)
    safe_depth = _bounded_int(depth, 0, 99, 0)
    depth_pressure = min(CHRONICLES_DEPTH_PRESSURE_CAP, safe_depth // 2)
    progression_pressure = (safe_party - 1) // 2
    uncapped_target = 1 + depth_pressure + progression_pressure
    target_level = min(
        CHRONICLES_PARTY_LEVEL_CAP,
        safe_party + CHRONICLES_ABOVE_PARTY_CAP,
        uncapped_target,
    )
    return {
        "partyLevel": safe_party,
        "depth": safe_depth,
        "targetLevel": target_level,
        "minLevel": max(1, target_level - 1),
        "maxLevel": min(
            CHRONICLES_PARTY_LEVEL_CAP,
            safe_party + CHRONICLES_ABOVE_PARTY_CAP,
            target_level + 1,
        ),
        "depthPressure": depth_pressure,
        "progressionPressure": progression_pressure,
    }


def chronicles_authored_difficulty(manifest: dict[str, Any]) -> int:
    explicit = manifest.get("proceduralDifficulty")
    if explicit is not None:
        return _bounded_int(explicit, 1, 5, 1)

    enemies = manifest.get("enemies") or []
    if not enemies:
        return 1
    average_hp = sum(max(1, int(enemy.get("maxHp", 1))) for enemy in enemies) / len(enemies)
    if average_hp <= 5:
        return 1
    if average_hp <= 7:
        return 2
    if average_hp <= 9:
        return 3
    if average_hp <= 11:
        return 4
    return 5


def _damage_delta(applied_delta: int) -> int:
    # Easing down should be noticeable immediately; ramping up is deliberately
    # slower because multi-enemy encounters compound damage much faster than HP.
    if applied_delta < 0:
        return -min(1, (abs(applied_delta) + 1) // 2)
    return min(1, applied_delta // 2)


def _scaled_enemy_level(enemy: dict[str, Any], applied_delta: int, fallback_level: int) -> int:
    build = enemy.get("enemyBuild")
    if isinstance(build, dict):
        current = _bounded_int(build.get("level"), 1, CHRONICLES_ENEMY_LEVEL_CAP, fallback_level)
    else:
        current = fallback_level
    return _bounded_int(
        current + applied_delta,
        1,
        CHRONICLES_ENEMY_LEVEL_CAP,
        fallback_level,
    )


def apply_chronicles_combat_difficulty(
    manifest: dict[str, Any],
    *,
    party_level: int,
    depth: int = 0,
) -> tuple[dict[str, Any], dict[str, int]]:
    """Return a scaled copy plus the immutable difficulty snapshot metadata."""
    scaled = deepcopy(manifest)
    band = chronicles_difficulty_band(party_level=party_level, depth=depth)
    authored_level = chronicles_authored_difficulty(manifest)
    requested_delta = band["targetLevel"] - authored_level
    applied_delta = max(
        CHRONICLES_MIN_APPLIED_DELTA,
        min(CHRONICLES_MAX_APPLIED_DELTA, requested_delta),
    )
    damage_delta = _damage_delta(applied_delta)

    for enemy in scaled.get("enemies") or []:
        raw_hp = max(1, int(enemy.get("maxHp", 1)))
        raw_damage = max(0, int(enemy.get("retaliation", 0)))
        enemy["maxHp"] = max(1, raw_hp + applied_delta)
        enemy["retaliation"] = max(0, raw_damage + damage_delta)

        scaled_level = _scaled_enemy_level(enemy, applied_delta, authored_level)
        enemy["difficultyLevel"] = scaled_level
        if isinstance(enemy.get("enemyBuild"), dict):
            enemy["enemyBuild"] = deepcopy(enemy["enemyBuild"])
            enemy["enemyBuild"]["level"] = scaled_level

    difficulty = {
        "version": CHRONICLES_DIFFICULTY_VERSION,
        **band,
        "authoredLevel": authored_level,
        "requestedDelta": requested_delta,
        "appliedDelta": applied_delta,
    }
    scaled.setdefault("generation", {})["combatDifficulty"] = deepcopy(difficulty)
    return scaled, difficulty
