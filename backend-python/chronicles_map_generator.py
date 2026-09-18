"""Deterministic topology generator for Chronicles MapCode recipes.

The generator owns geometry only. It does not invent quests, rewards or combat
semantics yet; later assemblers can place authored/procedural content on the
walkable cells while preserving the same reproducible topology.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
import hashlib
import math

from chronicles_map_code import (
    ChroniclesMapCode,
    encode_chronicles_map_code,
    parse_chronicles_map_code,
    validate_chronicles_map_code,
)


CHRONICLES_MAP_GENERATOR_VERSION = 1
CHRONICLES_LAYOUT_RESERVED_OBJECT_SLOTS = 1

_DIFFICULTY_OPEN_RATIO = {
    1: 0.68,
    2: 0.62,
    3: 0.56,
    4: 0.50,
    5: 0.46,
}

_THEME_OPEN_BIAS = {
    "crypt": -0.02,
    "gallery": 0.05,
    "ash": -0.03,
    "archive": 0.03,
    "iron": 0.00,
    "basilica": 0.01,
    "bell": 0.00,
    "glass": 0.02,
    "water": 0.06,
}

_CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))
_MAZE_STEPS = ((2, 0), (-2, 0), (0, 2), (0, -2))


class ChroniclesMapGenerationError(ValueError):
    """Raised when a valid recipe cannot produce a safe topology."""


class _XorShift32:
    """Tiny version-stable PRNG so layout replay does not depend on random.py."""

    __slots__ = ("state",)

    def __init__(self, seed: int):
        self.state = seed & 0xFFFFFFFF
        if self.state == 0:
            self.state = 0x6D2B79F5

    def next_u32(self) -> int:
        value = self.state
        value ^= (value << 13) & 0xFFFFFFFF
        value ^= value >> 17
        value ^= (value << 5) & 0xFFFFFFFF
        self.state = value & 0xFFFFFFFF
        return self.state

    def choice(self, values):
        if not values:
            raise ChroniclesMapGenerationError("cannot choose from an empty sequence")
        return values[self.next_u32() % len(values)]


@dataclass(frozen=True, slots=True)
class ChroniclesGeneratedLayout:
    map_code: str
    generator_version: int
    grid: tuple[str, ...]
    party_start: tuple[int, int]
    exit_position: tuple[int, int]
    walkable_count: int
    layout_revision: str

    @property
    def width(self) -> int:
        return len(self.grid[0]) if self.grid else 0

    @property
    def height(self) -> int:
        return len(self.grid)

    def as_dict(self) -> dict[str, object]:
        return {
            "mapCode": self.map_code,
            "generatorVersion": self.generator_version,
            "layoutRevision": self.layout_revision,
            "grid": list(self.grid),
            "partyStart": {
                "x": self.party_start[0],
                "y": self.party_start[1],
                "direction": 1,
            },
            "exit": {
                "x": self.exit_position[0],
                "y": self.exit_position[1],
            },
            "walkableCount": self.walkable_count,
        }


def _generator_seed(map_code: str) -> int:
    material = (
        f"chronicles-layout-v{CHRONICLES_MAP_GENERATOR_VERSION}:{map_code}"
    ).encode("utf-8")
    return int.from_bytes(hashlib.sha256(material).digest()[:4], "big")


def _mechanism_slots(recipe: ChroniclesMapCode) -> int:
    slots = CHRONICLES_LAYOUT_RESERVED_OBJECT_SLOTS
    for verb in recipe.verbs:
        if verb in {"lever", "sluice", "keys", "puzzle", "traps"}:
            slots += 2
    return slots


def _required_walkable_slots(recipe: ChroniclesMapCode) -> int:
    return (
        2  # party start + exit
        + recipe.enemies
        + recipe.treasures
        + recipe.secrets
        + _mechanism_slots(recipe)
    )


def _is_open(grid: list[list[str]], x: int, y: int) -> bool:
    return grid[y][x] != "#"


def _carve_maze(recipe: ChroniclesMapCode, rng: _XorShift32) -> tuple[list[list[str]], int]:
    width, height = recipe.size
    grid = [["#"] * width for _ in range(height)]
    start = (1, 1)
    grid[start[1]][start[0]] = "."
    visited = {start}
    stack = [start]
    walkable_count = 1

    while stack:
        x, y = stack[-1]
        candidates: list[tuple[int, int, int, int]] = []
        for dx, dy in _MAZE_STEPS:
            nx, ny = x + dx, y + dy
            if not (1 <= nx < width - 1 and 1 <= ny < height - 1):
                continue
            if (nx, ny) in visited:
                continue
            candidates.append((nx, ny, dx, dy))

        if not candidates:
            stack.pop()
            continue

        nx, ny, dx, dy = rng.choice(candidates)
        connector = (x + dx // 2, y + dy // 2)
        grid[connector[1]][connector[0]] = "."
        grid[ny][nx] = "."
        visited.add((nx, ny))
        stack.append((nx, ny))
        walkable_count += 2

    return grid, walkable_count


def _target_walkable_count(recipe: ChroniclesMapCode) -> int:
    interior = (recipe.width - 2) * (recipe.height - 2)
    required = _required_walkable_slots(recipe)
    if required > interior:
        raise ChroniclesMapGenerationError(
            f"recipe needs {required} walkable slots but only {interior} fit"
        )

    ratio = _DIFFICULTY_OPEN_RATIO[recipe.difficulty] + _THEME_OPEN_BIAS.get(
        recipe.theme, 0.0
    )
    ratio = max(0.42, min(0.75, ratio))
    return min(interior, max(required, math.ceil(interior * ratio)))


def _open_extra_cells(
    grid: list[list[str]],
    walkable_count: int,
    target: int,
    rng: _XorShift32,
) -> int:
    height = len(grid)
    width = len(grid[0])

    while walkable_count < target:
        candidates: list[tuple[int, int, int]] = []
        for y in range(1, height - 1):
            for x in range(1, width - 1):
                if grid[y][x] != "#":
                    continue
                adjacent = sum(
                    1
                    for dx, dy in _CARDINAL
                    if _is_open(grid, x + dx, y + dy)
                )
                if adjacent:
                    candidates.append((x, y, adjacent))

        if not candidates:
            raise ChroniclesMapGenerationError(
                "generator could not reach required walkable capacity"
            )

        loop_candidates = [entry for entry in candidates if entry[2] >= 2]
        x, y, _adjacent = rng.choice(loop_candidates or candidates)
        grid[y][x] = "."
        walkable_count += 1

    return walkable_count


def _distances(
    grid: list[list[str]],
    start: tuple[int, int],
) -> dict[tuple[int, int], int]:
    height = len(grid)
    width = len(grid[0])
    queue = deque([start])
    distances = {start: 0}

    while queue:
        x, y = queue.popleft()
        for dx, dy in _CARDINAL:
            point = (x + dx, y + dy)
            px, py = point
            if not (0 <= px < width and 0 <= py < height):
                continue
            if grid[py][px] == "#" or point in distances:
                continue
            distances[point] = distances[(x, y)] + 1
            queue.append(point)

    return distances


def _layout_revision(map_code: str, grid: tuple[str, ...]) -> str:
    payload = (
        f"v{CHRONICLES_MAP_GENERATOR_VERSION}\0{map_code}\0"
        + "\n".join(grid)
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def generate_chronicles_layout(
    recipe_or_code: ChroniclesMapCode | str,
) -> ChroniclesGeneratedLayout:
    recipe = (
        parse_chronicles_map_code(recipe_or_code)
        if isinstance(recipe_or_code, str)
        else validate_chronicles_map_code(recipe_or_code)
    )
    map_code = encode_chronicles_map_code(recipe)
    rng = _XorShift32(_generator_seed(map_code))
    grid, walkable_count = _carve_maze(recipe, rng)
    target = _target_walkable_count(recipe)
    walkable_count = _open_extra_cells(grid, walkable_count, target, rng)

    start = (1, 1)
    distances = _distances(grid, start)
    if len(distances) != walkable_count:
        raise ChroniclesMapGenerationError("generated topology is not fully connected")

    exit_position, exit_distance = max(
        distances.items(),
        key=lambda item: (item[1], item[0][1], item[0][0]),
    )
    if exit_position == start or exit_distance < 4:
        raise ChroniclesMapGenerationError("generated exit is too close to party start")

    grid[start[1]][start[0]] = "P"
    grid[exit_position[1]][exit_position[0]] = "X"
    frozen_grid = tuple("".join(row) for row in grid)

    return ChroniclesGeneratedLayout(
        map_code=map_code,
        generator_version=CHRONICLES_MAP_GENERATOR_VERSION,
        grid=frozen_grid,
        party_start=start,
        exit_position=exit_position,
        walkable_count=walkable_count,
        layout_revision=_layout_revision(map_code, frozen_grid),
    )
