import pytest

from chronicles_map_code import (
    CHRONICLES_MAP_CODE_MAX_SEED,
    ChroniclesMapCode,
    ChroniclesMapCodeError,
    canonicalize_chronicles_map_code,
    encode_chronicles_map_code,
    parse_chronicles_map_code,
)


def test_map_code_round_trip_is_canonical_and_shareable():
    recipe = ChroniclesMapCode(
        theme="water",
        width=13,
        height=10,
        verbs=("sluice", "guardian"),
        enemies=5,
        treasures=2,
        secrets=1,
        difficulty=3,
        seed=417,
    )

    code = encode_chronicles_map_code(recipe)

    assert code == (
        "CM1|theme=water|size=13x10|verbs=sluice,guardian|"
        "enemies=5|treasures=2|secrets=1|difficulty=3|seed=417"
    )
    assert parse_chronicles_map_code(code) == recipe
    assert parse_chronicles_map_code(code).as_dict() == {
        "version": 1,
        "theme": "water",
        "width": 13,
        "height": 10,
        "verbs": ["sluice", "guardian"],
        "enemies": 5,
        "treasures": 2,
        "secrets": 1,
        "difficulty": 3,
        "seed": 417,
    }


def test_map_code_parser_accepts_case_noise_but_normalizes_output():
    noisy = (
        "cm1|THEME=WATER|SIZE=13X10|VERBS=SLUICE,GUARDIAN|"
        "ENEMIES=5|TREASURES=2|SECRETS=1|DIFFICULTY=3|SEED=417"
    )

    assert canonicalize_chronicles_map_code(noisy) == (
        "CM1|theme=water|size=13x10|verbs=sluice,guardian|"
        "enemies=5|treasures=2|secrets=1|difficulty=3|seed=417"
    )


@pytest.mark.parametrize(
    ("code", "message"),
    [
        (
            "CM1|theme=water|size=13x10|verbs=sluice|enemies=5|"
            "treasures=2|secrets=1|difficulty=3",
            "missing MapCode field: seed",
        ),
        (
            "CM1|theme=water|size=13x10|verbs=sluice|enemies=5|"
            "treasures=2|secrets=1|difficulty=3|seed=1|seed=2",
            "duplicate MapCode field: seed",
        ),
        (
            "CM1|theme=lava|size=13x10|verbs=sluice|enemies=5|"
            "treasures=2|secrets=1|difficulty=3|seed=1",
            "unsupported theme: lava",
        ),
        (
            "CM1|theme=water|size=13x10|verbs=sluice,sluice|enemies=5|"
            "treasures=2|secrets=1|difficulty=3|seed=1",
            "verbs must be unique",
        ),
        (
            "CM1|theme=water|size=6x10|verbs=sluice|enemies=5|"
            "treasures=2|secrets=1|difficulty=3|seed=1",
            "width must be between 7 and 19",
        ),
        (
            f"CM1|theme=water|size=13x10|verbs=sluice|enemies=5|"
            f"treasures=2|secrets=1|difficulty=3|seed={CHRONICLES_MAP_CODE_MAX_SEED + 1}",
            f"seed must be between 0 and {CHRONICLES_MAP_CODE_MAX_SEED}",
        ),
        (
            "CM1|theme=water|size=13x10|verbs=teleport|enemies=5|"
            "treasures=2|secrets=1|difficulty=3|seed=1",
            "unsupported verb: teleport",
        ),
    ],
)
def test_map_code_rejects_invalid_or_ambiguous_recipes(code, message):
    with pytest.raises(ChroniclesMapCodeError, match=message):
        parse_chronicles_map_code(code)


def test_same_recipe_always_encodes_to_same_code():
    left = ChroniclesMapCode(
        theme="glass",
        width=9,
        height=7,
        verbs=("secret", "treasure"),
        enemies=4,
        treasures=1,
        secrets=1,
        difficulty=2,
        seed=CHRONICLES_MAP_CODE_MAX_SEED,
    )
    right = ChroniclesMapCode(**left.as_dict() | {"verbs": tuple(left.verbs)})

    assert encode_chronicles_map_code(left) == encode_chronicles_map_code(right)
