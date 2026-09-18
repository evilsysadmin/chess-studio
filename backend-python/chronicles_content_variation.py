"""Deterministic, dependency-safe content variation for Chronicles runs.

Composition v1 is intentionally conservative: mandatory authored content is
never removed. Only enemies explicitly marked optional may be omitted, and
only when their HP state is not referenced elsewhere and their defeat effects
cannot mutate structural quest/map state.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
import json
from typing import Any


CHRONICLES_COMPOSITION_VERSION = 1
_SAFE_OPTIONAL_DEFEAT_EFFECTS = frozenset({
    "grant-item",
    "heal-party",
    "refill-class-abilities",
})


@dataclass(frozen=True, slots=True)
class ChroniclesCompositionPlan:
    active_optional_enemy_ids: tuple[str, ...]
    omitted_optional_enemy_ids: tuple[str, ...]
    protected_optional_enemy_ids: tuple[str, ...]
    revision: str

    def as_dict(self) -> dict[str, object]:
        return {
            "version": CHRONICLES_COMPOSITION_VERSION,
            "activeOptionalEnemyIds": list(self.active_optional_enemy_ids),
            "omittedOptionalEnemyIds": list(self.omitted_optional_enemy_ids),
            "protectedOptionalEnemyIds": list(self.protected_optional_enemy_ids),
            "revision": self.revision,
        }


@dataclass(frozen=True, slots=True)
class ChroniclesComposedManifest:
    manifest: dict[str, Any]
    plan: ChroniclesCompositionPlan


def _contains_string(value: Any, needle: str) -> bool:
    if isinstance(value, str):
        return value == needle
    if isinstance(value, dict):
        return any(_contains_string(item, needle) for item in value.values())
    if isinstance(value, list):
        return any(_contains_string(item, needle) for item in value)
    return False


def _enemy_hp_is_referenced_elsewhere(
    manifest: dict[str, Any],
    enemy: dict[str, Any],
) -> bool:
    hp_key = str(enemy.get("hpKey") or "")
    if not hp_key:
        return True

    enemy_id = enemy.get("id")
    surface = {
        key: (
            [
                entry
                for entry in value
                if not isinstance(entry, dict) or entry.get("id") != enemy_id
            ]
            if key == "enemies" and isinstance(value, list)
            else value
        )
        for key, value in manifest.items()
    }
    return _contains_string(surface, hp_key)


def _enemy_defeat_is_structurally_safe(enemy: dict[str, Any]) -> bool:
    effects = (enemy.get("onDefeat") or {}).get("effects") or []
    return all(
        isinstance(effect, dict)
        and effect.get("type") in _SAFE_OPTIONAL_DEFEAT_EFFECTS
        for effect in effects
    )


def chronicles_optional_enemy_is_variable(
    manifest: dict[str, Any],
    enemy: dict[str, Any],
) -> bool:
    return (
        enemy.get("optional") is True
        and not _enemy_hp_is_referenced_elsewhere(manifest, enemy)
        and _enemy_defeat_is_structurally_safe(enemy)
    )


def _include_optional_enemy(map_id: str, seed: int, enemy_id: str) -> bool:
    material = (
        f"chronicles-composition-v{CHRONICLES_COMPOSITION_VERSION}:"
        f"{map_id}:{int(seed)}:{enemy_id}"
    ).encode("utf-8")
    # Roughly 62.5% present, 37.5% omitted. The exact split is versioned by
    # CHRONICLES_COMPOSITION_VERSION and therefore replay-stable.
    return hashlib.sha256(material).digest()[0] < 160


def _plan_revision(
    map_id: str,
    seed: int,
    active: tuple[str, ...],
    omitted: tuple[str, ...],
    protected: tuple[str, ...],
) -> str:
    payload = {
        "version": CHRONICLES_COMPOSITION_VERSION,
        "mapId": map_id,
        "seed": int(seed),
        "active": active,
        "omitted": omitted,
        "protected": protected,
    }
    encoded = json.dumps(
        payload,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def chronicles_seeded_composition_plan(
    manifest: dict[str, Any],
    seed: int,
) -> ChroniclesCompositionPlan:
    map_id = str(manifest.get("id") or "")
    active: list[str] = []
    omitted: list[str] = []
    protected: list[str] = []

    for enemy in manifest.get("enemies", []):
        if enemy.get("optional") is not True:
            continue
        enemy_id = str(enemy.get("id") or "")
        if not chronicles_optional_enemy_is_variable(manifest, enemy):
            protected.append(enemy_id)
            continue
        if _include_optional_enemy(map_id, seed, enemy_id):
            active.append(enemy_id)
        else:
            omitted.append(enemy_id)

    active_ids = tuple(sorted(active))
    omitted_ids = tuple(sorted(omitted))
    protected_ids = tuple(sorted(protected))
    return ChroniclesCompositionPlan(
        active_optional_enemy_ids=active_ids,
        omitted_optional_enemy_ids=omitted_ids,
        protected_optional_enemy_ids=protected_ids,
        revision=_plan_revision(
            map_id,
            seed,
            active_ids,
            omitted_ids,
            protected_ids,
        ),
    )


def apply_chronicles_seeded_composition(
    manifest: dict[str, Any],
    seed: int,
) -> ChroniclesComposedManifest:
    plan = chronicles_seeded_composition_plan(manifest, seed)
    omitted = set(plan.omitted_optional_enemy_ids)
    composed = deepcopy(manifest)
    composed["enemies"] = [
        enemy
        for enemy in composed.get("enemies", [])
        if enemy.get("id") not in omitted
    ]
    return ChroniclesComposedManifest(manifest=composed, plan=plan)
