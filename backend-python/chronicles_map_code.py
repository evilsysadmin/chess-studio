"""Versioned, shareable recipe code for procedural Chronicles maps.

MapCode is intentionally a compact *intent* contract, not a serialized area
manifest. A generator (deterministic or AI-assisted) may consume the recipe,
but every produced manifest must still pass the normal Chronicles validators.
"""

from __future__ import annotations

from dataclasses import dataclass
import re


CHRONICLES_MAP_CODE_VERSION = 1
CHRONICLES_MAP_CODE_PREFIX = f"CM{CHRONICLES_MAP_CODE_VERSION}"
CHRONICLES_MAP_CODE_MAX_LENGTH = 256
CHRONICLES_MAP_CODE_MAX_SEED = 2_147_483_647

CHRONICLES_MAP_CODE_THEMES = frozenset(
    {
        "crypt",
        "gallery",
        "ash",
        "archive",
        "iron",
        "basilica",
        "bell",
        "glass",
        "water",
    }
)

CHRONICLES_MAP_CODE_VERBS = frozenset(
    {
        "hunt",
        "patrol",
        "lever",
        "sluice",
        "keys",
        "traps",
        "treasure",
        "secret",
        "guardian",
        "puzzle",
    }
)

_FIELD_ORDER = (
    "theme",
    "size",
    "verbs",
    "enemies",
    "treasures",
    "secrets",
    "difficulty",
    "seed",
)
_REQUIRED_FIELDS = frozenset(_FIELD_ORDER)
_SIZE_RE = re.compile(r"^(?P<width>\d{1,2})x(?P<height>\d{1,2})$")


class ChroniclesMapCodeError(ValueError):
    """Raised when a MapCode cannot be normalized safely."""


@dataclass(frozen=True, slots=True)
class ChroniclesMapCode:
    theme: str
    width: int
    height: int
    verbs: tuple[str, ...]
    enemies: int
    treasures: int
    secrets: int
    difficulty: int
    seed: int
    version: int = CHRONICLES_MAP_CODE_VERSION

    @property
    def size(self) -> tuple[int, int]:
        return self.width, self.height

    def as_dict(self) -> dict[str, object]:
        return {
            "version": self.version,
            "theme": self.theme,
            "width": self.width,
            "height": self.height,
            "verbs": list(self.verbs),
            "enemies": self.enemies,
            "treasures": self.treasures,
            "secrets": self.secrets,
            "difficulty": self.difficulty,
            "seed": self.seed,
        }


def _bounded_int(raw: str, *, field: str, minimum: int, maximum: int) -> int:
    if not raw.isdigit():
        raise ChroniclesMapCodeError(f"{field} must be an integer")
    value = int(raw)
    if value < minimum or value > maximum:
        raise ChroniclesMapCodeError(f"{field} must be between {minimum} and {maximum}")
    return value


def _normalize_theme(raw: str) -> str:
    theme = raw.strip().lower()
    if theme not in CHRONICLES_MAP_CODE_THEMES:
        raise ChroniclesMapCodeError(f"unsupported theme: {theme or '<empty>'}")
    return theme


def _normalize_verbs(raw: str) -> tuple[str, ...]:
    values = tuple(part.strip().lower() for part in raw.split(",") if part.strip())
    if not values:
        raise ChroniclesMapCodeError("verbs must contain at least one entry")
    if len(values) > 4:
        raise ChroniclesMapCodeError("verbs supports at most 4 entries")
    if len(set(values)) != len(values):
        raise ChroniclesMapCodeError("verbs must be unique")
    unknown = [value for value in values if value not in CHRONICLES_MAP_CODE_VERBS]
    if unknown:
        raise ChroniclesMapCodeError(f"unsupported verb: {unknown[0]}")
    return values


def validate_chronicles_map_code(recipe: ChroniclesMapCode) -> ChroniclesMapCode:
    if recipe.version != CHRONICLES_MAP_CODE_VERSION:
        raise ChroniclesMapCodeError(f"unsupported MapCode version: {recipe.version}")
    theme = _normalize_theme(recipe.theme)
    verbs = _normalize_verbs(",".join(recipe.verbs))
    width = int(recipe.width)
    height = int(recipe.height)
    enemies = int(recipe.enemies)
    treasures = int(recipe.treasures)
    secrets = int(recipe.secrets)
    difficulty = int(recipe.difficulty)
    seed = int(recipe.seed)

    if width < 7 or width > 19:
        raise ChroniclesMapCodeError("width must be between 7 and 19")
    if height < 7 or height > 15:
        raise ChroniclesMapCodeError("height must be between 7 and 15")
    if enemies < 2 or enemies > 8:
        raise ChroniclesMapCodeError("enemies must be between 2 and 8")
    if treasures < 0 or treasures > 4:
        raise ChroniclesMapCodeError("treasures must be between 0 and 4")
    if secrets < 0 or secrets > 3:
        raise ChroniclesMapCodeError("secrets must be between 0 and 3")
    if difficulty < 1 or difficulty > 5:
        raise ChroniclesMapCodeError("difficulty must be between 1 and 5")
    if seed < 0 or seed > CHRONICLES_MAP_CODE_MAX_SEED:
        raise ChroniclesMapCodeError(
            f"seed must be between 0 and {CHRONICLES_MAP_CODE_MAX_SEED}"
        )

    return ChroniclesMapCode(
        theme=theme,
        width=width,
        height=height,
        verbs=verbs,
        enemies=enemies,
        treasures=treasures,
        secrets=secrets,
        difficulty=difficulty,
        seed=seed,
    )


def encode_chronicles_map_code(recipe: ChroniclesMapCode) -> str:
    value = validate_chronicles_map_code(recipe)
    fields = {
        "theme": value.theme,
        "size": f"{value.width}x{value.height}",
        "verbs": ",".join(value.verbs),
        "enemies": str(value.enemies),
        "treasures": str(value.treasures),
        "secrets": str(value.secrets),
        "difficulty": str(value.difficulty),
        "seed": str(value.seed),
    }
    return "|".join(
        [CHRONICLES_MAP_CODE_PREFIX]
        + [f"{field}={fields[field]}" for field in _FIELD_ORDER]
    )


def parse_chronicles_map_code(raw: str) -> ChroniclesMapCode:
    if not isinstance(raw, str):
        raise ChroniclesMapCodeError("MapCode must be a string")
    code = raw.strip()
    if not code or len(code) > CHRONICLES_MAP_CODE_MAX_LENGTH:
        raise ChroniclesMapCodeError(
            f"MapCode length must be 1..{CHRONICLES_MAP_CODE_MAX_LENGTH}"
        )

    parts = code.split("|")
    if not parts or parts[0].upper() != CHRONICLES_MAP_CODE_PREFIX:
        raise ChroniclesMapCodeError(
            f"MapCode must start with {CHRONICLES_MAP_CODE_PREFIX}"
        )

    fields: dict[str, str] = {}
    for token in parts[1:]:
        if "=" not in token:
            raise ChroniclesMapCodeError("MapCode fields must use key=value")
        key, value = token.split("=", 1)
        key = key.strip().lower()
        if key not in _REQUIRED_FIELDS:
            raise ChroniclesMapCodeError(f"unknown MapCode field: {key or '<empty>'}")
        if key in fields:
            raise ChroniclesMapCodeError(f"duplicate MapCode field: {key}")
        fields[key] = value.strip()

    missing = [field for field in _FIELD_ORDER if field not in fields]
    if missing:
        raise ChroniclesMapCodeError(f"missing MapCode field: {missing[0]}")

    size_match = _SIZE_RE.fullmatch(fields["size"].lower())
    if not size_match:
        raise ChroniclesMapCodeError("size must use WIDTHxHEIGHT")

    recipe = ChroniclesMapCode(
        theme=_normalize_theme(fields["theme"]),
        width=_bounded_int(
            size_match.group("width"), field="width", minimum=7, maximum=19
        ),
        height=_bounded_int(
            size_match.group("height"), field="height", minimum=7, maximum=15
        ),
        verbs=_normalize_verbs(fields["verbs"]),
        enemies=_bounded_int(fields["enemies"], field="enemies", minimum=2, maximum=8),
        treasures=_bounded_int(
            fields["treasures"], field="treasures", minimum=0, maximum=4
        ),
        secrets=_bounded_int(fields["secrets"], field="secrets", minimum=0, maximum=3),
        difficulty=_bounded_int(
            fields["difficulty"], field="difficulty", minimum=1, maximum=5
        ),
        seed=_bounded_int(
            fields["seed"],
            field="seed",
            minimum=0,
            maximum=CHRONICLES_MAP_CODE_MAX_SEED,
        ),
    )
    return validate_chronicles_map_code(recipe)


def canonicalize_chronicles_map_code(raw: str) -> str:
    return encode_chronicles_map_code(parse_chronicles_map_code(raw))
