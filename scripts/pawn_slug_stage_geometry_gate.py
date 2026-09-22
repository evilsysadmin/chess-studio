#!/usr/bin/env python3
"""Fail Pawn Slug maps with overlapping or practically unreachable surfaces."""

from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
from itertools import combinations

ROOT = pathlib.Path(__file__).resolve().parents[1]
GODOT = ROOT / "games" / "pawn-slug-godot"
MAPS = GODOT / "maps"
PLAYER = GODOT / "scripts" / "player.gd"

SAFETY = 0.90
COYOTE_SAMPLES = 40
EPS = 1e-6
LADDER_X_PAD = 42.0
LADDER_Y_PAD = 24.0


def player_tuning() -> tuple[float, float, float, float]:
    source = PLAYER.read_text(encoding="utf-8")

    def value(name: str) -> float:
        match = re.search(
            rf"^const\s+{name}\s*:=\s*([0-9]+(?:\.[0-9]+)?)\s*$",
            source,
            re.MULTILINE,
        )
        if match is None:
            raise RuntimeError(f"missing numeric player constant {name}")
        return float(match.group(1))

    return (
        value("MOVE_SPEED"),
        value("JUMP_SPEED"),
        value("GRAVITY"),
        value("COYOTE_TIME"),
    )


def platform_surfaces(stage: dict) -> list[dict]:
    surfaces = []
    for index, item in enumerate(stage.get("platforms", [])):
        surfaces.append(
            {
                "id": f"p{index}",
                "label": (
                    f"platform[{index}] {item.get('kind', 'platform')} "
                    f"@({item.get('x')},{item.get('y')})"
                ),
                "x": float(item["x"]),
                "y": float(item["y"]),
                "w": float(item["w"]),
                "h": float(item["h"]),
            }
        )
    return surfaces


def floor_surfaces(stage: dict) -> list[dict]:
    width = float(stage["world"]["width"])
    floor_y = float(stage["world"]["floor_y"])
    pits = sorted(stage.get("pits", []), key=lambda item: float(item["x"]))
    result = []
    cursor = 0.0
    index = 0
    for pit in pits:
        pit_x = float(pit["x"])
        if pit_x > cursor + EPS:
            result.append(
                {
                    "id": f"f{index}",
                    "label": f"floor[{index}]",
                    "x": cursor,
                    "y": floor_y,
                    "w": pit_x - cursor,
                    "h": 1.0,
                }
            )
            index += 1
        cursor = max(cursor, pit_x + float(pit["w"]))
    if cursor < width - EPS:
        result.append(
            {
                "id": f"f{index}",
                "label": f"floor[{index}]",
                "x": cursor,
                "y": floor_y,
                "w": width - cursor,
                "h": 1.0,
            }
        )
    return result


def gap(a: dict, b: dict) -> float:
    a_end = a["x"] + a["w"]
    b_end = b["x"] + b["w"]
    if a_end < b["x"]:
        return b["x"] - a_end
    if b_end < a["x"]:
        return a["x"] - b_end
    return 0.0


def jump_range(source_y: float, target_y: float, tuning: tuple[float, ...]) -> float:
    move_speed, jump_speed, gravity, coyote = tuning
    best = -1.0
    for sample in range(COYOTE_SAMPLES + 1):
        delay = coyote * sample / COYOTE_SAMPLES
        dropped = 0.5 * gravity * delay * delay
        rise = source_y + dropped - target_y
        discriminant = jump_speed * jump_speed - 2.0 * gravity * rise
        if discriminant < 0.0:
            continue
        flight = (jump_speed + math.sqrt(discriminant)) / gravity
        best = max(best, move_speed * (delay + flight))
    return best


def overlaps(a: dict, b: dict) -> bool:
    overlap_x = min(a["x"] + a["w"], b["x"] + b["w"]) - max(a["x"], b["x"])
    overlap_y = min(a["y"] + a["h"], b["y"] + b["h"]) - max(a["y"], b["y"])
    return overlap_x > EPS and overlap_y > EPS


def ladder_targets(stage: dict, nodes: list[dict], reachable: set[str]) -> set[str]:
    extra: set[str] = set()
    for ladder in stage.get("ladders", []):
        x = float(ladder["x"])
        top = float(ladder["top_y"])
        bottom = float(ladder["bottom_y"])

        def near(surface: dict, y: float) -> bool:
            return (
                abs(surface["y"] - y) <= LADDER_Y_PAD
                and surface["x"] - LADDER_X_PAD
                <= x
                <= surface["x"] + surface["w"] + LADDER_X_PAD
            )

        lower = any(item["id"] in reachable and near(item, bottom) for item in nodes)
        upper = any(item["id"] in reachable and near(item, top) for item in nodes)
        if lower:
            extra.update(item["id"] for item in nodes if near(item, top))
        if upper:
            extra.update(item["id"] for item in nodes if near(item, bottom))
    return extra


def validate(stage: dict, name: str, tuning: tuple[float, ...]) -> list[str]:
    errors: list[str] = []
    world = stage["world"]
    width = float(world["width"])
    height = float(world["height"])
    floor_y = float(world["floor_y"])
    start_x = float(world["start_x"])
    platforms = platform_surfaces(stage)

    for item in platforms:
        if item["w"] <= 0.0 or item["h"] <= 0.0:
            errors.append(f"{name}: {item['label']} has invalid size")
        if item["x"] < 0.0 or item["x"] + item["w"] > width + EPS:
            errors.append(f"{name}: {item['label']} escapes world width")
        if item["y"] < 0.0 or item["y"] + item["h"] > min(height, floor_y) + EPS:
            errors.append(f"{name}: {item['label']} escapes traversable height")

    for left, right in combinations(platforms, 2):
        if overlaps(left, right):
            errors.append(f"{name}: overlapping surfaces: {left['label']} <-> {right['label']}")

    pits = sorted(stage.get("pits", []), key=lambda item: float(item["x"]))
    for index, pit in enumerate(pits):
        x = float(pit["x"])
        w = float(pit["w"])
        if x < 0.0 or w <= 0.0 or x + w > width + EPS:
            errors.append(f"{name}: pit[{index}] is outside the world")
    for left, right in zip(pits, pits[1:]):
        if float(left["x"]) + float(left["w"]) > float(right["x"]) + EPS:
            errors.append(f"{name}: pits overlap")

    floors = floor_surfaces(stage)
    nodes = floors + platforms
    start = next(
        (
            item
            for item in floors
            if item["x"] - EPS <= start_x <= item["x"] + item["w"] + EPS
        ),
        None,
    )
    if start is None:
        errors.append(f"{name}: start_x={start_x:g} is not on floor")
        return errors

    reachable = {start["id"]}
    changed = True
    while changed:
        changed = False
        for source in nodes:
            if source["id"] not in reachable:
                continue
            for target in nodes:
                if target["id"] in reachable or target["id"] == source["id"]:
                    continue
                max_gap = jump_range(source["y"], target["y"], tuning)
                if max_gap >= 0.0 and gap(source, target) <= max_gap * SAFETY + EPS:
                    reachable.add(target["id"])
                    changed = True

        extra = ladder_targets(stage, nodes, reachable) - reachable
        if extra:
            reachable.update(extra)
            changed = True

    for item in nodes:
        if item["id"] not in reachable:
            errors.append(
                f"{name}: unreachable from spawn with {SAFETY:.0%} jump budget: "
                f"{item['label']}"
            )
    return errors


def self_test() -> None:
    tuning = (330.0, 610.0, 1550.0, 0.10)
    broken = {
        "world": {"width": 900, "height": 720, "floor_y": 610, "start_x": 80},
        "pits": [],
        "ladders": [],
        "platforms": [
            {"x": 220, "y": 500, "w": 180, "h": 24, "kind": "base"},
            {"x": 300, "y": 510, "w": 160, "h": 24, "kind": "overlap"},
            {"x": 650, "y": 250, "w": 120, "h": 20, "kind": "impossible"},
        ],
    }
    messages = validate(broken, "self-test", tuning)
    assert any("overlapping surfaces" in message for message in messages)
    assert any("unreachable from spawn" in message for message in messages)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        print("Pawn Slug stage geometry gate self-test: OK")
        return 0

    tuning = player_tuning()
    errors = []
    paths = sorted(MAPS.glob("*.json"))
    for path in paths:
        stage = json.loads(path.read_text(encoding="utf-8"))
        errors.extend(validate(stage, str(path.relative_to(ROOT)), tuning))

    if errors:
        print("Pawn Slug stage geometry gate: FAILED")
        for message in errors:
            print(f"- {message}")
        return 1

    print(
        f"Pawn Slug stage geometry gate: OK ({len(paths)} maps, "
        f"all surfaces reachable, no overlaps, safety={SAFETY:.0%})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
