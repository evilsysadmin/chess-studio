#!/usr/bin/env python3
"""Reject Pawn Slug stages with intersecting or practically unreachable surfaces.

The gate derives jump tuning from the real player.gd constants, models the
coyote-time jump window, starts traversal from the authored spawn floor segment,
and requires every floor segment and platform to remain reachable with margin.
"""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import sys
from dataclasses import dataclass
from itertools import combinations

ROOT = pathlib.Path(__file__).resolve().parents[1]
GODOT_ROOT = ROOT / "games" / "pawn-slug-godot"
MAPS_ROOT = GODOT_ROOT / "maps"
PLAYER_SCRIPT = GODOT_ROOT / "scripts" / "player.gd"

REACH_SAFETY = 0.90
COYOTE_SAMPLES = 40
EPSILON = 1e-6
LADDER_Y_TOLERANCE = 24.0
LADDER_X_TOLERANCE = 42.0


@dataclass(frozen=True)
class Movement:
    move_speed: float
    jump_speed: float
    gravity: float
    coyote_time: float


@dataclass(frozen=True)
class Surface:
    key: str
    label: str
    x: float
    y: float
    w: float
    h: float = 1.0

    @property
    def end_x(self) -> float:
        return self.x + self.w


def _constant(source: str, name: str) -> float:
    match = re.search(
        rf"^const\s+{re.escape(name)}\s*:=\s*([0-9]+(?:\.[0-9]+)?)\s*$",
        source,
        re.MULTILINE,
    )
    if match is None:
        raise ValueError(f"missing numeric player constant {name}")
    return float(match.group(1))


def load_movement() -> Movement:
    source = PLAYER_SCRIPT.read_text(encoding="utf-8")
    return Movement(
        move_speed=_constant(source, "MOVE_SPEED"),
        jump_speed=_constant(source, "JUMP_SPEED"),
        gravity=_constant(source, "GRAVITY"),
        coyote_time=_constant(source, "COYOTE_TIME"),
    )


def _surface_gap(left: Surface, right: Surface) -> float:
    if left.end_x < right.x:
        return right.x - left.end_x
    if right.end_x < left.x:
        return left.x - right.end_x
    return 0.0


def _max_horizontal_range(movement: Movement, rise: float) -> float:
    """Best full-speed landing range, including a legal coyote-time delay."""

    best = -1.0
    samples = max(1, COYOTE_SAMPLES)
    for index in range(samples + 1):
        delay = movement.coyote_time * float(index) / float(samples)
        # Walking off the edge before the buffered jump spends coyote time
        # falling. player.gd then replaces vertical velocity with -JUMP_SPEED.
        dropped = 0.5 * movement.gravity * delay * delay
        required_rise = rise + dropped
        discriminant = (
            movement.jump_speed * movement.jump_speed
            - 2.0 * movement.gravity * required_rise
        )
        if discriminant < 0.0:
            continue
        flight = (
            movement.jump_speed + math.sqrt(discriminant)
        ) / movement.gravity
        best = max(best, movement.move_speed * (delay + flight))
    return best


def _jump_reachable(source: Surface, target: Surface, movement: Movement) -> bool:
    max_range = _max_horizontal_range(movement, source.y - target.y)
    if max_range < 0.0:
        return False
    return _surface_gap(source, target) <= max_range * REACH_SAFETY + EPSILON


def _floor_surfaces(stage: dict) -> list[Surface]:
    world = stage["world"]
    width = float(world["width"])
    floor_y = float(world["floor_y"])
    pits = sorted(stage.get("pits", []), key=lambda pit: float(pit.get("x", 0.0)))
    surfaces: list[Surface] = []
    cursor = 0.0
    floor_index = 0
    for pit in pits:
        pit_x = float(pit["x"])
        pit_w = float(pit["w"])
        if pit_x > cursor + EPSILON:
            surfaces.append(
                Surface(
                    key=f"floor:{floor_index}",
                    label=f"floor[{floor_index}]",
                    x=cursor,
                    y=floor_y,
                    w=pit_x - cursor,
                )
            )
            floor_index += 1
        cursor = max(cursor, pit_x + pit_w)
    if cursor < width - EPSILON:
        surfaces.append(
            Surface(
                key=f"floor:{floor_index}",
                label=f"floor[{floor_index}]",
                x=cursor,
                y=floor_y,
                w=width - cursor,
            )
        )
    return surfaces


def _platform_surfaces(stage: dict) -> list[Surface]:
    result: list[Surface] = []
    for index, platform in enumerate(stage.get("platforms", [])):
        result.append(
            Surface(
                key=f"platform:{index}",
                label=(
                    f"platform[{index}]"
                    f" {platform.get('kind', 'platform')}"
                    f" @({platform.get('x')},{platform.get('y')})"
                ),
                x=float(platform["x"]),
                y=float(platform["y"]),
                w=float(platform["w"]),
                h=float(platform["h"]),
            )
        )
    return result


def _rectangles_intersect(a: Surface, b: Surface) -> bool:
    overlap_x = min(a.end_x, b.end_x) - max(a.x, b.x)
    overlap_y = min(a.y + a.h, b.y + b.h) - max(a.y, b.y)
    return overlap_x > EPSILON and overlap_y > EPSILON


def _ladder_connect(
    ladder: dict,
    reachable: set[str],
    surfaces: list[Surface],
) -> set[str]:
    ladder_x = float(ladder["x"])
    top_y = float(ladder["top_y"])
    bottom_y = float(ladder["bottom_y"])
    newly_reachable: set[str] = set()

    lower_reachable = any(
        surface.key in reachable
        and abs(surface.y - bottom_y) <= LADDER_Y_TOLERANCE
        and surface.x - LADDER_X_TOLERANCE
        <= ladder_x
        <= surface.end_x + LADDER_X_TOLERANCE
        for surface in surfaces
    )
    upper_reachable = any(
        surface.key in reachable
        and abs(surface.y - top_y) <= LADDER_Y_TOLERANCE
        and surface.x - LADDER_X_TOLERANCE
        <= ladder_x
        <= surface.end_x + LADDER_X_TOLERANCE
        for surface in surfaces
    )

    if lower_reachable:
        for surface in surfaces:
            if (
                abs(surface.y - top_y) <= LADDER_Y_TOLERANCE
                and surface.x - LADDER_X_TOLERANCE
                <= ladder_x
                <= surface.end_x + LADDER_X_TOLERANCE
            ):
                newly_reachable.add(surface.key)

    if upper_reachable:
        for surface in surfaces:
            if (
                abs(surface.y - bottom_y) <= LADDER_Y_TOLERANCE
                and surface.x - LADDER_X_TOLERANCE
                <= ladder_x
                <= surface.end_x + LADDER_X_TOLERANCE
            ):
                newly_reachable.add(surface.key)

    return newly_reachable


def validate_stage(stage: dict, movement: Movement, source_name: str) -> list[str]:
    errors: list[str] = []
    world = stage.get("world", {})
    required_world = ("width", "height", "floor_y", "start_x")
    missing_world = [key for key in required_world if key not in world]
    if missing_world:
        return [f"{source_name}: world missing {', '.join(missing_world)}"]

    width = float(world["width"])
    height = float(world["height"])
    floor_y = float(world["floor_y"])
    start_x = float(world["start_x"])

    platforms = _platform_surfaces(stage)
    for platform in platforms:
        if platform.w <= 0.0 or platform.h <= 0.0:
            errors.append(f"{source_name}: {platform.label} has non-positive size")
        if platform.x < -EPSILON or platform.end_x > width + EPSILON:
            errors.append(f"{source_name}: {platform.label} escapes world width {width:g}")
        if platform.y < -EPSILON or platform.y + platform.h > floor_y + EPSILON:
            errors.append(f"{source_name}: {platform.label} escapes traversable vertical space")
        if platform.y + platform.h > height + EPSILON:
            errors.append(f"{source_name}: {platform.label} escapes world height {height:g}")

    for left, right in combinations(platforms, 2):
        if _rectangles_intersect(left, right):
            errors.append(
                f"{source_name}: intersecting surfaces: {left.label} <-> {right.label}"
            )

    pits = stage.get("pits", [])
    for index, pit in enumerate(pits):
        pit_x = float(pit.get("x", -1.0))
        pit_w = float(pit.get("w", 0.0))
        if pit_w <= 0.0 or pit_x < 0.0 or pit_x + pit_w > width + EPSILON:
            errors.append(f"{source_name}: pit[{index}] is outside world or has invalid width")

    for left, right in combinations(
        sorted(
            [
                (float(pit.get("x", 0.0)), float(pit.get("w", 0.0)), index)
                for index, pit in enumerate(pits)
            ],
            key=lambda item: item[0],
        ),
        2,
    ):
        left_x, left_w, left_index = left
        right_x, _right_w, right_index = right
        if left_x + left_w > right_x + EPSILON:
            errors.append(
                f"{source_name}: pit[{left_index}] overlaps pit[{right_index}]"
            )

    floors = _floor_surfaces(stage)
    surfaces = floors + platforms
    start_surface = next(
        (
            surface
            for surface in floors
            if surface.x - EPSILON <= start_x <= surface.end_x + EPSILON
        ),
        None,
    )
    if start_surface is None:
        errors.append(f"{source_name}: start_x={start_x:g} is not on a floor segment")
        return errors

    reachable = {start_surface.key}
    changed = True
    while changed:
        changed = False
        for source in surfaces:
            if source.key not in reachable:
                continue
            for target in surfaces:
                if target.key in reachable or source.key == target.key:
                    continue
                if _jump_reachable(source, target, movement):
                    reachable.add(target.key)
                    changed = True

        for ladder in stage.get("ladders", []):
            ladder_targets = _ladder_connect(ladder, reachable, surfaces)
            if not ladder_targets.issubset(reachable):
                reachable.update(ladder_targets)
                changed = True

    unreachable = [surface for surface in surfaces if surface.key not in reachable]
    for surface in unreachable:
        errors.append(
            f"{source_name}: unreachable from spawn with {REACH_SAFETY:.0%} "
            f"jump-range budget: {surface.label}"
        )

    return errors


def validate_repo() -> list[str]:
    movement = load_movement()
    errors: list[str] = []
    for path in sorted(MAPS_ROOT.glob("*.json")):
        try:
            stage = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            errors.append(f"{path.relative_to(ROOT)}: invalid JSON: {exc}")
            continue
        errors.extend(
            validate_stage(stage, movement, str(path.relative_to(ROOT)))
        )
    return errors


def self_test() -> None:
    movement = Movement(
        move_speed=330.0,
        jump_speed=610.0,
        gravity=1550.0,
        coyote_time=0.10,
    )
    valid = {
        "world": {"width": 900, "height": 720, "floor_y": 610, "start_x": 80},
        "pits": [{"x": 360, "w": 180}],
        "platforms": [
            {"x": 260, "y": 510, "w": 120, "h": 20, "kind": "step"},
            {"x": 500, "y": 470, "w": 130, "h": 20, "kind": "landing"},
        ],
        "ladders": [],
    }
    assert validate_stage(valid, movement, "valid") == []

    broken = {
        "world": {"width": 900, "height": 720, "floor_y": 610, "start_x": 80},
        "pits": [],
        "platforms": [
            {"x": 220, "y": 500, "w": 180, "h": 24, "kind": "base"},
            {"x": 300, "y": 510, "w": 160, "h": 24, "kind": "overlap"},
            {"x": 650, "y": 250, "w": 120, "h": 20, "kind": "impossible"},
        ],
        "ladders": [],
    }
    messages = validate_stage(broken, movement, "broken")
    assert any("intersecting surfaces" in message for message in messages)
    assert any("unreachable from spawn" in message for message in messages)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("Pawn Slug stage geometry gate self-test: OK")
        return 0

    try:
        errors = validate_repo()
    except (OSError, ValueError) as exc:
        print(f"Pawn Slug stage geometry gate could not run: {exc}", file=sys.stderr)
        return 2

    if errors:
        print("Pawn Slug stage geometry gate: FAILED", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1

    movement = load_movement()
    map_count = len(list(MAPS_ROOT.glob("*.json")))
    print(
        "Pawn Slug stage geometry gate: OK "
        f"({map_count} maps, no platform intersections, all surfaces reachable; "
        f"movement={movement.move_speed:g}/{movement.jump_speed:g}/{movement.gravity:g}, "
        f"safety={REACH_SAFETY:.0%})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
