from collections import deque
from copy import deepcopy
from pathlib import Path

import chronicles_api
from chronicles_manifest_procedural import (
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
            }
            generated_enemy_ids = {enemy["id"] for enemy in validated.get("enemies", [])}
            assert mandatory_enemy_ids <= generated_enemy_ids
            assert generated_enemy_ids <= {enemy["id"] for enemy in base.get("enemies", [])}
            for group in ("triggers", "interactables", "traps", "exits"):
                assert validated.get(group, []) == base.get(group, [])

            authored_treasures = {entry["id"]: entry for entry in base.get("treasures", [])}
            generated_treasures = {entry["id"]: entry for entry in validated.get("treasures", [])}
            assert generated_treasures.keys() == authored_treasures.keys()
            for treasure_id, authored in authored_treasures.items():
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
            assert manifest["generation"]["compositionVersion"] == 1
            assert len(manifest["generation"]["compositionRevision"]) == 64
            assert set(manifest["generation"]["omittedOptionalEnemyIds"]).isdisjoint(mandatory_enemy_ids)
            assert manifest["generation"]["treasureVariationVersion"] == 1
            assert len(manifest["generation"]["treasureVariationRevision"]) == 64
            assert len(manifest["generation"]["treasureBoons"]) <= 1


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
