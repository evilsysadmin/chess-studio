"""Authored settlement geometry must remain immutable across expedition seeds."""
from copy import deepcopy

from chronicles_manifest_procedural import proceduralize_chronicles_manifest


def test_swordhaven_style_settlement_does_not_seed_shuffle_paths_or_content():
    authored = {
        "id": "swordhaven-square",
        "version": 1,
        "title": "Swordhaven",
        "regionKind": "settlement",
        "layoutMode": "authored",
        "grid": ["#######", "#.....#", "#.###.#", "#..P..#", "#######"],
        "partyStart": {"x": 3, "y": 3, "direction": 0},
        "enemies": [],
        "triggers": [],
        "interactables": [
            {"id": "tavern", "kind": "lore", "x": 1, "y": 1, "action": {"effects": []}}
        ],
        "treasures": [],
        "traps": [],
        "exits": [],
    }
    original = deepcopy(authored)
    for seed in (0, 1, 417, 2_147_483_647):
        result = proceduralize_chronicles_manifest(authored, seed)
        assert result.manifest["grid"] == original["grid"]
        assert result.manifest["partyStart"] == original["partyStart"]
        assert result.manifest["interactables"] == original["interactables"]
        assert result.manifest["enemies"] == []
        assert result.manifest["generation"]["kind"] == "authored-layout"
        assert result.manifest["generation"]["layoutRevision"] == result.layout_revision
        assert result.map_code
    assert authored == original
