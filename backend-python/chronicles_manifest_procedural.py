"""Seeded layout overlay for authored Chronicles manifests.

Authored manifests remain the semantic source of truth for quests, enemy
contracts, rewards and transitions. This layer changes only the traversable
geometry around their mandatory anchor coordinates, so a new run can feel
different without invalidating narrative/mechanical relationships.
"""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
import hashlib
from typing import Any

from chronicles_content_variation import (
    CHRONICLES_COMPOSITION_VERSION,
    CHRONICLES_TREASURE_VARIATION_VERSION,
    apply_chronicles_seeded_composition,
    apply_chronicles_seeded_treasure_boons,
)
from chronicles_map_code import ChroniclesMapCode, encode_chronicles_map_code
from chronicles_map_generator import (
    CHRONICLES_MAP_GENERATOR_VERSION,
    generate_chronicles_layout,
)


_CONTENT_GROUPS = ("triggers", "interactables", "treasures", "traps", "exits")
_CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))


@dataclass(frozen=True, slots=True)
class ChroniclesProceduralManifest:
    manifest: dict[str, Any]
    map_code: str
    generator_version: int
    layout_revision: str


def _theme_for_map_id(map_id: str) -> str:
    value = str(map_id or "").lower()
    if "gallery" in value:
        return "gallery"
    if "ash" in value:
        return "ash"
    if "archive" in value:
        return "archive"
    if "foundry" in value or "iron" in value:
        return "iron"
    if "basilica" in value:
        return "basilica"
    if "bell" in value or "tower" in value:
        return "bell"
    if "glass" in value:
        return "glass"
    if "cistern" in value or "water" in value:
        return "water"
    return "crypt"


def _verbs_for_manifest(manifest: dict[str, Any], theme: str) -> tuple[str, ...]:
    interactables = manifest.get("interactables", [])
    traps = manifest.get("traps", [])
    entries = [
        *manifest.get("triggers", []),
        *interactables,
        *manifest.get("treasures", []),
        *traps,
        *manifest.get("exits", []),
    ]

    verbs: list[str] = []
    if any(entry.get("kind") == "lever" for entry in interactables):
        verbs.append("sluice" if theme == "water" else "lever")
    if traps:
        verbs.append("traps")
    if any(entry.get("kind") == "secret-door" for entry in entries):
        verbs.append("secret")
    if manifest.get("enemies"):
        verbs.append("guardian")
    if not verbs:
        verbs.append("hunt")
    return tuple(verbs[:4])


def _difficulty_for_manifest(manifest: dict[str, Any]) -> int:
    enemies = manifest.get("enemies", [])
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


def chronicles_map_code_for_manifest(manifest: dict[str, Any], seed: int) -> ChroniclesMapCode:
    grid = manifest.get("grid") or []
    width = len(grid[0]) if grid else 0
    height = len(grid)
    theme = _theme_for_map_id(manifest.get("id", ""))
    secret_count = sum(
        1
        for group in _CONTENT_GROUPS
        for entry in manifest.get(group, [])
        if entry.get("kind") == "secret-door"
    )
    return ChroniclesMapCode(
        theme=theme,
        width=width,
        height=height,
        verbs=_verbs_for_manifest(manifest, theme),
        enemies=max(2, min(8, len(manifest.get("enemies", [])))),
        treasures=min(4, len(manifest.get("treasures", []))),
        secrets=min(3, secret_count),
        difficulty=_difficulty_for_manifest(manifest),
        seed=int(seed),
    )


def _base_marker_positions(manifest: dict[str, Any]) -> dict[tuple[int, int], str]:
    markers: dict[tuple[int, int], str] = {}
    for y, row in enumerate(manifest["grid"]):
        for x, cell in enumerate(row):
            if cell not in {"#", "."}:
                markers[(x, y)] = cell
    return markers


def _anchor_positions(manifest: dict[str, Any]) -> set[tuple[int, int]]:
    anchors: set[tuple[int, int]] = set()
    start = manifest.get("partyStart") or {}
    anchors.add((int(start["x"]), int(start["y"])))

    for enemy in manifest.get("enemies", []):
        anchors.add((int(enemy["x"]), int(enemy["y"])))
        for point in enemy.get("ai", {}).get("patrolRoute", []):
            anchors.add((int(point["x"]), int(point["y"])))
        for point in (enemy.get("positions") or {}).values():
            anchors.add((int(point["x"]), int(point["y"])))

    for group in _CONTENT_GROUPS:
        for entry in manifest.get(group, []):
            if "x" in entry and "y" in entry:
                anchors.add((int(entry["x"]), int(entry["y"])))

    anchors.update(_base_marker_positions(manifest))
    return anchors


def _open_cells(grid: list[list[str]]) -> set[tuple[int, int]]:
    return {
        (x, y)
        for y, row in enumerate(grid)
        for x, cell in enumerate(row)
        if cell != "#"
    }


def _axis_order(map_code: str, point: tuple[int, int]) -> bool:
    digest = hashlib.sha256(
        f"{map_code}:{point[0]}:{point[1]}".encode("utf-8")
    ).digest()
    return bool(digest[0] & 1)


def _connect_anchor(
    grid: list[list[str]],
    open_cells: set[tuple[int, int]],
    anchor: tuple[int, int],
    map_code: str,
) -> None:
    if anchor in open_cells:
        return

    ax, ay = anchor
    target = min(
        open_cells,
        key=lambda point: (
            abs(point[0] - ax) + abs(point[1] - ay),
            point[1],
            point[0],
        ),
    )

    x, y = ax, ay
    grid[y][x] = "."
    open_cells.add((x, y))

    horizontal_first = _axis_order(map_code, anchor)
    axes = ("x", "y") if horizontal_first else ("y", "x")
    for axis in axes:
        if axis == "x":
            while x != target[0]:
                x += 1 if target[0] > x else -1
                grid[y][x] = "."
                open_cells.add((x, y))
        else:
            while y != target[1]:
                y += 1 if target[1] > y else -1
                grid[y][x] = "."
                open_cells.add((x, y))


def _layout_revision(map_code: str, grid: list[str]) -> str:
    material = (
        f"seeded-area-v{CHRONICLES_MAP_GENERATOR_VERSION}\0{map_code}\0"
        + "\n".join(grid)
    ).encode("utf-8")
    return hashlib.sha256(material).hexdigest()


def proceduralize_chronicles_manifest(
    manifest: dict[str, Any],
    seed: int,
) -> ChroniclesProceduralManifest:
    composition = apply_chronicles_seeded_composition(manifest, seed)
    treasure_variation = apply_chronicles_seeded_treasure_boons(
        composition.manifest,
        seed,
    )
    composed_manifest = treasure_variation.manifest
    recipe = chronicles_map_code_for_manifest(composed_manifest, seed)
    map_code = encode_chronicles_map_code(recipe)
    layout = generate_chronicles_layout(recipe)

    grid = [
        [
            "." if cell in {"P", "X"} else cell
            for cell in row
        ]
        for row in layout.grid
    ]
    open_cells = _open_cells(grid)

    for anchor in sorted(_anchor_positions(composed_manifest), key=lambda point: (point[1], point[0])):
        _connect_anchor(grid, open_cells, anchor, map_code)

    for (x, y), marker in _base_marker_positions(composed_manifest).items():
        grid[y][x] = marker

    start = composed_manifest["partyStart"]
    grid[int(start["y"])][int(start["x"])] = "P"
    final_grid = ["".join(row) for row in grid]

    generated = deepcopy(composed_manifest)
    generated["grid"] = final_grid
    generated["generation"] = {
        "kind": "seeded-layout",
        "mapCode": map_code,
        "generatorVersion": CHRONICLES_MAP_GENERATOR_VERSION,
        "layoutRevision": _layout_revision(map_code, final_grid),
        "compositionVersion": CHRONICLES_COMPOSITION_VERSION,
        "compositionRevision": composition.plan.revision,
        "activeOptionalEnemyIds": list(composition.plan.active_optional_enemy_ids),
        "omittedOptionalEnemyIds": list(composition.plan.omitted_optional_enemy_ids),
        "protectedOptionalEnemyIds": list(composition.plan.protected_optional_enemy_ids),
        "treasureVariationVersion": CHRONICLES_TREASURE_VARIATION_VERSION,
        "treasureVariationRevision": treasure_variation.plan.revision,
        "treasureBoons": [boon.as_dict() for boon in treasure_variation.plan.boons],
    }

    return ChroniclesProceduralManifest(
        manifest=generated,
        map_code=map_code,
        generator_version=CHRONICLES_MAP_GENERATOR_VERSION,
        layout_revision=generated["generation"]["layoutRevision"],
    )
