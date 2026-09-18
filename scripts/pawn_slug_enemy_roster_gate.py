#!/usr/bin/env python3
"""Validate Pawn Slug enemy roster composition and bounded density."""
from __future__ import annotations

import collections
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAIN = ROOT / "games/pawn-slug-godot/scripts/main.gd"

MIN_ENEMIES = 28
MAX_ENEMIES = 32
MIN_GAP = 55.0
DENSITY_WINDOW = 600.0
MAX_IN_WINDOW = 6
REQUIRED_BASE_TYPES = {"pawn", "knight", "rook", "bishop"}
REQUIRED_VARIANTS = {"scout", "shield", "grenadier", "commando", "queen"}
MAX_GRENADIERS = 3

SPAWN_BLOCK_RE = re.compile(r"const ENEMY_SPAWNS\s*:=\s*\[(?P<body>.*?)\n\]", re.S)
SPAWN_RE = re.compile(r"\[(?P<x>\d+(?:\.\d+)?),\s*\"(?P<type>[a-z0-9_-]+)\"\]")
TYPE_BLOCK_RE = re.compile(r"const ENEMY_TYPES\s*:=\s*\{(?P<body>.*?)\n\}", re.S)
TYPE_RE = re.compile(
    r'^\s*"(?P<type>[a-z0-9_-]+)"\s*:\s*\{'
    r'"hp":\s*(?P<hp>\d+),\s*'
    r'"speed":\s*(?P<speed>\d+(?:\.\d+)?),\s*'
    r'"width":\s*(?P<width>\d+(?:\.\d+)?),\s*'
    r'"height":\s*(?P<height>\d+(?:\.\d+)?),\s*'
    r'"standoff":\s*(?P<standoff>\d+(?:\.\d+)?)'
    r'\},?\s*$',
    re.M,
)

class GateError(RuntimeError):
    pass

def parse_roster(text: str) -> tuple[list[tuple[float, str]], dict[str, dict[str, float]]]:
    spawn_block = SPAWN_BLOCK_RE.search(text)
    type_block = TYPE_BLOCK_RE.search(text)
    if not spawn_block or not type_block:
        raise GateError("ENEMY_SPAWNS/ENEMY_TYPES contract missing")
    spawns = [(float(m.group("x")), m.group("type")) for m in SPAWN_RE.finditer(spawn_block.group("body"))]
    stats: dict[str, dict[str, float]] = {}
    for m in TYPE_RE.finditer(type_block.group("body")):
        stats[m.group("type")] = {
            "hp": float(m.group("hp")),
            "speed": float(m.group("speed")),
            "width": float(m.group("width")),
            "height": float(m.group("height")),
            "standoff": float(m.group("standoff")),
        }
    if not spawns:
        raise GateError("enemy roster contains no spawns")
    if not stats:
        raise GateError("enemy roster contains no type stats")
    return spawns, stats

def validate(spawns: list[tuple[float, str]], stats: dict[str, dict[str, float]]) -> list[str]:
    errors: list[str] = []
    count = len(spawns)
    if not MIN_ENEMIES <= count <= MAX_ENEMIES:
        errors.append(f"enemy count {count} outside [{MIN_ENEMIES}, {MAX_ENEMIES}]")

    xs = [x for x, _ in spawns]
    if xs != sorted(xs):
        errors.append("enemy spawn positions must stay ordered")
    for previous, current in zip(xs, xs[1:]):
        gap = current - previous
        if gap < MIN_GAP:
            errors.append(f"enemy spawn gap {gap:.1f}px below {MIN_GAP:.0f}px near x={current:.0f}")
            break

    for index, start_x in enumerate(xs):
        in_window = sum(1 for x in xs[index:] if 0.0 <= x - start_x <= DENSITY_WINDOW)
        if in_window > MAX_IN_WINDOW:
            errors.append(
                f"enemy density {in_window} within {DENSITY_WINDOW:.0f}px starting at x={start_x:.0f}; max {MAX_IN_WINDOW}"
            )
            break

    counts = collections.Counter(kind for _x, kind in spawns)
    spawn_types = set(counts)
    missing_base = sorted(REQUIRED_BASE_TYPES - spawn_types)
    missing_variants = sorted(REQUIRED_VARIANTS - spawn_types)
    if missing_base:
        errors.append("missing base enemy types: " + ", ".join(missing_base))
    if missing_variants:
        errors.append("missing visual enemy variants: " + ", ".join(missing_variants))

    undefined = sorted(spawn_types - stats.keys())
    if undefined:
        errors.append("spawn types missing ENEMY_TYPES stats: " + ", ".join(undefined))
    unused = sorted(stats.keys() - spawn_types)
    if unused:
        errors.append("ENEMY_TYPES entries never spawned: " + ", ".join(unused))

    if counts["grenadier"] > MAX_GRENADIERS:
        errors.append(f"grenadier count {counts['grenadier']} exceeds {MAX_GRENADIERS}")
    first_grenadier = min((x for x, kind in spawns if kind == "grenadier"), default=999999.0)
    if first_grenadier < 1200.0:
        errors.append(f"first grenadier at x={first_grenadier:.0f} is too early")

    for kind, values in sorted(stats.items()):
        hp, speed = values["hp"], values["speed"]
        width, height, standoff = values["width"], values["height"], values["standoff"]
        if not 1 <= hp <= 350:
            errors.append(f"{kind}: hp {hp:g} outside 1..350")
        if not 0 <= speed <= 120:
            errors.append(f"{kind}: speed {speed:g} outside 0..120")
        if not 35 <= width <= 100:
            errors.append(f"{kind}: width {width:g} outside 35..100")
        if not 55 <= height <= 140:
            errors.append(f"{kind}: height {height:g} outside 55..140")
        if not 140 <= standoff <= 650:
            errors.append(f"{kind}: standoff {standoff:g} outside 140..650")
    return errors

def self_test() -> None:
    stats = {
        "pawn": {"hp": 34.0, "speed": 54.0, "width": 45.0, "height": 73.0, "standoff": 270.0},
        "knight": {"hp": 62.0, "speed": 92.0, "width": 57.0, "height": 80.0, "standoff": 225.0},
        "rook": {"hp": 112.0, "speed": 0.0, "width": 68.0, "height": 90.0, "standoff": 420.0},
        "bishop": {"hp": 310.0, "speed": 42.0, "width": 90.0, "height": 128.0, "standoff": 430.0},
        "scout": {"hp": 46.0, "speed": 84.0, "width": 48.0, "height": 76.0, "standoff": 245.0},
        "shield": {"hp": 168.0, "speed": 32.0, "width": 72.0, "height": 94.0, "standoff": 255.0},
        "grenadier": {"hp": 82.0, "speed": 50.0, "width": 54.0, "height": 82.0, "standoff": 470.0},
        "commando": {"hp": 78.0, "speed": 76.0, "width": 58.0, "height": 84.0, "standoff": 300.0},
        "queen": {"hp": 156.0, "speed": 74.0, "width": 62.0, "height": 96.0, "standoff": 345.0},
    }
    kinds = ["pawn", "scout", "pawn", "knight", "shield", "pawn", "rook", "pawn", "grenadier", "bishop",
             "knight", "pawn", "rook", "grenadier", "commando", "knight", "pawn", "queen", "bishop",
             "pawn", "rook", "knight", "pawn", "grenadier", "pawn", "rook", "knight", "pawn"]
    sample = [(620.0 + index * 120.0, kind) for index, kind in enumerate(kinds)]
    assert validate(sample, stats) == []
    crowded = sample[:]
    crowded[1] = (650.0, crowded[1][1])
    assert any("gap" in error for error in validate(crowded, stats))
    no_queen = [(x, "pawn" if kind == "queen" else kind) for x, kind in sample]
    assert any("missing visual enemy variants" in error for error in validate(no_queen, stats))
    print("OK Pawn Slug enemy roster gate self-test")

def main() -> int:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-test":
            self_test()
            return 0
        spawns, stats = parse_roster(MAIN.read_text(encoding="utf-8"))
        errors = validate(spawns, stats)
        if errors:
            raise GateError("\n".join(errors))
        counts = collections.Counter(kind for _x, kind in spawns)
        variants = sum(counts[kind] for kind in REQUIRED_VARIANTS)
        print(f"OK Pawn Slug enemy roster: {len(spawns)} enemies, {variants} variants, {dict(sorted(counts.items()))}")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
