"""Main-story geometry is independent of seeds, while existing maps are not relabeled."""
from copy import deepcopy
import pytest
from chronicles_map_generator import ChroniclesMapGenerationError
from chronicles_manifest_procedural import proceduralize_chronicles_manifest

def test_main_story_dungeon_authored_layout_keeps_all_anchors():
    original = {
        "id": "story-catacomb", "version": 2, "title": "Fixed catacomb",
        "regionKind": "dungeon", "dungeonRole": "main",
        "layoutMode": "authored",
        "grid": ["#########", "#...#...#", "#...#...#", "#.......#",
                 "#...#...#", "#...#...#", "#########"],
        "partyStart": {"x": 1, "y": 5, "direction": 1},
        "enemies": [], "treasures": [],
        "interactables": [{"id": "lever", "kind": "lever", "x": 6, "y": 5}],
        "triggers": [{"id": "trigger", "x": 5, "y": 3}],
        "traps": [{"id": "trap", "x": 2, "y": 3}],
        "exits": [{"id": "exit", "x": 7, "y": 1}],
    }
    pristine = deepcopy(original)
    results = [proceduralize_chronicles_manifest(original, seed)
               for seed in (0, 1, 417, 2_147_483_647)]
    for result in results:
        for key in ("grid", "partyStart", "interactables", "triggers", "traps", "exits"):
            assert result.manifest[key] == original[key]
        assert result.manifest["generation"]["kind"] == "authored-layout"
    assert len({r.layout_revision for r in results}) == 1
    assert len({r.map_code for r in results}) == 1
    assert original == pristine


def test_misconfigured_main_story_dungeon_fails_closed():
    manifest = {
        "id": "bad-story-map", "version": 1,
        "regionKind": "dungeon", "dungeonRole": "main",
        "grid": ["#####", "#...#", "#.P.#", "#..X#", "#####"],
        "partyStart": {"x": 2, "y": 2, "direction": 1},
    }
    for invalid in (None, "procedural"):
        candidate = deepcopy(manifest)
        if invalid is not None:
            candidate["layoutMode"] = invalid
        with pytest.raises(ChroniclesMapGenerationError, match="main-story dungeons require layoutMode=authored"):
            proceduralize_chronicles_manifest(candidate, 417)


def test_legacy_and_sidequest_roles_remain_allowed_without_authored_layout():
    from chronicles_manifest_procedural import proceduralize_chronicles_manifest
    from pathlib import Path
    import json
    path = Path(__file__).with_name("chronicles_maps") / "crypt-eight-squares.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    for role in (None, "sidequest", "free"):
        candidate = deepcopy(manifest)
        if role is not None:
            candidate["dungeonRole"] = role
        result = proceduralize_chronicles_manifest(candidate, 417)
        assert result.manifest["generation"]["kind"] != "authored-layout"
