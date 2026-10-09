"""Seeded layout overlay for authored Chronicles manifests.

Authored manifests remain the semantic source of truth for quests, enemy
contracts, rewards and transitions. This layer changes only the traversable
geometry around their mandatory anchor coordinates, so a new run can feel
different without invalidating narrative/mechanical relationships.
"""

from __future__ import annotations

from collections import deque
from copy import deepcopy
from dataclasses import dataclass
import hashlib
from typing import Any

from chronicles_difficulty import chronicles_authored_difficulty
from chronicles_content_variation import (
    CHRONICLES_COMPOSITION_VERSION,
    CHRONICLES_MODULE_VARIATION_VERSION,
    CHRONICLES_TREASURE_VARIATION_VERSION,
    apply_chronicles_seeded_composition,
    apply_chronicles_seeded_modules,
    apply_chronicles_seeded_treasure_boons,
    chronicles_optional_enemy_is_variable,
)
from chronicles_map_code import ChroniclesMapCode, encode_chronicles_map_code
from chronicles_map_planner import (
    CHRONICLES_PLANNER_CONTRACT_VERSION,
    resolve_chronicles_planner_recipe,
)
from chronicles_map_generator import (
    CHRONICLES_MAP_GENERATOR_VERSION,
    ChroniclesMapGenerationError,
    generate_chronicles_layout,
)
from chronicles_topology_quality import (
    CHRONICLES_TOPOLOGY_QUALITY_VERSION,
    compare_chronicles_topology,
    evaluate_chronicles_topology,
)


_CONTENT_GROUPS = ("triggers", "interactables", "treasures", "traps", "exits")
_CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))
CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION = 1
CHRONICLES_EXIT_PLACEMENT_VERSION = 2
CHRONICLES_CONTENT_PLACEMENT_VERSION = CHRONICLES_EXIT_PLACEMENT_VERSION


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
        difficulty=chronicles_authored_difficulty(manifest),
        seed=int(seed),
    )


def _base_marker_positions(
    manifest: dict[str, Any],
    *,
    include_exit: bool = True,
) -> dict[tuple[int, int], str]:
    markers: dict[tuple[int, int], str] = {}
    for y, row in enumerate(manifest["grid"]):
        for x, cell in enumerate(row):
            if cell in {"#", "."}:
                continue
            if not include_exit and cell == "X":
                continue
            markers[(x, y)] = cell
    return markers


def _enemy_uses_seeded_placement(
    manifest: dict[str, Any],
    enemy: dict[str, Any],
    content_placement_version: int,
) -> bool:
    if content_placement_version < CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION:
        return False
    ai = enemy.get("ai") if isinstance(enemy, dict) else None
    return (
        isinstance(ai, dict)
        and ai.get("movement") == "hold"
        and not ai.get("patrolRoute")
        and not enemy.get("positions")
        and not enemy.get("positionKey")
        and chronicles_optional_enemy_is_variable(manifest, enemy)
    )


def _anchor_positions(
    manifest: dict[str, Any],
    *,
    content_placement_version: int = 0,
) -> set[tuple[int, int]]:
    anchors: set[tuple[int, int]] = set()
    start = manifest.get("partyStart") or {}
    anchors.add((int(start["x"]), int(start["y"])))

    for enemy in manifest.get("enemies", []):
        if _enemy_uses_seeded_placement(manifest, enemy, content_placement_version):
            continue
        anchors.add((int(enemy["x"]), int(enemy["y"])))
        for point in enemy.get("ai", {}).get("patrolRoute", []):
            anchors.add((int(point["x"]), int(point["y"])))
        for point in (enemy.get("positions") or {}).values():
            anchors.add((int(point["x"]), int(point["y"])))

    for group in _CONTENT_GROUPS:
        for entry in manifest.get(group, []):
            if "x" in entry and "y" in entry:
                anchors.add((int(entry["x"]), int(entry["y"])))

    anchors.update(_base_marker_positions(
        manifest,
        include_exit=content_placement_version < CHRONICLES_EXIT_PLACEMENT_VERSION,
    ))
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


def _grid_distances(
    grid: list[list[str]],
    start: tuple[int, int],
) -> dict[tuple[int, int], int]:
    queue = deque([start])
    distances = {start: 0}
    while queue:
        x, y = queue.popleft()
        for dx, dy in _CARDINAL:
            point = (x + dx, y + dy)
            px, py = point
            if (
                py < 0
                or py >= len(grid)
                or px < 0
                or px >= len(grid[0])
                or grid[py][px] == "#"
                or point in distances
            ):
                continue
            distances[point] = distances[(x, y)] + 1
            queue.append(point)
    return distances


def _place_seeded_exit(
    manifest: dict[str, Any],
    grid: list[list[str]],
    map_code: str,
    *,
    content_placement_version: int,
) -> tuple[int, int] | None:
    if content_placement_version < CHRONICLES_EXIT_PLACEMENT_VERSION:
        return None

    start = manifest.get("partyStart") or {}
    start_point = (int(start["x"]), int(start["y"]))
    distances = _grid_distances(grid, start_point)
    fixed_anchors = _anchor_positions(
        manifest,
        content_placement_version=content_placement_version,
    )
    candidates = [
        point
        for point, distance in distances.items()
        if distance >= 4
        and grid[point[1]][point[0]] == "."
        and point not in fixed_anchors
    ]
    if not candidates:
        raise ChroniclesMapGenerationError(
            "generated topology has no safe distant cell for the exit"
        )

    farthest_distance = max(distances[point] for point in candidates)
    farthest = [
        point
        for point in candidates
        if distances[point] == farthest_distance
    ]
    return min(
        farthest,
        key=lambda point: (
            hashlib.sha256(
                (
                    f"chronicles-exit-placement-v{CHRONICLES_EXIT_PLACEMENT_VERSION}:"
                    f"{map_code}:{point[0]}:{point[1]}"
                ).encode("utf-8")
            ).digest(),
            point[1],
            point[0],
        ),
    )


def _content_placement_revision(
    map_code: str,
    placements: tuple[tuple[str, int, int], ...],
    *,
    content_placement_version: int,
    exit_position: tuple[int, int] | None = None,
) -> str:
    material = (
        f"chronicles-content-placement-v{content_placement_version}:"
        f"{map_code}:"
        + "|".join(f"{enemy_id}:{x}:{y}" for enemy_id, x, y in placements)
    )
    if (
        content_placement_version >= CHRONICLES_EXIT_PLACEMENT_VERSION
        and exit_position is not None
    ):
        material += f"|exit:{exit_position[0]}:{exit_position[1]}"
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _place_seeded_optional_enemies(
    manifest: dict[str, Any],
    map_code: str,
    *,
    content_placement_version: int,
) -> tuple[tuple[tuple[str, int, int], ...], str | None]:
    if content_placement_version < CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION:
        return (), None

    relocatable = sorted(
        (
            enemy
            for enemy in manifest.get("enemies", [])
            if _enemy_uses_seeded_placement(
                manifest,
                enemy,
                content_placement_version,
            )
        ),
        key=lambda enemy: str(enemy.get("id") or ""),
    )
    if not relocatable:
        placements: tuple[tuple[str, int, int], ...] = ()
        return placements, _content_placement_revision(
            map_code,
            placements,
            content_placement_version=content_placement_version,
        )

    fixed_anchors = _anchor_positions(
        manifest,
        content_placement_version=content_placement_version,
    )
    start = manifest.get("partyStart") or {}
    start_point = (int(start["x"]), int(start["y"]))
    candidates = {
        (x, y)
        for y, row in enumerate(manifest["grid"])
        for x, cell in enumerate(row)
        if cell == "."
        and (x, y) not in fixed_anchors
        and abs(x - start_point[0]) + abs(y - start_point[1]) >= 3
    }
    if len(candidates) < len(relocatable):
        candidates = {
            (x, y)
            for y, row in enumerate(manifest["grid"])
            for x, cell in enumerate(row)
            if cell == "." and (x, y) not in fixed_anchors
        }
    if len(candidates) < len(relocatable):
        raise ChroniclesMapGenerationError(
            "generated topology has no safe cells for optional encounters"
        )

    placed: list[tuple[str, int, int]] = []
    for enemy in relocatable:
        enemy_id = str(enemy.get("id") or "")
        point = min(
            candidates,
            key=lambda candidate: (
                hashlib.sha256(
                    (
                        f"chronicles-content-placement-v{CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION}:"
                        f"{map_code}:{enemy_id}:{candidate[0]}:{candidate[1]}"
                    ).encode("utf-8")
                ).digest(),
                candidate[1],
                candidate[0],
            ),
        )
        candidates.remove(point)
        enemy["x"], enemy["y"] = point
        placed.append((enemy_id, point[0], point[1]))

    placements = tuple(placed)
    return placements, _content_placement_revision(
        map_code,
        placements,
        content_placement_version=content_placement_version,
    )


def _materialize_recipe(
    composed_manifest: dict[str, Any],
    recipe: ChroniclesMapCode,
    *,
    content_placement_version: int = 0,
) -> tuple[
    dict[str, Any],
    str,
    str,
    tuple[tuple[str, int, int], ...],
    str | None,
    tuple[int, int] | None,
]:
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

    for anchor in sorted(
        _anchor_positions(
            composed_manifest,
            content_placement_version=content_placement_version,
        ),
        key=lambda point: (point[1], point[0]),
    ):
        _connect_anchor(grid, open_cells, anchor, map_code)

    for (x, y), marker in _base_marker_positions(
        composed_manifest,
        include_exit=content_placement_version < CHRONICLES_EXIT_PLACEMENT_VERSION,
    ).items():
        grid[y][x] = marker

    start = composed_manifest["partyStart"]
    grid[int(start["y"])][int(start["x"])] = "P"
    exit_position = _place_seeded_exit(
        composed_manifest,
        grid,
        map_code,
        content_placement_version=content_placement_version,
    )
    if exit_position is not None:
        grid[exit_position[1]][exit_position[0]] = "X"
    final_grid = ["".join(row) for row in grid]

    generated = deepcopy(composed_manifest)
    generated["grid"] = final_grid
    placements, placement_revision = _place_seeded_optional_enemies(
        generated,
        map_code,
        content_placement_version=content_placement_version,
    )
    if content_placement_version >= CHRONICLES_EXIT_PLACEMENT_VERSION:
        placement_revision = _content_placement_revision(
            map_code,
            placements,
            content_placement_version=content_placement_version,
            exit_position=exit_position,
        )
    return (
        generated,
        map_code,
        _layout_revision(map_code, final_grid),
        placements,
        placement_revision,
        exit_position,
    )


def proceduralize_chronicles_manifest(
    manifest: dict[str, Any],
    seed: int,
    *,
    planner_proposal: Any = None,
    content_placement_version: int = 0,
) -> ChroniclesProceduralManifest:
    # Authored story dungeons and settlements keep their exact rooms, puzzle
    # anchors, doors and traps. Unmarked historical maps stay seeded.
    if manifest.get("layoutMode") == "authored":
        authored = deepcopy(manifest)
        # Authored regions may exceed procedural MapCode dimensions.
        # Their identity is not a generated dungeon recipe.
        map_code = f"authored-layout-v1:{authored['id']}:{authored['version']}"
        layout_revision = _layout_revision(map_code, authored["grid"])
        authored["generation"] = {
            "kind": "authored-layout",
            "mapCode": map_code,
            "generatorVersion": CHRONICLES_MAP_GENERATOR_VERSION,
            "layoutRevision": layout_revision,
        }
        return ChroniclesProceduralManifest(
            manifest=authored,
            map_code=map_code,
            generator_version=CHRONICLES_MAP_GENERATOR_VERSION,
            layout_revision=layout_revision,
        )

    module_variation = apply_chronicles_seeded_modules(manifest, seed)
    composition = apply_chronicles_seeded_composition(
        module_variation.manifest,
        seed,
    )
    treasure_variation = apply_chronicles_seeded_treasure_boons(
        composition.manifest,
        seed,
    )
    composed_manifest = treasure_variation.manifest
    base_recipe = chronicles_map_code_for_manifest(composed_manifest, seed)
    planner = resolve_chronicles_planner_recipe(base_recipe, planner_proposal)

    (
        local_generated,
        local_map_code,
        local_layout_revision,
        local_placements,
        local_placement_revision,
        local_exit_position,
    ) = _materialize_recipe(
        composed_manifest,
        base_recipe,
        content_placement_version=content_placement_version,
    )
    local_quality = evaluate_chronicles_topology(local_generated)
    if not local_quality.accepted:
        detail = ",".join(local_quality.reasons) or "unknown"
        raise ChroniclesMapGenerationError(
            f"local Chronicles topology failed quality gate: {detail}"
        )

    generated = local_generated
    map_code = local_map_code
    layout_revision = local_layout_revision
    quality = local_quality
    planner_quality_fallback = False
    planner_quality_reasons: tuple[str, ...] = ()
    planner_applied = False
    planner_reason = planner.reason
    placements = local_placements
    placement_revision = local_placement_revision
    exit_position = local_exit_position

    if planner.accepted:
        (
            planned_generated,
            planned_map_code,
            planned_layout_revision,
            planned_placements,
            planned_placement_revision,
            planned_exit_position,
        ) = _materialize_recipe(
            composed_manifest,
            planner.recipe,
            content_placement_version=content_placement_version,
        )
        planned_quality = evaluate_chronicles_topology(planned_generated)
        regressions = compare_chronicles_topology(planned_quality, local_quality)
        if regressions:
            planner_quality_fallback = True
            planner_quality_reasons = regressions
            planner_reason = "quality-rejected"
        else:
            generated = planned_generated
            map_code = planned_map_code
            layout_revision = planned_layout_revision
            quality = planned_quality
            planner_applied = True
            placements = planned_placements
            placement_revision = planned_placement_revision
            exit_position = planned_exit_position

    generated["generation"] = {
        "kind": "seeded-layout",
        "mapCode": map_code,
        "generatorVersion": CHRONICLES_MAP_GENERATOR_VERSION,
        "layoutRevision": layout_revision,
        "topologyQualityVersion": CHRONICLES_TOPOLOGY_QUALITY_VERSION,
        "topologyQuality": quality.as_dict(),
        "topologyBaselineQuality": local_quality.as_dict(),
        "plannerContractVersion": CHRONICLES_PLANNER_CONTRACT_VERSION,
        "plannerAccepted": planner_applied,
        "plannerSource": planner.source,
        "plannerProposalRevision": planner.proposal_revision,
        "plannerReason": planner_reason,
        "plannerQualityFallback": planner_quality_fallback,
        "plannerQualityRejectedReasons": list(planner_quality_reasons),
        "moduleVariationVersion": CHRONICLES_MODULE_VARIATION_VERSION,
        "moduleVariationRevision": module_variation.plan.revision,
        "activeProceduralModuleIds": list(module_variation.plan.active_module_ids),
        "omittedProceduralModuleIds": list(module_variation.plan.omitted_module_ids),
        "compositionVersion": CHRONICLES_COMPOSITION_VERSION,
        "compositionRevision": composition.plan.revision,
        "activeOptionalEnemyIds": list(composition.plan.active_optional_enemy_ids),
        "omittedOptionalEnemyIds": list(composition.plan.omitted_optional_enemy_ids),
        "protectedOptionalEnemyIds": list(composition.plan.protected_optional_enemy_ids),
        "treasureVariationVersion": CHRONICLES_TREASURE_VARIATION_VERSION,
        "treasureVariationRevision": treasure_variation.plan.revision,
        "treasureBoons": [boon.as_dict() for boon in treasure_variation.plan.boons],
    }
    if content_placement_version >= CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION:
        generated["generation"].update({
            "contentPlacementVersion": content_placement_version,
            "contentPlacementRevision": placement_revision,
            "relocatedOptionalEnemies": [
                {"id": enemy_id, "x": x, "y": y}
                for enemy_id, x, y in placements
            ],
        })
    if content_placement_version >= CHRONICLES_EXIT_PLACEMENT_VERSION:
        generated["generation"]["exitPosition"] = {
            "x": exit_position[0],
            "y": exit_position[1],
        }

    return ChroniclesProceduralManifest(
        manifest=generated,
        map_code=map_code,
        generator_version=CHRONICLES_MAP_GENERATOR_VERSION,
        layout_revision=generated["generation"]["layoutRevision"],
    )
