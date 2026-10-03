from chronicles_difficulty import (
    apply_chronicles_combat_difficulty,
    chronicles_authored_difficulty,
    chronicles_difficulty_band,
)


def test_difficulty_band_matches_bounded_frontend_policy():
    shallow = chronicles_difficulty_band(party_level=6, depth=0)
    deep = chronicles_difficulty_band(party_level=6, depth=6)
    absurd = chronicles_difficulty_band(party_level=2, depth=999)

    assert shallow == {
        "partyLevel": 6,
        "depth": 0,
        "targetLevel": 3,
        "minLevel": 2,
        "maxLevel": 4,
        "depthPressure": 0,
        "progressionPressure": 2,
    }
    assert deep["targetLevel"] == 6
    assert deep["maxLevel"] <= deep["partyLevel"] + 1
    assert absurd["depthPressure"] == 6
    assert absurd["targetLevel"] <= 3
    assert absurd["maxLevel"] <= 3


def test_low_level_party_eases_authored_encounter_without_erasing_identity():
    manifest = {
        "id": "archive",
        "proceduralDifficulty": 2,
        "enemies": [
            {
                "id": "warden",
                "maxHp": 9,
                "retaliation": 2,
                "enemyBuild": {
                    "version": 1,
                    "archetype": "warden",
                    "level": 3,
                    "attributes": {"vigor": 1},
                    "skills": ["hunter-instinct"],
                },
            }
        ],
    }

    scaled, difficulty = apply_chronicles_combat_difficulty(
        manifest,
        party_level=1,
        depth=0,
    )

    assert chronicles_authored_difficulty(manifest) == 2
    assert difficulty["targetLevel"] == 1
    assert difficulty["appliedDelta"] == -1
    assert scaled["enemies"][0]["maxHp"] == 8
    assert scaled["enemies"][0]["retaliation"] == 1
    assert scaled["enemies"][0]["enemyBuild"]["level"] == 2
    assert scaled["enemies"][0]["enemyBuild"]["skills"] == ["hunter-instinct"]
    assert manifest["enemies"][0]["maxHp"] == 9


def test_high_level_deep_party_scales_slowly_and_caps_delta():
    manifest = {
        "id": "archive",
        "proceduralDifficulty": 2,
        "enemies": [
            {"id": "warden", "maxHp": 9, "retaliation": 2},
        ],
    }

    scaled, difficulty = apply_chronicles_combat_difficulty(
        manifest,
        party_level=12,
        depth=99,
    )

    assert difficulty["targetLevel"] == 12
    assert difficulty["requestedDelta"] == 10
    assert difficulty["appliedDelta"] == 3
    assert scaled["enemies"][0]["maxHp"] == 12
    assert scaled["enemies"][0]["retaliation"] == 3
    assert scaled["enemies"][0]["difficultyLevel"] == 5
