"""Deterministic topology quality gate for Chronicles procedural areas."""
from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any


CHRONICLES_TOPOLOGY_QUALITY_VERSION = 1
_MIN_EXIT_DISTANCE = 4
_MIN_OPEN_RATIO = 0.25
_MAX_DEAD_END_RATIO = 0.50
_MAX_ARTICULATION_RATIO = 0.65
_CARDINAL = ((1, 0), (-1, 0), (0, 1), (0, -1))
_CONTENT_GROUPS = ("triggers", "interactables", "treasures", "traps", "exits")


@dataclass(frozen=True, slots=True)
class ChroniclesTopologyQuality:
    accepted: bool
    reasons: tuple[str, ...]
    walkable_count: int
    reachable_count: int
    exit_count: int
    min_exit_distance: int | None
    max_exit_distance: int | None
    open_ratio: float
    dead_end_count: int
    dead_end_ratio: float
    articulation_count: int
    articulation_ratio: float
    critical_anchor_count: int
    unreachable_anchor_count: int

    def as_dict(self) -> dict[str, Any]:
        return {
            "version": CHRONICLES_TOPOLOGY_QUALITY_VERSION,
            "accepted": self.accepted,
            "reasons": list(self.reasons),
            "walkableCount": self.walkable_count,
            "reachableCount": self.reachable_count,
            "exitCount": self.exit_count,
            "minExitDistance": self.min_exit_distance,
            "maxExitDistance": self.max_exit_distance,
            "openRatio": round(self.open_ratio, 4),
            "deadEndCount": self.dead_end_count,
            "deadEndRatio": round(self.dead_end_ratio, 4),
            "articulationCount": self.articulation_count,
            "articulationRatio": round(self.articulation_ratio, 4),
            "criticalAnchorCount": self.critical_anchor_count,
            "unreachableAnchorCount": self.unreachable_anchor_count,
        }


def _point(entry: Any) -> tuple[int, int] | None:
    if not isinstance(entry, dict):
        return None
    x = entry.get("x")
    y = entry.get("y")
    if (
        not isinstance(x, int)
        or isinstance(x, bool)
        or not isinstance(y, int)
        or isinstance(y, bool)
    ):
        return None
    return (x, y)


def _tile_positions(grid: list[str], tile: str) -> set[tuple[int, int]]:
    return {
        (x, y)
        for y, row in enumerate(grid)
        for x, cell in enumerate(row)
        if cell == tile
    }


def _entry_positions(grid: list[str], entry: Any) -> set[tuple[int, int]]:
    point = _point(entry)
    if point is not None:
        return {point}
    tile = entry.get("tile") if isinstance(entry, dict) else None
    if isinstance(tile, str) and len(tile) == 1:
        return _tile_positions(grid, tile)
    return set()


def _walkable(grid: list[str]) -> set[tuple[int, int]]:
    return {
        (x, y)
        for y, row in enumerate(grid)
        for x, cell in enumerate(row)
        if cell != "#"
    }


def _neighbors(
    point: tuple[int, int],
    walkable: set[tuple[int, int]],
) -> tuple[tuple[int, int], ...]:
    x, y = point
    return tuple(
        (x + dx, y + dy)
        for dx, dy in _CARDINAL
        if (x + dx, y + dy) in walkable
    )


def _distances(
    walkable: set[tuple[int, int]],
    start: tuple[int, int],
) -> dict[tuple[int, int], int]:
    if start not in walkable:
        return {}
    queue = deque([start])
    distances = {start: 0}
    while queue:
        point = queue.popleft()
        for neighbor in _neighbors(point, walkable):
            if neighbor in distances:
                continue
            distances[neighbor] = distances[point] + 1
            queue.append(neighbor)
    return distances


def _articulation_points(
    walkable: set[tuple[int, int]],
) -> set[tuple[int, int]]:
    if not walkable:
        return set()

    discovery: dict[tuple[int, int], int] = {}
    low: dict[tuple[int, int], int] = {}
    parent: dict[tuple[int, int], tuple[int, int] | None] = {}
    result: set[tuple[int, int]] = set()
    clock = 0

    def visit(point: tuple[int, int]) -> None:
        nonlocal clock
        clock += 1
        discovery[point] = clock
        low[point] = clock
        children = 0

        for neighbor in _neighbors(point, walkable):
            if neighbor not in discovery:
                parent[neighbor] = point
                children += 1
                visit(neighbor)
                low[point] = min(low[point], low[neighbor])
                if parent.get(point) is None and children > 1:
                    result.add(point)
                if (
                    parent.get(point) is not None
                    and low[neighbor] >= discovery[point]
                ):
                    result.add(point)
            elif neighbor != parent.get(point):
                low[point] = min(low[point], discovery[neighbor])

    for point in sorted(walkable, key=lambda item: (item[1], item[0])):
        if point in discovery:
            continue
        parent[point] = None
        visit(point)
    return result


def _critical_anchors(
    manifest: dict[str, Any],
    grid: list[str],
) -> set[tuple[int, int]]:
    anchors: set[tuple[int, int]] = set()
    start = _point(manifest.get("partyStart"))
    if start is not None:
        anchors.add(start)

    for enemy in manifest.get("enemies", []):
        point = _point(enemy)
        if point is not None:
            anchors.add(point)
        ai = enemy.get("ai") if isinstance(enemy, dict) else None
        if isinstance(ai, dict):
            for route_point in ai.get("patrolRoute", []):
                point = _point(route_point)
                if point is not None:
                    anchors.add(point)
        positions = enemy.get("positions") if isinstance(enemy, dict) else None
        if isinstance(positions, dict):
            for raw_point in positions.values():
                point = _point(raw_point)
                if point is not None:
                    anchors.add(point)

    for group in _CONTENT_GROUPS:
        for entry in manifest.get(group, []):
            anchors.update(_entry_positions(grid, entry))
    return anchors


def evaluate_chronicles_topology(
    manifest: dict[str, Any],
) -> ChroniclesTopologyQuality:
    raw_grid = manifest.get("grid")
    if (
        not isinstance(raw_grid, list)
        or not raw_grid
        or not all(isinstance(row, str) and row for row in raw_grid)
        or any(len(row) != len(raw_grid[0]) for row in raw_grid)
    ):
        return ChroniclesTopologyQuality(
            False, ("invalid-grid",), 0, 0, 0, None, None,
            0.0, 0, 0.0, 0, 0.0, 0, 0,
        )

    grid = list(raw_grid)
    width = len(grid[0])
    height = len(grid)
    walkable = _walkable(grid)
    start = _point(manifest.get("partyStart"))
    reasons: list[str] = []

    if start is None or start not in walkable:
        reasons.append("invalid-party-start")
        distances: dict[tuple[int, int], int] = {}
    else:
        distances = _distances(walkable, start)

    if len(distances) != len(walkable):
        reasons.append("disconnected-walkable-cells")

    exits: set[tuple[int, int]] = set()
    for entry in manifest.get("exits", []):
        exits.update(_entry_positions(grid, entry))
    if not exits:
        reasons.append("missing-exit")

    exit_distances = [
        distances[position]
        for position in exits
        if position in distances
    ]
    if exits and len(exit_distances) != len(exits):
        reasons.append("unreachable-exit")
    min_exit_distance = min(exit_distances) if exit_distances else None
    max_exit_distance = max(exit_distances) if exit_distances else None
    if min_exit_distance is not None and min_exit_distance < _MIN_EXIT_DISTANCE:
        reasons.append("exit-too-close")

    anchors = _critical_anchors(manifest, grid)
    unreachable_anchors = {point for point in anchors if point not in distances}
    if unreachable_anchors:
        reasons.append("unreachable-critical-anchor")

    enemy_positions = {
        point
        for enemy in manifest.get("enemies", [])
        if (point := _point(enemy)) is not None
    }
    if start is not None and start in enemy_positions:
        reasons.append("enemy-overlaps-party")
    if enemy_positions & exits:
        reasons.append("enemy-overlaps-exit")

    interior = max(1, (width - 2) * (height - 2))
    open_ratio = len(walkable) / interior
    if open_ratio < _MIN_OPEN_RATIO:
        reasons.append("open-ratio-low")

    dead_ends = {
        point
        for point in walkable
        if len(_neighbors(point, walkable)) <= 1
    }
    dead_end_ratio = len(dead_ends) / max(1, len(walkable))
    if dead_end_ratio > _MAX_DEAD_END_RATIO:
        reasons.append("dead-end-ratio-high")

    articulations = _articulation_points(walkable)
    articulation_ratio = len(articulations) / max(1, len(walkable))
    if articulation_ratio > _MAX_ARTICULATION_RATIO:
        reasons.append("articulation-ratio-high")

    return ChroniclesTopologyQuality(
        accepted=not reasons,
        reasons=tuple(reasons),
        walkable_count=len(walkable),
        reachable_count=len(distances),
        exit_count=len(exits),
        min_exit_distance=min_exit_distance,
        max_exit_distance=max_exit_distance,
        open_ratio=open_ratio,
        dead_end_count=len(dead_ends),
        dead_end_ratio=dead_end_ratio,
        articulation_count=len(articulations),
        articulation_ratio=articulation_ratio,
        critical_anchor_count=len(anchors),
        unreachable_anchor_count=len(unreachable_anchors),
    )
