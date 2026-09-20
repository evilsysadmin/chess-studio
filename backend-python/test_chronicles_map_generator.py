from collections import deque

import pytest

from chronicles_map_code import ChroniclesMapCode
from chronicles_map_generator import (
    CHRONICLES_MAP_GENERATOR_VERSION,
    ChroniclesMapGenerationError,
    generate_chronicles_layout,
)


CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))


def _recipe(*, seed=417, width=13, height=10, difficulty=3):
    return ChroniclesMapCode(
        theme="water",
        width=width,
        height=height,
        verbs=("sluice", "guardian"),
        enemies=5,
        treasures=2,
        secrets=1,
        difficulty=difficulty,
        seed=seed,
    )


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


def test_generator_is_reproducible_for_the_same_map_code():
    left = generate_chronicles_layout(_recipe(seed=417))
    right = generate_chronicles_layout(left.map_code)

    assert left == right
    assert left.generator_version == CHRONICLES_MAP_GENERATOR_VERSION
    assert len(left.layout_revision) == 64
    assert left.as_dict()["mapCode"] == left.map_code


def test_different_seed_changes_the_topology():
    first = generate_chronicles_layout(_recipe(seed=417))
    second = generate_chronicles_layout(_recipe(seed=418))

    assert first.map_code != second.map_code
    assert (first.grid, first.exit_position) != (second.grid, second.exit_position)


def test_compact_maps_open_two_loop_cells_beyond_the_perfect_maze_floor():
    layout = generate_chronicles_layout(_recipe(seed=417, width=7, height=7, difficulty=5))

    # 7x7 has a 5x5 interior: the odd-cell perfect maze carves 17 cells.
    # Generator v2 deliberately opens at least two additional loop cells so
    # authored anchor repair cannot collapse adjacent seeds onto the same tree.
    assert layout.walkable_count >= 19


@pytest.mark.parametrize(
    ("width", "height"),
    [
        (7, 7),
        (13, 10),
        (19, 15),
    ],
)
@pytest.mark.parametrize("difficulty", [1, 3, 5])
def test_generated_topologies_are_connected_bounded_and_have_capacity(
    width,
    height,
    difficulty,
):
    for seed in range(24):
        layout = generate_chronicles_layout(
            _recipe(
                seed=seed,
                width=width,
                height=height,
                difficulty=difficulty,
            )
        )
        grid = layout.grid

        assert len(grid) == height
        assert all(len(row) == width for row in grid)
        assert all(cell == "#" for cell in grid[0])
        assert all(cell == "#" for cell in grid[-1])
        assert all(row[0] == "#" and row[-1] == "#" for row in grid)

        start = layout.party_start
        exit_position = layout.exit_position
        reachable = _reachable(grid, start)
        open_cells = {
            (x, y)
            for y, row in enumerate(grid)
            for x, cell in enumerate(row)
            if cell != "#"
        }

        assert reachable == open_cells
        assert exit_position in reachable
        assert grid[start[1]][start[0]] == "P"
        assert grid[exit_position[1]][exit_position[0]] == "X"
        assert layout.walkable_count == len(open_cells)
        assert layout.walkable_count >= 2 + 5 + 2 + 1 + 3


def test_generator_rejects_recipe_that_cannot_fit_declared_content():
    recipe = ChroniclesMapCode(
        theme="water",
        width=7,
        height=7,
        verbs=("sluice", "keys", "puzzle", "traps"),
        enemies=8,
        treasures=4,
        secrets=3,
        difficulty=3,
        seed=1,
    )

    with pytest.raises(
        ChroniclesMapGenerationError,
        match="walkable slots",
    ):
        generate_chronicles_layout(recipe)
