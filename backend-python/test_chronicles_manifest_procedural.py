from collections import deque
from copy import deepcopy
from pathlib import Path

import chronicles_api
from chronicles_manifest_procedural import (
    CHRONICLES_CONTENT_PLACEMENT_VERSION,
    CHRONICLES_DUNGEON_TOPOLOGY_VERSION,
    CHRONICLES_EXIT_PLACEMENT_VERSION,
    CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION,
    chronicles_map_code_for_manifest,
    proceduralize_chronicles_manifest,
)
from chronicles_map_code import parse_chronicles_map_code


CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _reachable(grid, start):
    queue = deque([start])
    seen = {start}
    while queue:
        x, y = queue.popleft()
        for dx, dy in CARDINAL:
            px, py = x + dx, y + dy
            if not (0 <= py < len(grid) and 0 <= px < len(grid[0])):
                continue
            if grid[py][px] == "#" or (px, py) in seen:
                continue
            seen.add((px, py))
            queue.append((px, py))
    return seen


def _marker_positions(grid):
    return {
        (x, y): cell
        for y, row in enumerate(grid)
        for x, cell in enumerate(row)
        if cell not in {"#", "."}
    }


def _distances(grid, start):
    queue = deque([start])
    distances = {start: 0}
    while queue:
        x, y = queue.popleft()
        for dx, dy in CARDINAL:
            point = (x + dx, y + dy)
            px, py = point
            if not (0 <= py < len(grid) and 0 <= px < len(grid[0])):
                continue
            if grid[py][px] == "#" or point in distances:
                continue
            distances[point] = distances[(x, y)] + 1
            queue.append(point)
    return distances


def test_seeded_manifest_is_deterministic_and_changes_with_seed():
    base, _revision = chronicles_api.load_chronicles_manifest("crypt-eight-squares")

    first = proceduralize_chronicles_manifest(base, 417)
    repeated = proceduralize_chronicles_manifest(base, 417)
    other = proceduralize_chronicles_manifest(base, 418)

    assert first == repeated
    assert first.manifest["grid"] != other.manifest["grid"]
    assert first.map_code != other.map_code
    assert len(first.layout_revision) == 64
    assert parse_chronicles_map_code(first.map_code).seed == 417


def test_all_shipped_manifests_keep_semantics_and_become_connected_seeded_layouts():
    root = Path(__file__).with_name("chronicles_maps")
    map_ids = sorted(path.stem for path in root.glob("*.json"))

    assert map_ids
    for map_id in map_ids:
        base, _revision = chronicles_api.load_chronicles_manifest(map_id)
        original_markers = _marker_positions(base["grid"])

        for seed in (0, 1, 417, 2_147_483_647):
            generated = proceduralize_chronicles_manifest(base, seed)
            manifest = generated.manifest
            validated = chronicles_api._validate_manifest(
                manifest,
                expected_map_id=map_id,
            )

            assert validated["id"] == base["id"]
            assert validated["version"] == base["version"]
            assert validated["partyStart"] == base["partyStart"]
            mandatory_enemy_ids = {
                enemy["id"]
                for enemy in base.get("enemies", [])
                if enemy.get("optional") is not True
                and not enemy.get("proceduralModule")
            }
            generated_enemy_ids = {enemy["id"] for enemy in validated.get("enemies", [])}
            assert mandatory_enemy_ids <= generated_enemy_ids
            assert generated_enemy_ids <= {enemy["id"] for enemy in base.get("enemies", [])}
            omitted_modules = set(manifest["generation"]["omittedProceduralModuleIds"])
            active_modules = set(manifest["generation"]["activeProceduralModuleIds"])
            assert omitted_modules.isdisjoint(active_modules)

            for group in ("triggers", "interactables", "traps", "exits"):
                authored_entries = {entry["id"]: entry for entry in base.get(group, [])}
                generated_entries = {entry["id"]: entry for entry in validated.get(group, [])}
                assert generated_entries.keys() <= authored_entries.keys()
                for entry_id, authored in authored_entries.items():
                    module_id = authored.get("proceduralModule")
                    if module_id in omitted_modules:
                        assert entry_id not in generated_entries
                    else:
                        assert generated_entries.get(entry_id) == authored

            authored_treasures = {entry["id"]: entry for entry in base.get("treasures", [])}
            generated_treasures = {entry["id"]: entry for entry in validated.get("treasures", [])}
            assert generated_treasures.keys() <= authored_treasures.keys()
            for treasure_id, authored in authored_treasures.items():
                module_id = authored.get("proceduralModule")
                if module_id in omitted_modules:
                    assert treasure_id not in generated_treasures
                    continue
                assert treasure_id in generated_treasures
                generated_treasure = deepcopy(generated_treasures[treasure_id])
                authored_effects = (authored.get("action") or {}).get("effects") or []
                generated_effects = (generated_treasure.get("action") or {}).get("effects") or []
                assert generated_effects[:len(authored_effects)] == authored_effects
                assert len(generated_effects) <= len(authored_effects) + 1
                if generated_treasure.get("action") is not None:
                    generated_treasure["action"]["effects"] = deepcopy(authored_effects)
                assert generated_treasure == authored

            assert len(manifest["grid"]) == len(base["grid"])
            assert all(
                len(row) == len(base["grid"][0])
                for row in manifest["grid"]
            )
            assert _marker_positions(manifest["grid"]) == original_markers

            start = (
                manifest["partyStart"]["x"],
                manifest["partyStart"]["y"],
            )
            reachable = _reachable(manifest["grid"], start)
            open_cells = {
                (x, y)
                for y, row in enumerate(manifest["grid"])
                for x, cell in enumerate(row)
                if cell != "#"
            }
            assert reachable == open_cells
            assert manifest["generation"]["mapCode"] == generated.map_code
            assert manifest["generation"]["generatorVersion"] == generated.generator_version
            assert manifest["generation"]["layoutRevision"] == generated.layout_revision
            assert manifest["generation"]["moduleVariationVersion"] == 1
            assert len(manifest["generation"]["moduleVariationRevision"]) == 64
            assert manifest["generation"]["compositionVersion"] == 1
            assert len(manifest["generation"]["compositionRevision"]) == 64
            assert set(manifest["generation"]["omittedOptionalEnemyIds"]).isdisjoint(mandatory_enemy_ids)
            assert manifest["generation"]["treasureVariationVersion"] == 1
            assert len(manifest["generation"]["treasureVariationRevision"]) == 64
            assert len(manifest["generation"]["treasureBoons"]) <= 1


def test_dungeon_topology_v0_keeps_legacy_layout_exactly():
    base, _revision = chronicles_api.load_chronicles_manifest("crypt-eight-squares")
    legacy = proceduralize_chronicles_manifest(
        base, 417,
        content_placement_version=CHRONICLES_CONTENT_PLACEMENT_VERSION,
    )
    v0 = proceduralize_chronicles_manifest(
        base, 417,
        content_placement_version=CHRONICLES_CONTENT_PLACEMENT_VERSION,
        dungeon_level=4,
        dungeon_topology_version=0,
    )

    assert v0 == legacy
    assert "dungeonTopologyVersion" not in v0.manifest["generation"]



def test_explicit_procedural_difficulty_is_stable_across_enemy_rpg_storage_changes():
    base, _revision = chronicles_api.load_chronicles_manifest("crypt-eight-squares")
    assert base["proceduralDifficulty"] == 2

    baseline = proceduralize_chronicles_manifest(base, 417)
    migrated_storage = deepcopy(base)
    for enemy in migrated_storage["enemies"]:
        enemy["maxHp"] = 1

    changed = proceduralize_chronicles_manifest(migrated_storage, 417)

    assert parse_chronicles_map_code(baseline.map_code).difficulty == 2
    assert changed.map_code == baseline.map_code
    assert changed.manifest["grid"] == baseline.manifest["grid"]


def test_manifest_recipe_is_bounded_and_derived_from_authored_contract():
    base, _revision = chronicles_api.load_chronicles_manifest("echo-cistern")
    recipe = chronicles_map_code_for_manifest(base, 99)

    assert recipe.theme == "water"
    assert recipe.size == (13, 10)
    assert "sluice" in recipe.verbs
    assert "guardian" in recipe.verbs
    assert recipe.enemies == len(base["enemies"])
    assert recipe.treasures == len(base["treasures"])
    assert recipe.seed == 99



def test_content_placement_v1_moves_only_safe_optional_encounters_and_keeps_authored_exit():
    base, _revision = chronicles_api.load_chronicles_manifest("black-glass-chapel")
    authored_positions = {
        enemy["id"]: (enemy["x"], enemy["y"])
        for enemy in base["enemies"]
    }
    seen_mirror_positions = set()
    saw_mirror = False

    for seed in range(96):
        generated = proceduralize_chronicles_manifest(
            base,
            seed,
            content_placement_version=CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION,
        )
        repeated = proceduralize_chronicles_manifest(
            base,
            seed,
            content_placement_version=CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION,
        )
        assert generated == repeated

        manifest = generated.manifest
        generation = manifest["generation"]
        assert generation["contentPlacementVersion"] == CHRONICLES_OPTIONAL_ENEMY_PLACEMENT_VERSION
        assert len(generation["contentPlacementRevision"]) == 64
        assert "exitPosition" not in generation
        assert [
            (x, y)
            for y, row in enumerate(manifest["grid"])
            for x, cell in enumerate(row)
            if cell == "X"
        ] == [
            (x, y)
            for y, row in enumerate(base["grid"])
            for x, cell in enumerate(row)
            if cell == "X"
        ]

        # Structural encounters keep their authored coordinates.
        for enemy_id in ("glass-deacon", "obsidian-spider", "reflection-hound"):
            enemy = next(entry for entry in manifest["enemies"] if entry["id"] == enemy_id)
            assert (enemy["x"], enemy["y"]) == authored_positions[enemy_id]

        mirror = next(
            (entry for entry in manifest["enemies"] if entry["id"] == "mirror-wisp"),
            None,
        )
        if mirror is None:
            continue

        saw_mirror = True
        position = (mirror["x"], mirror["y"])
        seen_mirror_positions.add(position)
        assert manifest["grid"][position[1]][position[0]] != "#"
        assert position != (
            manifest["partyStart"]["x"],
            manifest["partyStart"]["y"],
        )
        other_enemy_positions = {
            (enemy["x"], enemy["y"])
            for enemy in manifest["enemies"]
            if enemy["id"] != "mirror-wisp"
        }
        assert position not in other_enemy_positions

        placement = next(
            entry
            for entry in generation["relocatedOptionalEnemies"]
            if entry["id"] == "mirror-wisp"
        )
        assert (placement["x"], placement["y"]) == position

    assert saw_mirror
    assert len(seen_mirror_positions) > 1


def test_content_placement_v0_is_bit_for_bit_legacy_compatible():
    base, _revision = chronicles_api.load_chronicles_manifest("black-glass-chapel")

    implicit_legacy = proceduralize_chronicles_manifest(base, 417)
    explicit_legacy = proceduralize_chronicles_manifest(
        base,
        417,
        content_placement_version=0,
    )

    assert explicit_legacy == implicit_legacy
    assert "contentPlacementVersion" not in explicit_legacy.manifest["generation"]
    assert "contentPlacementRevision" not in explicit_legacy.manifest["generation"]
    assert "relocatedOptionalEnemies" not in explicit_legacy.manifest["generation"]



def test_content_placement_v2_places_one_distant_safe_exit_on_every_shipped_map():
    root = Path(__file__).with_name("chronicles_maps")
    map_ids = sorted(path.stem for path in root.glob("*.json"))

    assert CHRONICLES_CONTENT_PLACEMENT_VERSION == CHRONICLES_EXIT_PLACEMENT_VERSION == 2
    for map_id in map_ids:
        base, _revision = chronicles_api.load_chronicles_manifest(map_id)
        layout_revisions = set()
        for seed in (0, 1, 2, 17, 417):
            generated = proceduralize_chronicles_manifest(
                base,
                seed,
                content_placement_version=CHRONICLES_EXIT_PLACEMENT_VERSION,
            )
            repeated = proceduralize_chronicles_manifest(
                base,
                seed,
                content_placement_version=CHRONICLES_EXIT_PLACEMENT_VERSION,
            )
            assert generated == repeated

            manifest = generated.manifest
            generation = manifest["generation"]
            layout_revisions.add(generated.layout_revision)
            exits = [
                (x, y)
                for y, row in enumerate(manifest["grid"])
                for x, cell in enumerate(row)
                if cell == "X"
            ]
            assert len(exits) == 1
            exit_position = exits[0]
            assert generation["contentPlacementVersion"] == 2
            assert generation["exitPosition"] == {
                "x": exit_position[0],
                "y": exit_position[1],
            }
            assert len(generation["contentPlacementRevision"]) == 64

            start = (
                manifest["partyStart"]["x"],
                manifest["partyStart"]["y"],
            )
            distances = _distances(manifest["grid"], start)
            assert exit_position in distances
            assert distances[exit_position] >= 4

            occupied = {
                (enemy["x"], enemy["y"])
                for enemy in manifest.get("enemies", [])
            }
            occupied.update(
                (entry["x"], entry["y"])
                for group in ("triggers", "interactables", "treasures", "traps")
                for entry in manifest.get(group, [])
                if "x" in entry and "y" in entry
            )
            assert exit_position not in occupied
            assert generation["topologyQuality"]["accepted"] is True
            assert generation["topologyQuality"]["unreachableAnchorCount"] == 0

        assert len(layout_revisions) > 1, f"{map_id} collapsed seeded layouts"


def test_content_placement_v2_exit_varies_across_seeds():
    base, _revision = chronicles_api.load_chronicles_manifest("black-glass-chapel")
    positions = set()

    for seed in range(64):
        generated = proceduralize_chronicles_manifest(
            base,
            seed,
            content_placement_version=CHRONICLES_EXIT_PLACEMENT_VERSION,
        )
        exit_position = generated.manifest["generation"]["exitPosition"]
        positions.add((exit_position["x"], exit_position["y"]))

    assert len(positions) > 1
