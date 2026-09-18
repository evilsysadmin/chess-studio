from copy import deepcopy
from pathlib import Path

import chronicles_api
from chronicles_content_variation import (
    CHRONICLES_COMPOSITION_VERSION,
    apply_chronicles_seeded_composition,
    chronicles_optional_enemy_is_variable,
    chronicles_seeded_composition_plan,
)


def _map_ids():
    root = Path(__file__).with_name("chronicles_maps")
    return sorted(path.stem for path in root.glob("*.json"))


def _enemy_ids(manifest):
    return {enemy["id"] for enemy in manifest.get("enemies", [])}


def test_all_mandatory_enemies_survive_every_seed_and_plans_are_reproducible():
    saw_variable_optional = False
    saw_omission = False
    saw_inclusion = False

    for map_id in _map_ids():
        base, _revision = chronicles_api.load_chronicles_manifest(map_id)
        mandatory = {
            enemy["id"]
            for enemy in base.get("enemies", [])
            if enemy.get("optional") is not True
        }
        variable = {
            enemy["id"]
            for enemy in base.get("enemies", [])
            if chronicles_optional_enemy_is_variable(base, enemy)
        }
        saw_variable_optional = saw_variable_optional or bool(variable)

        for seed in range(64):
            left = apply_chronicles_seeded_composition(base, seed)
            right = apply_chronicles_seeded_composition(base, seed)

            assert left == right
            assert mandatory <= _enemy_ids(left.manifest)
            assert not (set(left.plan.omitted_optional_enemy_ids) & mandatory)
            assert left.plan.revision == right.plan.revision
            assert len(left.plan.revision) == 64
            assert left.plan.active_optional_enemy_ids == tuple(sorted(left.plan.active_optional_enemy_ids))
            assert left.plan.omitted_optional_enemy_ids == tuple(sorted(left.plan.omitted_optional_enemy_ids))
            assert left.plan.protected_optional_enemy_ids == tuple(sorted(left.plan.protected_optional_enemy_ids))

            if left.plan.omitted_optional_enemy_ids:
                saw_omission = True
            if left.plan.active_optional_enemy_ids:
                saw_inclusion = True

    assert saw_variable_optional
    assert saw_omission
    assert saw_inclusion


def test_hp_reference_protects_even_an_explicitly_optional_enemy():
    manifest = {
        "id": "dependency-test",
        "enemies": [
            {
                "id": "optional-guard",
                "optional": True,
                "hpKey": "optionalGuardHp",
                "onDefeat": {"effects": [{"type": "grant-item", "itemId": "token"}]},
            }
        ],
        "exits": [
            {
                "id": "exit",
                "requirements": [{"key": "optionalGuardHp", "lte": 0}],
                "action": {"effects": []},
            }
        ],
    }

    enemy = manifest["enemies"][0]
    assert chronicles_optional_enemy_is_variable(manifest, enemy) is False
    plan = chronicles_seeded_composition_plan(manifest, 7)
    assert plan.protected_optional_enemy_ids == ("optional-guard",)
    assert plan.omitted_optional_enemy_ids == ()


def test_structural_defeat_effect_protects_optional_enemy():
    manifest = {
        "id": "structural-test",
        "enemies": [
            {
                "id": "optional-switch",
                "optional": True,
                "hpKey": "optionalSwitchHp",
                "onDefeat": {
                    "effects": [
                        {"type": "set", "key": "bridgeOpen", "value": True},
                    ]
                },
            }
        ],
    }

    enemy = manifest["enemies"][0]
    assert chronicles_optional_enemy_is_variable(manifest, enemy) is False


def test_safe_reward_only_optional_enemy_can_vary_without_mutating_source():
    manifest = {
        "id": "reward-test",
        "enemies": [
            {
                "id": "mandatory",
                "hpKey": "mandatoryHp",
            },
            {
                "id": "optional-loot",
                "optional": True,
                "hpKey": "optionalLootHp",
                "onDefeat": {
                    "effects": [
                        {
                            "type": "grant-item",
                            "itemId": "trinket",
                            "name": "Trinket",
                            "quantity": 1,
                        }
                    ]
                },
            },
        ],
    }
    original = deepcopy(manifest)

    outcomes = {
        tuple(enemy["id"] for enemy in apply_chronicles_seeded_composition(manifest, seed).manifest["enemies"])
        for seed in range(64)
    }

    assert manifest == original
    assert ("mandatory",) in outcomes
    assert ("mandatory", "optional-loot") in outcomes
    assert CHRONICLES_COMPOSITION_VERSION == 1
