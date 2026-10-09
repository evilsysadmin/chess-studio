"""Main-story geometry is independent of seeds, while existing maps are not relabeled."""
from copy import deepcopy
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
