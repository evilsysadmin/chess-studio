#!/usr/bin/env python3
"""Validate Pawn Slug stage manifests, roster composition and traversal density."""
from __future__ import annotations

import collections
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
MAIN = ROOT / "games/pawn-slug-godot/scripts/main.gd"
MAP_ROOT = ROOT / "games/pawn-slug-godot/maps"

MIN_ENEMIES = 28
MAX_ENEMIES = 32
MIN_GAP = 55.0
DENSITY_WINDOW = 600.0
MAX_IN_WINDOW = 6
MIN_PLATFORMS = 15
MIN_LADDERS = 2
MIN_PITS = 1
MIN_OBSTACLES = 6
ALLOWED_LADDER_STYLES = {"steel", "rope", "wood"}
MIN_PIT_WIDTH = 72.0
MAX_PIT_WIDTH = 180.0
ALLOWED_OBSTACLE_KINDS = {"barrels", "barricade", "bollards", "bunker_block", "cargo_crates", "container_stack", "crate", "crate_stack", "fallen_log", "rockfall", "root_mass", "sandbags", "stone_ruin"}
REQUIRED_BASE_TYPES = {"pawn", "knight", "rook", "bishop"}
REQUIRED_VARIANTS = {"scout", "shield", "grenadier", "commando", "queen"}
MAX_GRENADIERS = 3
ALLOWED_SETPIECES = {"moving_platform", "bunker_turret", "reinforcement_wave", "convoy", "collapse_bridge", "waterfall", "tunnel_portal", "destructible_barricade", "destructible_platform", "artillery_barrage"}
REQUIRED_SETPIECE_TYPES = {"moving_platform", "bunker_turret", "reinforcement_wave", "convoy", "destructible_platform", "artillery_barrage"}
ALLOWED_DRESSING_KINDS = {"crate", "barrel", "sandbags"}
MIN_DRESSING = 10
ALLOWED_STORY_PROP_KINDS = {"front_wreck", "harbor_lamp", "harbor_bollard", "alpine_tripod", "snowbank", "jungle_tree", "fallen_trunk", "jungle_hut", "jungle_ruin_pillar", "jungle_brazier", "jungle_fern_cluster", "industrial_bunker", "industrial_watch_post", "industrial_drain", "industrial_rubble_field"}
MIN_STORY_PROPS = 5

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

def parse_stats(text: str) -> dict[str, dict[str, float]]:
    type_block = TYPE_BLOCK_RE.search(text)
    if not type_block:
        raise GateError("ENEMY_TYPES contract missing")
    stats: dict[str, dict[str, float]] = {}
    for m in TYPE_RE.finditer(type_block.group("body")):
        stats[m.group("type")] = {
            "hp": float(m.group("hp")),
            "speed": float(m.group("speed")),
            "width": float(m.group("width")),
            "height": float(m.group("height")),
            "standoff": float(m.group("standoff")),
        }
    if not stats:
        raise GateError("enemy type stats are empty")
    return stats

def load_stage(path: pathlib.Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise GateError(f"{path.name}: stage root must be an object")
    return data

def _rect_errors(stage_name: str, label: str, rects: list[dict], width: float, height: float) -> list[str]:
    errors: list[str] = []
    for index, rect in enumerate(rects):
        try:
            x = float(rect["x"]); y = float(rect["y"])
            w = float(rect["w"]); h = float(rect["h"])
        except Exception:
            errors.append(f"{stage_name}: {label}[{index}] has invalid rectangle fields")
            continue
        if w <= 0 or h <= 0:
            errors.append(f"{stage_name}: {label}[{index}] has non-positive size")
        if x < 0 or x + w > width:
            errors.append(f"{stage_name}: {label}[{index}] escapes horizontal world bounds")
        if y < 0 or y + h > height:
            errors.append(f"{stage_name}: {label}[{index}] escapes vertical world bounds")
    return errors

def validate_stage(stage: dict, stats: dict[str, dict[str, float]], stage_name: str) -> list[str]:
    errors: list[str] = []
    world = stage.get("world") or {}
    width = float(world.get("width", 0))
    height = float(world.get("height", 0))
    floor_y = float(world.get("floor_y", 0))
    start_x = float(world.get("start_x", -1))
    if width < 1280 or height < 600:
        errors.append(f"{stage_name}: world bounds too small")
    if not 0 < floor_y < height:
        errors.append(f"{stage_name}: floor_y outside world")
    if not 0 <= start_x < width:
        errors.append(f"{stage_name}: start_x outside world")

    platforms = stage.get("platforms") or []
    ladders = stage.get("ladders") or []
    pits = stage.get("pits") or []
    obstacles = stage.get("obstacles") or []
    dressing = stage.get("dressing") or []
    story_props = stage.get("story_props") or []
    if len(platforms) < MIN_PLATFORMS:
        errors.append(f"{stage_name}: platform count {len(platforms)} < {MIN_PLATFORMS}")
    if len(ladders) < MIN_LADDERS:
        errors.append(f"{stage_name}: ladder count {len(ladders)} < {MIN_LADDERS}")
    if len(pits) < MIN_PITS:
        errors.append(f"{stage_name}: pit count {len(pits)} < {MIN_PITS}")
    if len(obstacles) < MIN_OBSTACLES:
        errors.append(f"{stage_name}: obstacle count {len(obstacles)} < {MIN_OBSTACLES}")
    errors += _rect_errors(stage_name, "platforms", platforms, width, height)
    errors += _rect_errors(stage_name, "ladders", ladders, width, height)
    errors += _rect_errors(stage_name, "obstacles", obstacles, width, height)

    for index, ladder in enumerate(ladders):
        if not isinstance(ladder, dict):
            continue
        style = str(ladder.get("style", "steel"))
        ladder_w = float(ladder.get("w", 0))
        ladder_y = float(ladder.get("y", 0))
        ladder_h = float(ladder.get("h", 0))
        if style not in ALLOWED_LADDER_STYLES:
            errors.append(f"{stage_name}: ladders[{index}] has unsupported style {style!r}")
        if not 24.0 <= ladder_w <= 72.0:
            errors.append(f"{stage_name}: ladders[{index}] width {ladder_w:g} outside 24..72")
        if abs((ladder_y + ladder_h) - floor_y) > 4.0:
            errors.append(f"{stage_name}: ladders[{index}] must reach the authored floor")

    pit_ranges: list[tuple[float, float]] = []
    previous_pit_end = -1.0
    for index, pit in enumerate(pits):
        if not isinstance(pit, dict):
            errors.append(f"{stage_name}: pits[{index}] must be an object")
            continue
        try:
            pit_x = float(pit["x"])
            pit_w = float(pit["w"])
        except Exception:
            errors.append(f"{stage_name}: pits[{index}] has invalid x/w")
            continue
        pit_end = pit_x + pit_w
        if pit_x < 0 or pit_end > width:
            errors.append(f"{stage_name}: pits[{index}] escapes horizontal world bounds")
        if not MIN_PIT_WIDTH <= pit_w <= MAX_PIT_WIDTH:
            errors.append(
                f"{stage_name}: pits[{index}] width {pit_w:g} outside "
                f"{MIN_PIT_WIDTH:g}..{MAX_PIT_WIDTH:g}"
            )
        if pit_x < previous_pit_end:
            errors.append(f"{stage_name}: pits must be ordered and non-overlapping")
        previous_pit_end = max(previous_pit_end, pit_end)
        pit_ranges.append((pit_x, pit_end))

    for index, obstacle in enumerate(obstacles):
        if not isinstance(obstacle, dict):
            continue
        kind = str(obstacle.get("kind", ""))
        if kind not in ALLOWED_OBSTACLE_KINDS:
            errors.append(f"{stage_name}: obstacles[{index}] has unsupported kind {kind!r}")

    if len(dressing) < MIN_DRESSING:
        errors.append(f"{stage_name}: dressing count {len(dressing)} < {MIN_DRESSING}")
    for index, prop in enumerate(dressing):
        if not isinstance(prop, dict):
            errors.append(f"{stage_name}: dressing[{index}] must be an object")
            continue
        kind = str(prop.get("kind", ""))
        x = float(prop.get("x", -1))
        y = float(prop.get("y", floor_y - 3.0))
        if kind not in ALLOWED_DRESSING_KINDS:
            errors.append(f"{stage_name}: dressing[{index}] has unsupported kind {kind!r}")
        if not 0 <= x < width or not 0 <= y <= height:
            errors.append(f"{stage_name}: dressing[{index}] leaves world bounds")
        if kind == "crate":
            size = float(prop.get("size", 32.0))
            if not 22 <= size <= 64:
                errors.append(f"{stage_name}: dressing crate size {size:g} outside 22..64")
        elif kind == "sandbags":
            count = int(prop.get("count", 5))
            if not 3 <= count <= 9:
                errors.append(f"{stage_name}: dressing sandbag count {count} outside 3..9")

    if len(story_props) < MIN_STORY_PROPS:
        errors.append(f"{stage_name}: story prop count {len(story_props)} < {MIN_STORY_PROPS}")
    for index, prop in enumerate(story_props):
        if not isinstance(prop, dict):
            errors.append(f"{stage_name}: story_props[{index}] must be an object")
            continue
        kind = str(prop.get("kind", ""))
        x = float(prop.get("x", -1))
        y = float(prop.get("y", floor_y))
        if kind not in ALLOWED_STORY_PROP_KINDS:
            errors.append(f"{stage_name}: story_props[{index}] has unsupported kind {kind!r}")
        layer = str(prop.get("layer", "foreground"))
        if layer not in {"foreground", "architecture"}:
            errors.append(f"{stage_name}: story_props[{index}] has unsupported layer {layer!r}")
        if not 0 <= x < width or not 0 <= y <= height:
            errors.append(f"{stage_name}: story_props[{index}] leaves world bounds")
        if kind == "jungle_ruin_pillar":
            w = float(prop.get("w", 0)); h = float(prop.get("h", 0))
            if not 24 <= w <= 90 or not 50 <= h <= 150:
                errors.append(f"{stage_name}: jungle ruin pillar has invalid size")
        elif kind in {"jungle_brazier", "jungle_fern_cluster"}:
            scale = float(prop.get("scale", 1.0))
            if not 0.6 <= scale <= 1.5:
                errors.append(f"{stage_name}: {kind} scale {scale:g} outside 0.6..1.5")
        elif kind == "industrial_bunker":
            w = float(prop.get("w", 0)); h = float(prop.get("h", 0))
            if w < 120 or h < 90 or x + w > width or y + h > height:
                errors.append(f"{stage_name}: industrial bunker has invalid bounds")
        elif kind == "industrial_watch_post":
            top_y = float(prop.get("top_y", -1)); base_y = float(prop.get("base_y", floor_y))
            if not 0 <= top_y < base_y <= height:
                errors.append(f"{stage_name}: industrial watch post has invalid vertical bounds")
        elif kind == "industrial_drain":
            radius = float(prop.get("radius", 0))
            if not 8 <= radius <= 48:
                errors.append(f"{stage_name}: industrial drain radius {radius:g} outside 8..48")
        elif kind == "industrial_rubble_field":
            count = int(prop.get("count", 0)); spacing = float(prop.get("spacing", 0))
            if not 1 <= count <= 40 or not 20 <= spacing <= 160:
                errors.append(f"{stage_name}: industrial rubble field has invalid count/spacing")
            if x + max(0, count - 1) * spacing >= width:
                errors.append(f"{stage_name}: industrial rubble field leaves horizontal world bounds")

    low_passages = 0
    platform_heights: set[int] = set()
    platform_materials: set[str] = set()
    for rect in platforms:
        try:
            y = float(rect["y"]); h = float(rect["h"])
        except Exception:
            continue
        clearance = floor_y - (y + h)
        if 56.0 <= clearance < 86.0:
            low_passages += 1
        platform_heights.add(int(round(y / 20.0)) * 20)
        material = str(rect.get("material", ""))
        visual = rect.get("visual") or {}
        if not isinstance(visual, dict):
            errors.append(f"{stage_name}: platform visual metadata must be an object")
        else:
            for visual_flag in ("rail", "lamp"):
                if visual_flag in visual and not isinstance(visual[visual_flag], bool):
                    errors.append(f"{stage_name}: platform visual.{visual_flag} must be boolean")
            if "sandbags" in visual:
                sandbags = int(visual.get("sandbags", 0))
                if not 0 <= sandbags <= 9:
                    errors.append(f"{stage_name}: platform visual.sandbags {sandbags} outside 0..9")
        if material not in {"metal", "wood", "stone", "concrete"}:
            errors.append(f"{stage_name}: platform has unsupported material {material!r}")
        else:
            platform_materials.add(material)
    if len(platform_materials) < 2:
        errors.append(f"{stage_name}: platform material variety too low")

    climb_platforms = [
        rect for rect in platforms
        if isinstance(rect, dict) and str(rect.get("route", "")) == "climb"
    ]
    if len(climb_platforms) < 4:
        errors.append(f"{stage_name}: needs at least 4 platforms in an authored climb route")
    else:
        climb_levels = sorted({float(rect.get("y", 0)) for rect in climb_platforms})
        if len(climb_levels) < 3:
            errors.append(f"{stage_name}: climb route needs at least 3 distinct elevations")
        for lower, upper in zip(climb_levels, climb_levels[1:]):
            if upper - lower > 100.0:
                errors.append(
                    f"{stage_name}: climb route vertical step {upper - lower:.0f}px exceeds 100px"
                )
        ordered_climb = sorted(climb_platforms, key=lambda rect: float(rect.get("x", 0)))
        for previous, current in zip(ordered_climb, ordered_climb[1:]):
            previous_end = float(previous.get("x", 0)) + float(previous.get("w", 0))
            current_x = float(current.get("x", 0))
            if current_x - previous_end > 48.0:
                errors.append(
                    f"{stage_name}: climb route has horizontal break of {current_x - previous_end:.0f}px"
                )

    if low_passages < 2:
        errors.append(f"{stage_name}: needs at least 2 crouch-height passages")
    if len(platform_heights) < 4:
        errors.append(f"{stage_name}: platform vertical variety too low")

    checkpoints = [float(x) for x in (stage.get("checkpoints") or [])]
    for checkpoint in checkpoints:
        for pit_x, pit_end in pit_ranges:
            if pit_x - 55.0 <= checkpoint <= pit_end + 55.0:
                errors.append(
                    f"{stage_name}: checkpoint {checkpoint:g} is too close to pit "
                    f"{pit_x:g}..{pit_end:g}"
                )
    if not checkpoints:
        errors.append(f"{stage_name}: checkpoints missing")
    elif checkpoints != sorted(checkpoints):
        errors.append(f"{stage_name}: checkpoints must be ordered")
    elif checkpoints[0] > start_x + 1.0:
        errors.append(f"{stage_name}: first checkpoint must cover the spawn")
    if any(x < 0 or x >= width for x in checkpoints):
        errors.append(f"{stage_name}: checkpoint outside world")

    enemies = stage.get("enemies") or []
    spawns = [(float(e.get("x", -1)), str(e.get("type", ""))) for e in enemies if isinstance(e, dict)]
    count = len(spawns)
    if not MIN_ENEMIES <= count <= MAX_ENEMIES:
        errors.append(f"{stage_name}: enemy count {count} outside [{MIN_ENEMIES}, {MAX_ENEMIES}]")
    xs = [x for x, _ in spawns]
    if xs != sorted(xs):
        errors.append(f"{stage_name}: enemy spawn positions must stay ordered")
    for previous, current in zip(xs, xs[1:]):
        gap = current - previous
        if gap < MIN_GAP:
            errors.append(f"{stage_name}: enemy spawn gap {gap:.1f}px below {MIN_GAP:.0f}px near x={current:.0f}")
            break
    for index, start in enumerate(xs):
        in_window = sum(1 for x in xs[index:] if 0 <= x - start <= DENSITY_WINDOW)
        if in_window > MAX_IN_WINDOW:
            errors.append(f"{stage_name}: enemy density {in_window} within {DENSITY_WINDOW:.0f}px starting x={start:.0f}")
            break

    counts = collections.Counter(kind for _x, kind in spawns)
    spawn_types = set(counts)
    missing_base = sorted(REQUIRED_BASE_TYPES - spawn_types)
    missing_variants = sorted(REQUIRED_VARIANTS - spawn_types)
    if missing_base:
        errors.append(f"{stage_name}: missing base enemy types: " + ", ".join(missing_base))
    if missing_variants:
        errors.append(f"{stage_name}: missing visual enemy variants: " + ", ".join(missing_variants))
    undefined = sorted(spawn_types - stats.keys())
    if undefined:
        errors.append(f"{stage_name}: spawn types missing ENEMY_TYPES stats: " + ", ".join(undefined))
    if counts["grenadier"] > MAX_GRENADIERS:
        errors.append(f"{stage_name}: grenadier count {counts['grenadier']} exceeds {MAX_GRENADIERS}")
    first_grenadier = min((x for x, kind in spawns if kind == "grenadier"), default=999999.0)
    if first_grenadier < 1200.0:
        errors.append(f"{stage_name}: first grenadier at x={first_grenadier:.0f} is too early")

    idle_enemies = [
        enemy for enemy in enemies
        if isinstance(enemy, dict) and str(enemy.get("idle_pose", ""))
    ]
    if len(idle_enemies) < 2:
        errors.append(f"{stage_name}: needs at least 2 authored idle/resting enemies")
    for enemy in idle_enemies:
        pose = str(enemy.get("idle_pose", ""))
        reaction = float(enemy.get("idle_reaction", 0.0))
        if pose not in {"sit", "lean", "rest"}:
            errors.append(f"{stage_name}: unsupported idle pose {pose!r}")
        if not 0.55 <= reaction <= 1.8:
            errors.append(f"{stage_name}: idle reaction {reaction:g}s outside 0.55..1.8")

    for enemy in enemies:
        if not isinstance(enemy, dict) or "y" not in enemy:
            continue
        spawn_y = float(enemy["y"])
        spawn_x = float(enemy.get("x", -1))
        kind = str(enemy.get("type", ""))
        if abs(spawn_y - floor_y) <= 1.0:
            continue
        if kind != "rook":
            errors.append(f"{stage_name}: elevated enemy {kind} at x={spawn_x:.0f} must be a stationary rook")
            continue
        supported = any(
            float(rect.get("x", 0)) <= spawn_x <= float(rect.get("x", 0)) + float(rect.get("w", 0))
            and abs(float(rect.get("y", -999)) - spawn_y) <= 2.0
            for rect in platforms
            if isinstance(rect, dict)
        )
        if not supported:
            errors.append(f"{stage_name}: elevated rook at x={spawn_x:.0f}, y={spawn_y:.0f} lacks platform support")

    setpieces = stage.get("setpieces") or []
    ids: set[str] = set()
    kinds: set[str] = set()
    if len(setpieces) < 3:
        errors.append(f"{stage_name}: needs at least 3 authored set pieces")
    for index, setpiece in enumerate(setpieces):
        if not isinstance(setpiece, dict):
            errors.append(f"{stage_name}: setpieces[{index}] must be an object")
            continue
        setpiece_id = str(setpiece.get("id", ""))
        kind = str(setpiece.get("type", ""))
        if not setpiece_id or setpiece_id in ids:
            errors.append(f"{stage_name}: setpieces[{index}] needs a unique id")
        ids.add(setpiece_id)
        kinds.add(kind)
        if kind not in ALLOWED_SETPIECES:
            errors.append(f"{stage_name}: unsupported set-piece type {kind!r}")
            continue
        trigger_x = float(setpiece.get("trigger_x", 0.0))
        if trigger_x < 0 or trigger_x >= width:
            errors.append(f"{stage_name}: {setpiece_id} trigger_x outside world")
        if kind == "moving_platform":
            x = float(setpiece.get("x", -1)); y = float(setpiece.get("y", -1))
            w = float(setpiece.get("w", 0)); h = float(setpiece.get("h", 0))
            tx = float(setpiece.get("travel_x", 0)); ty = float(setpiece.get("travel_y", 0))
            period = float(setpiece.get("period", 0))
            if w <= 0 or h <= 0 or not 1.5 <= period <= 12.0:
                errors.append(f"{stage_name}: moving platform {setpiece_id} has invalid size/period")
            if min(x, x + tx) < 0 or max(x + w, x + tx + w) > width:
                errors.append(f"{stage_name}: moving platform {setpiece_id} leaves horizontal world bounds")
            if min(y, y + ty) < 0 or max(y + h, y + ty + h) > floor_y:
                errors.append(f"{stage_name}: moving platform {setpiece_id} leaves playable vertical bounds")
        elif kind == "bunker_turret":
            x = float(setpiece.get("x", -1)); hp = int(setpiece.get("hp", 0))
            if not 0 < x < width or not 50 <= hp <= 400:
                errors.append(f"{stage_name}: bunker {setpiece_id} has invalid x/hp")
        elif kind == "reinforcement_wave":
            wave = setpiece.get("enemies") or []
            if not 1 <= len(wave) <= 4:
                errors.append(f"{stage_name}: wave {setpiece_id} must contain 1..4 enemies")
            for reinforcement in wave:
                if not isinstance(reinforcement, dict):
                    errors.append(f"{stage_name}: wave {setpiece_id} has invalid enemy")
                    continue
                rx = float(reinforcement.get("x", -1))
                rtype = str(reinforcement.get("type", ""))
                if not 0 <= rx < width or rtype not in stats:
                    errors.append(f"{stage_name}: wave {setpiece_id} has invalid spawn {rtype}@{rx:.0f}")
        elif kind == "convoy":
            start = float(setpiece.get("start_x", -1)); end = float(setpiece.get("end_x", -1))
            speed = float(setpiece.get("speed", 0))
            if not 0 <= start < width or not 0 <= end < width or not 80 <= speed <= 520:
                errors.append(f"{stage_name}: convoy {setpiece_id} has invalid route/speed")
        elif kind in {"destructible_barricade", "destructible_platform"}:
            x = float(setpiece.get("x", -1)); y = float(setpiece.get("y", -1))
            w = float(setpiece.get("w", 0)); h = float(setpiece.get("h", 0))
            hp = int(setpiece.get("hp", 0))
            if w < 60 or h <= 0 or not 30 <= hp <= 240:
                errors.append(f"{stage_name}: destructible {setpiece_id} has invalid size/hp")
            if x < 0 or x + w > width or y < 0 or y + h > floor_y:
                errors.append(f"{stage_name}: destructible {setpiece_id} leaves playable bounds")
        elif kind == "artillery_barrage":
            salvos = int(setpiece.get("salvos", 0))
            telegraph = float(setpiece.get("telegraph", 0))
            interval = float(setpiece.get("interval", 0))
            radius = float(setpiece.get("radius", 0))
            min_x = float(setpiece.get("min_x", -1)); max_x = float(setpiece.get("max_x", -1))
            if not 1 <= salvos <= 6 or not 0.45 <= telegraph <= 2.0 or not 0.45 <= interval <= 2.0:
                errors.append(f"{stage_name}: artillery {setpiece_id} has invalid timing/salvos")
            if not 48 <= radius <= 130 or not 0 <= min_x < max_x < width:
                errors.append(f"{stage_name}: artillery {setpiece_id} has invalid radius/zone")
        elif kind == "collapse_bridge":
            x = float(setpiece.get("x", -1)); y = float(setpiece.get("y", -1))
            w = float(setpiece.get("w", 0)); h = float(setpiece.get("h", 0))
            warning = float(setpiece.get("warning", 0)); gravity = float(setpiece.get("fall_gravity", 0))
            if w < 100 or h <= 0 or not 0.20 <= warning <= 2.5 or not 300 <= gravity <= 1800:
                errors.append(f"{stage_name}: collapse bridge {setpiece_id} has invalid size/timing")
            if x < 0 or x + w > width or y < 0 or y + h > floor_y:
                errors.append(f"{stage_name}: collapse bridge {setpiece_id} leaves playable bounds")
            if trigger_x <= x + w:
                errors.append(f"{stage_name}: collapse bridge {setpiece_id} must trigger after Matthias crosses it")
        elif kind in {"waterfall", "tunnel_portal"}:
            x = float(setpiece.get("x", -1)); y = float(setpiece.get("y", -1))
            w = float(setpiece.get("w", 0)); h = float(setpiece.get("h", 0))
            if w <= 0 or h <= 0 or x - w * 0.5 < 0 or x + w * 0.5 > width:
                errors.append(f"{stage_name}: section landmark {setpiece_id} has invalid width/x")
            if kind == "waterfall":
                if y < 0 or y + h > floor_y:
                    errors.append(f"{stage_name}: waterfall {setpiece_id} leaves playable vertical bounds")
            elif y - h < 0 or y > floor_y + 1:
                errors.append(f"{stage_name}: tunnel portal {setpiece_id} leaves playable vertical bounds")

    missing_setpieces = sorted(REQUIRED_SETPIECE_TYPES - kinds)
    if missing_setpieces:
        errors.append(f"{stage_name}: missing set-piece types: " + ", ".join(missing_setpieces))
    if "collapse_bridge" not in kinds:
        errors.append(f"{stage_name}: needs at least one collapsing traversal set piece")
    if not ({"waterfall", "tunnel_portal"} & kinds):
        errors.append(f"{stage_name}: needs at least one section-transition landmark")

    pickups = stage.get("pickups") or []
    if not any(str(p.get("type", "")) == "machinegun" for p in pickups if isinstance(p, dict)):
        errors.append(f"{stage_name}: opening machinegun pickup missing")
    climb_pickups = [
        pickup for pickup in pickups
        if isinstance(pickup, dict) and str(pickup.get("route", "")) == "climb"
    ]
    if not climb_pickups:
        errors.append(f"{stage_name}: climb route needs an optional elevated reward")
    elif not any(float(pickup.get("y", floor_y)) <= floor_y - 150.0 for pickup in climb_pickups):
        errors.append(f"{stage_name}: climb reward is not meaningfully elevated")

    climb_rooks = [
        enemy for enemy in enemies
        if isinstance(enemy, dict)
        and str(enemy.get("route", "")) == "climb"
        and str(enemy.get("type", "")) == "rook"
    ]
    if not climb_rooks:
        errors.append(f"{stage_name}: climb route needs an elevated rook encounter")

    backdrop = stage.get("backdrop") or {}
    layers = backdrop.get("layers") or []
    required_layer_kinds = {"sky", "far_ridge", "ruined_city", "mid_defence", "near_weather", "near_foreground"}
    layer_kinds = {str(layer.get("kind", "")) for layer in layers if isinstance(layer, dict)}
    missing_layers = sorted(required_layer_kinds - layer_kinds)
    if missing_layers:
        errors.append(f"{stage_name}: missing parallax layer kinds: " + ", ".join(missing_layers))
    previous_scroll = -1.0
    for layer in layers:
        if not isinstance(layer, dict):
            continue
        scroll = float(layer.get("scroll", -1.0))
        if not 0.0 <= scroll <= 1.0:
            errors.append(f"{stage_name}: parallax scroll {scroll:g} outside 0..1")
        if scroll < previous_scroll:
            errors.append(f"{stage_name}: parallax layers must progress from far to near")
            break
        previous_scroll = scroll

    boss = stage.get("boss") or {}
    extraction = stage.get("extraction") or {}
    boss_x = float(boss.get("x", -1))
    extraction_x = float(extraction.get("x", -1))
    boss_trigger_x = float(boss.get("trigger_x", boss_x - 720.0))
    if not 0 < boss_x < width:
        errors.append(f"{stage_name}: boss x outside world")
    if xs and max(xs) >= boss_trigger_x:
        errors.append(
            f"{stage_name}: regular enemy at x={max(xs):.0f} overlaps boss trigger x={boss_trigger_x:.0f}"
        )
    if not boss_x < extraction_x < width:
        errors.append(f"{stage_name}: extraction must be after boss and inside world")

    for kind, values in sorted(stats.items()):
        hp, speed = values["hp"], values["speed"]
        width_stat, height_stat, standoff = values["width"], values["height"], values["standoff"]
        if not 1 <= hp <= 350:
            errors.append(f"{kind}: hp {hp:g} outside 1..350")
        if not 0 <= speed <= 120:
            errors.append(f"{kind}: speed {speed:g} outside 0..120")
        if not 35 <= width_stat <= 100:
            errors.append(f"{kind}: width {width_stat:g} outside 35..100")
        if not 55 <= height_stat <= 140:
            errors.append(f"{kind}: height {height_stat:g} outside 55..140")
        if not 140 <= standoff <= 650:
            errors.append(f"{kind}: standoff {standoff:g} outside 140..650")
    return errors

def self_test() -> None:
    stage = {
        "world": {"width": 5200, "height": 720, "floor_y": 610, "start_x": 110},
        "checkpoints": [110, 1480, 2980, 4140],
        "platforms": [
            {"x": 100 + i * 250, "y": 520 - (i % 5) * 35, "w": 160, "h": 24, "material": "metal" if i % 2 == 0 else "wood"}
            for i in range(18)
        ] + [
            {"x": 900, "y": 430, "w": 150, "h": 24, "material": "metal", "route": "climb"},
            {"x": 980, "y": 345, "w": 150, "h": 24, "material": "metal", "route": "climb"},
            {"x": 1080, "y": 260, "w": 150, "h": 24, "material": "wood", "route": "climb"},
            {"x": 1200, "y": 345, "w": 150, "h": 24, "material": "metal", "route": "climb"},
        ],
        "ladders": [
            {"id": "ladder-a", "x": 950, "y": 345, "w": 42, "h": 265, "style": "steel"},
            {"id": "ladder-b", "x": 3400, "y": 340, "w": 42, "h": 270, "style": "steel"},
        ],
        "pits": [{"id": "test-pit", "x": 4200, "w": 100, "kind": "trench"}],
        "obstacles": [{"x": 300 + i * 600, "y": 550, "w": 60, "h": 60, "kind": "crate"} for i in range(7)],
        "dressing": [{"kind": "crate", "x": 220 + i * 420, "y": 607, "size": 30} for i in range(10)],
        "story_props": [{"kind": "front_wreck", "x": 260 + i * 760, "y": 608} for i in range(5)],
        "setpieces": [
            {"id": "lift", "type": "moving_platform", "x": 900, "y": 360, "w": 140, "h": 24, "travel_y": 100, "period": 4.0},
            {"id": "bunker", "type": "bunker_turret", "x": 2500, "y": 610, "w": 126, "h": 82, "hp": 180, "trigger_x": 2000},
            {"id": "wave", "type": "reinforcement_wave", "trigger_x": 3000, "enemies": [{"x": 2900, "type": "pawn"}]},
            {"id": "truck", "type": "convoy", "trigger_x": 1600, "start_x": 2200, "end_x": 1300, "y": 606, "speed": 260},
            {"id": "bridge", "type": "collapse_bridge", "x": 3400, "y": 340, "w": 180, "h": 24, "trigger_x": 3620, "warning": 0.7, "fall_gravity": 980},
            {"id": "portal", "type": "tunnel_portal", "x": 3900, "y": 610, "w": 320, "h": 220},
            {"id": "breakable", "type": "destructible_platform", "x": 3600, "y": 320, "w": 160, "h": 24, "hp": 70},
            {"id": "shelling", "type": "artillery_barrage", "trigger_x": 2800, "min_x": 2700, "max_x": 3500, "salvos": 3, "telegraph": 0.9, "interval": 0.8, "radius": 80},
        ],
        "pickups": [
            {"x": 1200, "y": 566, "type": "machinegun"},
            {"x": 1140, "y": 216, "type": "grenade", "route": "climb", "optional": True},
        ],
        "backdrop": {"layers": [
            {"kind": "sky", "scroll": 0.03},
            {"kind": "far_ridge", "scroll": 0.14},
            {"kind": "ruined_city", "scroll": 0.34},
            {"kind": "mid_defence", "scroll": 0.62},
            {"kind": "near_weather", "scroll": 0.88},
            {"kind": "near_foreground", "scroll": 0.98},
        ]},
        "boss": {"x": 4580, "trigger_x": 4300},
        "extraction": {"x": 5050},
    }
    kinds = ["pawn","scout","pawn","knight","shield","pawn","rook","pawn","grenadier","bishop",
             "knight","pawn","rook","grenadier","commando","knight","pawn","queen","bishop",
             "pawn","rook","knight","pawn","grenadier","pawn","rook","knight","pawn"]
    stage["enemies"] = [{"x": 620 + i * 120, "type": kind} for i, kind in enumerate(kinds)]
    stage["enemies"][5]["idle_pose"] = "sit"
    stage["enemies"][5]["idle_reaction"] = 0.9
    stage["enemies"][15]["idle_pose"] = "lean"
    stage["enemies"][15]["idle_reaction"] = 1.0
    stage["enemies"][6]["y"] = 345
    stage["enemies"][6]["route"] = "climb"
    stats = parse_stats(MAIN.read_text(encoding="utf-8"))
    assert not validate_stage(stage, stats, "self-test")
    crowded = json.loads(json.dumps(stage))
    crowded["enemies"][1]["x"] = 650
    assert any("gap" in e for e in validate_stage(crowded, stats, "self-test"))
    print("OK Pawn Slug stage manifest gate self-test")

def main() -> int:
    try:
        if len(sys.argv) > 1 and sys.argv[1] == "self-test":
            self_test()
            return 0
        stats = parse_stats(MAIN.read_text(encoding="utf-8"))
        paths = sorted(MAP_ROOT.glob("*.json"))
        if not paths:
            raise GateError("no Pawn Slug stage manifests found")
        errors: list[str] = []
        for path in paths:
            stage = load_stage(path)
            errors.extend(validate_stage(stage, stats, path.name))
        if errors:
            raise GateError("\n".join(errors))
        print(f"OK Pawn Slug stage manifests: {len(paths)} map(s) validated")
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
