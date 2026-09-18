from collections import defaultdict

import chronicles_api


EXPECTED_MODULES = {
    "menagerie-of-ash": {
        "ash-vault-route": {
            "ember-wisp",
            "ember-scorchmarks",
            "ash-wall-seam",
            "ash-secret-door",
            "ember-cache",
        }
    },
    "chain-basilica": {
        "black-glass-route": {
            "black-glass-oculus",
            "resonant-seam",
            "black-glass-secret-door",
            "oculus-cache",
        }
    },
}


def _entries(manifest):
    for enemy in manifest.get("enemies", []):
        yield "enemy", enemy
    for group in ("triggers", "interactables", "treasures", "traps", "exits"):
        for entry in manifest.get(group, []):
            yield group, entry


def _transition_targets(entry):
    return {
        effect.get("mapId")
        for effect in (entry.get("action") or {}).get("effects", [])
        if effect.get("type") == "transition-map" and effect.get("mapId")
    }


def test_secret_route_modules_are_explicit_complete_and_lateral():
    for map_id, expected_modules in EXPECTED_MODULES.items():
        manifest, _revision = chronicles_api.load_chronicles_manifest(map_id)
        actual = defaultdict(set)
        tagged_entries = defaultdict(list)

        for group, entry in _entries(manifest):
            module_id = entry.get("proceduralModule")
            if not module_id:
                continue
            actual[module_id].add(entry["id"])
            tagged_entries[module_id].append((group, entry))

        assert dict(actual) == expected_modules

        main_targets = {
            target
            for exit_entry in manifest.get("exits", [])
            for target in _transition_targets(exit_entry)
        }
        assert main_targets

        for module_id, entries in tagged_entries.items():
            secret_doors = [
                entry
                for _group, entry in entries
                if entry.get("kind") == "secret-door"
            ]
            assert len(secret_doors) == 1, module_id

            secret_targets = _transition_targets(secret_doors[0])
            assert len(secret_targets) == 1
            assert secret_targets.isdisjoint(main_targets)


def test_no_unreviewed_secret_door_exists_outside_a_procedural_module():
    for map_id in chronicles_api.chronicles_shipped_map_ids():
        manifest, _revision = chronicles_api.load_chronicles_manifest(map_id)
        for _group, entry in _entries(manifest):
            if entry.get("kind") == "secret-door":
                assert entry.get("proceduralModule"), f"{map_id}:{entry['id']}"
