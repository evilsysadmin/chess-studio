#!/usr/bin/env python3
"""Build the independent War Room v3 "Celestial Observatory" shell.

V3 keeps only the live-board anchor and canonical camera from the v2 generator.
Its authored room is rebuilt from an empty static collection: a curved tower
apse, circular command table, celestial window, single cast-iron stove,
drafting station and suspended armillary replace v2's rectangular hall.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_war_room_premium as base  # noqa: E402


CONTRACT = "war-room-celestial-observatory-v3"
V3_WEATHER_MATERIALS = frozenset({
    "WR3_MAT_warm_travertine",
    "WR3_MAT_pale_travertine",
    "WR3_MAT_radial_slate",
})


def clear_inherited_room(static):
    """Keep the proven camera; v3 owns every visible static mesh and light."""
    removed = 0
    for obj in list(static.objects):
        if obj.name == "WR_CAMERA_hero":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
    if removed < 180:
        raise RuntimeError(f"War Room v3 inherited-room teardown suspiciously small: {removed}")


def build_v3_palette():
    return {
        "stone": base.material(
            "WR3_MAT_warm_travertine", (0.33, 0.205, 0.105, 1),
            rough=0.77, coat=0.014, texture="stone", scale=4.3, bump=0.068, weather=True,
        ),
        "stone_light": base.material(
            "WR3_MAT_pale_travertine", (0.52, 0.355, 0.185, 1),
            rough=0.72, coat=0.018, texture="stone", scale=4.0, bump=0.055, weather=True,
        ),
        "slate": base.material(
            "WR3_MAT_radial_slate", (0.030, 0.070, 0.078, 1),
            rough=0.78, coat=0.014, texture="stone", scale=5.0, bump=0.052, weather=True,
        ),
        "teal": base.material(
            "WR3_MAT_deep_teal_enamel", (0.006, 0.105, 0.110, 1),
            rough=0.34, coat=0.38, texture="metal", scale=22, bump=0.018,
        ),
        "copper": base.material(
            "WR3_MAT_patinated_copper", (0.055, 0.275, 0.210, 1),
            metal=0.82, rough=0.37, coat=0.12, texture="metal", scale=26, bump=0.024,
        ),
        "brass": base.material(
            "WR3_MAT_sunlit_brass", (0.62, 0.275, 0.045, 1),
            metal=0.92, rough=0.27, coat=0.18, texture="metal", scale=25, bump=0.021,
        ),
        "brass_dark": base.material(
            "WR3_MAT_aged_brass", (0.20, 0.075, 0.014, 1),
            metal=0.90, rough=0.39, coat=0.10, texture="metal", scale=29, bump=0.020,
        ),
        "walnut": base.material(
            "WR3_MAT_chart_walnut", (0.105, 0.036, 0.012, 1),
            rough=0.43, coat=0.22, texture="wood", scale=3.5, bump=0.038,
        ),
        "walnut_dark": base.material(
            "WR3_MAT_chart_walnut_dark", (0.032, 0.010, 0.005, 1),
            rough=0.52, coat=0.12, texture="wood", scale=3.2, bump=0.032,
        ),
        "leather": base.material(
            "WR3_MAT_saddle_leather", (0.29, 0.055, 0.018, 1),
            rough=0.47, coat=0.19, sheen=0.10, texture="leather", scale=44, bump=0.070,
        ),
        "green_leather": base.material(
            "WR3_MAT_chart_green_leather", (0.008, 0.120, 0.058, 1),
            rough=0.47, coat=0.18, sheen=0.08, texture="leather", scale=46, bump=0.061,
        ),
        "night": base.material(
            "WR3_MAT_celestial_blue", (0.002, 0.018, 0.120, 1),
            rough=0.18, coat=0.52, emission=(0.006, 0.055, 0.25, 1), emission_strength=0.65,
        ),
        "aurora": base.material(
            "WR3_MAT_aurora_glass", (0.010, 0.235, 0.175, 1),
            rough=0.20, coat=0.52, emission=(0.015, 0.22, 0.14, 1), emission_strength=0.80,
        ),
        "ivory": bpy.data.materials["WR_MAT_ivory"],
        "iron": bpy.data.materials["WR_MAT_hearth_iron"],
        "charcoal": bpy.data.materials["WR_MAT_charcoal"],
        "fire": bpy.data.materials["WR_MAT_fire"],
        "fire_core": bpy.data.materials["WR_MAT_fire_core"],
    }


def cylinder_between(name, start, end, radius, material, owner, *, vertices=24):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = base.cylinder(name, (start + end) / 2.0, radius, direction.length,
                        material, owner, vertices=vertices)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def build_curved_observatory(static, palette):
    """Create a round apse and open ribbed canopy instead of v2's box room."""
    base.cylinder("WR3_OBS_floor", (0, 0.0, -0.13), 9.05, 0.24,
                  palette["slate"], static, vertices=96)
    base.cylinder("WR3_OBS_compass_field", (0, -0.05, 0.008), 6.82, 0.040,
                  palette["teal"], static, vertices=96)
    base.torus("WR3_OBS_compass_outer_ring", (0, -0.05, 0.045), 6.42, 0.042,
               palette["brass_dark"], static)
    base.torus("WR3_OBS_compass_inner_ring", (0, -0.05, 0.047), 5.82, 0.024,
               palette["brass"], static)

    # A fine navigator's scale adds authored detail and batches into the brass
    # floor ring at runtime. Long cardinal ticks make the compass readable;
    # short intermediate ticks keep the circle refined rather than toy-like.
    for index in range(48):
        angle = index * math.tau / 48.0
        radius = 6.18
        length = 0.20 if index % 12 == 0 else (0.14 if index % 4 == 0 else 0.085)
        tick = base.cube(
            f"WR3_OBS_compass_tick_{index}",
            (math.cos(angle) * radius, math.sin(angle) * radius - 0.05, 0.058),
            (0.020, length, 0.010),
            palette["brass"] if index % 12 == 0 else palette["brass_dark"],
            static,
            bevel=0.008,
        )
        tick.rotation_euler.z = angle

    for index, angle in enumerate((0, math.pi / 4, math.pi / 2, 3 * math.pi / 4)):
        ray = base.cube(f"WR3_OBS_compass_ray_{index}", (0, -0.05, 0.055),
                        (6.22, 0.045 if index % 2 == 0 else 0.025, 0.012),
                        palette["brass"] if index % 2 == 0 else palette["brass_dark"],
                        static, bevel=0.012)
        ray.rotation_euler.z = angle

    radius = 8.72
    center_y = -0.72
    segment_count = 15
    start = math.radians(-88)
    end = math.radians(88)
    step = (end - start) / segment_count
    half_length = radius * step * 0.515
    joints = []
    for index in range(segment_count):
        theta = start + (index + 0.5) * step
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        tangent = math.atan2(-math.sin(theta), math.cos(theta))
        lower = base.cube(f"WR3_OBS_apse_lower_{index}", (x, y, 1.48),
                          (half_length, 0.17, 1.48),
                          palette["teal"] if index % 2 else palette["walnut_dark"],
                          static, bevel=0.055)
        lower.rotation_euler.z = tangent
        upper = base.cube(f"WR3_OBS_apse_upper_{index}", (x, y, 4.72),
                          (half_length, 0.15, 1.76), palette["stone"], static, bevel=0.075)
        upper.rotation_euler.z = tangent
        joints.append((theta - step / 2.0, index))
    joints.append((end, segment_count))

    for theta, index in joints:
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        base.cylinder(f"WR3_OBS_apse_rib_{index}", (x, y, 3.48), 0.105, 6.56,
                      palette["copper"], static, vertices=32)
        base.cylinder(f"WR3_OBS_apse_rib_foot_{index}", (x, y, 0.30), 0.23, 0.30,
                      palette["brass_dark"], static, vertices=40)

    for index, theta in enumerate((start, start + 3 * step, start + 6 * step,
                                   start + 9 * step, start + 12 * step, end)):
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        cylinder_between(f"WR3_OBS_canopy_rib_{index}", (x, y, 6.55),
                         (x * 0.16, 0.65, 7.62), 0.075, palette["copper"], static, vertices=28)


def build_celestial_window(static, palette):
    cx, cy, cz = 0.0, 7.58, 3.80
    glass = base.cylinder("WR3_OBS_celestial_window", (cx, cy, cz), 2.15, 0.085,
                          palette["night"], static, vertices=96)
    glass.rotation_euler.x = math.pi / 2
    base.torus("WR3_OBS_celestial_window_outer", (cx, cy - 0.07, cz), 2.30, 0.105,
               palette["copper"], static, rotation=(math.pi / 2, 0, 0))
    base.torus("WR3_OBS_celestial_window_inner", (cx, cy - 0.13, cz), 1.42, 0.037,
               palette["brass"], static, rotation=(math.pi / 2, 0, 0))

    for index, angle in enumerate(range(0, 360, 45)):
        spoke = base.cube(f"WR3_OBS_window_spoke_{index}", (cx, cy - 0.16, cz),
                          (1.96, 0.028, 0.028), palette["brass_dark"], static, bevel=0.018)
        spoke.rotation_euler.y = math.radians(angle)

    for index, angle in enumerate(range(205, 326, 12)):
        radians = math.radians(angle)
        x = cx + math.cos(radians) * 1.69
        z = cz + math.sin(radians) * 0.62 + 0.61
        base.sphere(f"WR3_OBS_aurora_{index}", (x, cy - 0.21, z), 0.105,
                    palette["aurora"], static, scale=(1.42, 0.22, 0.46))
    base.sphere("WR3_OBS_window_moon", (-0.75, cy - 0.25, cz + 0.62), 0.30,
                palette["ivory"], static, scale=(1.0, 0.20, 1.0))
    for index, (dx, dz, radius) in enumerate((
        (0.18, 0.78, 0.050), (0.66, 0.48, 0.036), (1.08, 0.82, 0.044),
        (1.28, 0.15, 0.032), (-1.22, -0.10, 0.038), (-0.32, -0.62, 0.030),
    )):
        base.sphere(f"WR3_OBS_window_star_{index}", (cx + dx, cy - 0.25, cz + dz),
                    radius, palette["brass"], static, scale=(1.0, 0.25, 1.0))

    window_light = base.light("WR3_LIGHT_window", "AREA", (0, 5.95, 4.40), 330.0,
                              (0.22, 0.52, 1.0), static, size=4.8)
    base.look_at(window_light, (0, 0.2, 1.1))
    base.anchor("WR_ANCHOR_window_moonlight", (0, 6.0, 4.30), static)


def build_round_command_table(static, palette):
    base.cylinder("WR3_OBS_table_drum", (0, 0, 0.47), 5.93, 0.76,
                  palette["walnut_dark"], static, vertices=96)
    base.cylinder("WR3_OBS_table_leather_top", (0, 0, 0.91), 5.72, 0.12,
                  palette["green_leather"], static, vertices=96)
    base.torus("WR3_OBS_table_brass_edge", (0, 0, 0.985), 5.72, 0.060,
               palette["brass"], static)
    base.torus("WR3_OBS_table_copper_inlay", (0, 0, 1.005), 5.30, 0.024,
               palette["copper"], static)
    base.cube("WR3_OBS_board_cradle", (0, 0, 1.04), (4.62, 4.62, 0.085),
              palette["walnut"], static, bevel=0.14)
    for side in (-1, 1):
        base.cube(f"WR3_OBS_board_brass_x_{side}", (0, side * 4.49, 1.135),
                  (4.42, 0.035, 0.035), palette["brass"], static, bevel=0.018)
        base.cube(f"WR3_OBS_board_brass_y_{side}", (side * 4.49, 0, 1.135),
                  (0.035, 4.42, 0.035), palette["brass"], static, bevel=0.018)
    base.cube("WR3_OBS_table_cartouche", (0, -5.86, 0.55), (0.92, 0.055, 0.25),
              palette["teal"], static, bevel=0.18)
    base.torus("WR3_OBS_table_cartouche_ring", (0, -5.93, 0.56), 0.18, 0.035,
               palette["brass"], static, rotation=(math.pi / 2, 0, 0))


def build_single_stove(static, palette):
    """One compact circular fireplace; no mirrored hearth or second anchor."""
    x, y = -6.35, 4.30
    base.cylinder("WR3_OBS_stove_body", (x, y, 1.56), 0.86, 1.72,
                  palette["iron"], static, vertices=64)
    base.cylinder("WR3_OBS_stove_crown", (x, y, 2.47), 0.96, 0.12,
                  palette["brass_dark"], static, vertices=64)
    base.cylinder("WR3_OBS_stove_plinth", (x, y, 0.65), 1.02, 0.14,
                  palette["stone"], static, vertices=64)
    for side in (-1, 1):
        base.cube(f"WR3_OBS_stove_leg_{side}", (x + side * 0.55, y, 0.43),
                  (0.10, 0.18, 0.26), palette["iron"], static, bevel=0.07)

    door = base.cylinder("WR3_OBS_stove_door", (x, y - 0.86, 1.58), 0.62, 0.10,
                         palette["charcoal"], static, vertices=64)
    door.rotation_euler.x = math.pi / 2
    base.torus("WR3_OBS_stove_door_ring", (x, y - 0.93, 1.58), 0.63, 0.055,
               palette["brass"], static, rotation=(math.pi / 2, 0, 0))
    base.sphere("WR3_OBS_stove_flame_body", (x, y - 0.99, 1.45),
                0.27, palette["fire"], static, scale=(1.48, 0.22, 0.48))
    for index, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.18, 0.02, 0.48, 1.02, -0.16),
        (0.02, 0.13, 0.42, 1.22, 0.07),
        (0.22, -0.01, 0.36, 0.82, 0.19),
    )):
        tongue = base.sphere(f"WR3_OBS_stove_flame_{index}",
                             (x + dx, y - 1.005, 1.52 + dz),
                             0.22, palette["fire"] if index != 1 else palette["fire_core"],
                             static, scale=(sx, 0.20, sz))
        tongue.rotation_euler.y = tilt
    base.cylinder("WR3_OBS_stove_flue", (x, y, 4.33), 0.23, 3.62,
                  palette["iron"], static, vertices=48)
    base.torus("WR3_OBS_stove_flue_collar", (x, y, 2.63), 0.31, 0.048,
               palette["brass_dark"], static)
    base.cylinder("WR3_OBS_stove_flue_cap", (x, y, 6.18), 0.39, 0.10,
                  palette["copper"], static, vertices=48)
    base.light("WR3_LIGHT_stove", "POINT", (x, y - 1.25, 1.72), 245.0,
               (1.0, 0.25, 0.035), static, radius=1.45)
    base.anchor("WR_ANCHOR_fireplace_practical", (x, y - 1.05, 1.76), static)


def build_drafting_station(static, palette):
    """An angled charting desk gives the right bay a functional silhouette."""
    x, y = 5.35, 5.18
    top = base.cube("WR3_OBS_drafting_top", (x, y, 2.18), (1.78, 0.74, 0.105),
                    palette["walnut"], static, bevel=0.11)
    top.rotation_euler.z = -0.18
    map_sheet = base.cube("WR3_OBS_drafting_map", (x - 0.10, y - 0.05, 2.31),
                          (1.43, 0.56, 0.018), palette["ivory"], static, bevel=0.035)
    map_sheet.rotation_euler.z = -0.18
    for side in (-1, 1):
        leg_x = x + side * 1.42
        base.cube(f"WR3_OBS_drafting_leg_{side}", (leg_x, y + side * -0.26, 1.22),
                  (0.14, 0.18, 0.86), palette["walnut_dark"], static, bevel=0.07)
        roll = base.cylinder(f"WR3_OBS_drafting_roll_{side}",
                             (x + side * 1.23, y - 0.18, 2.42), 0.075, 0.90,
                             palette["ivory"], static, vertices=40)
        roll.rotation_euler.y = math.pi / 2
    base.cube("WR3_OBS_drafting_crossbar", (x, y + 0.10, 1.22),
              (1.48, 0.10, 0.10), palette["copper"], static, bevel=0.045)

    carousel_x, carousel_y = 7.08, 3.65
    base.cylinder("WR3_OBS_map_carousel_post", (carousel_x, carousel_y, 1.48), 0.10, 2.15,
                  palette["brass_dark"], static, vertices=32)
    base.cylinder("WR3_OBS_map_carousel_foot", (carousel_x, carousel_y, 0.38), 0.48, 0.12,
                  palette["walnut_dark"], static, vertices=48)
    for index in range(6):
        angle = index * math.tau / 6.0
        px = carousel_x + math.cos(angle) * 0.36
        py = carousel_y + math.sin(angle) * 0.36
        base.cylinder(f"WR3_OBS_map_tube_{index}", (px, py, 1.62), 0.10, 1.65,
                      palette["leather"] if index % 2 else palette["green_leather"],
                      static, vertices=36)
        base.cylinder(f"WR3_OBS_map_tube_cap_{index}", (px, py, 2.48), 0.115, 0.055,
                      palette["brass"], static, vertices=36)

    for index, (dx, dy, angle) in enumerate((
        (-0.72, 0.12, 0.18), (-0.18, -0.08, -0.24), (0.42, 0.16, 0.32), (0.88, -0.12, -0.10),
    )):
        mark = base.cube(f"WR3_OBS_map_route_{index}", (x + dx, y + dy - 0.08, 2.345),
                         (0.28, 0.018, 0.010), palette["brass_dark"], static, bevel=0.009)
        mark.rotation_euler.z = angle - 0.18


def build_armillary_light(static, palette):
    x, y, z = 3.70, 3.35, 5.62
    for index, rotation in enumerate((
        (0, 0, 0), (math.pi / 2, 0, 0), (math.pi / 2, 0, math.pi / 3),
        (math.pi / 2, 0, -math.pi / 3),
    )):
        base.torus(f"WR3_OBS_armillary_ring_{index}", (x, y, z),
                   0.66 + index * 0.055, 0.030,
                   palette["brass"] if index < 2 else palette["copper"],
                   static, rotation=rotation)
    base.sphere("WR3_OBS_armillary_sun", (x, y, z), 0.16, palette["brass"], static)
    base.cylinder("WR3_OBS_armillary_chain", (x, y, 6.68), 0.022, 1.34,
                  palette["brass_dark"], static, vertices=20)
    base.light("WR3_LIGHT_armillary", "POINT", (x, y, z - 0.12), 102.0,
               (1.0, 0.53, 0.19), static, radius=1.35)
    base.anchor("WR_ANCHOR_chandelier_practical", (x, y, z - 0.10), static)


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "v3-celestial-observatory"
    scene["war_room_visual_canon"] = "celestial-observatory-2026-09-23-v1"
    scene.view_settings.exposure = 0.20

    key = base.light("WR3_LIGHT_key", "AREA", (-4.8, -3.8, 8.3), 520.0,
                     (1.0, 0.66, 0.36), static, size=6.2)
    base.look_at(key, (0, 0.5, 1.0))
    fill = base.light("WR3_LIGHT_fill", "AREA", (6.4, -2.4, 6.3), 285.0,
                      (0.24, 0.68, 0.82), static, size=5.8)
    base.look_at(fill, (0.4, 0.6, 1.5))
    top = base.light("WR3_LIGHT_top", "AREA", (0, 1.4, 8.7), 225.0,
                     (1.0, 0.76, 0.46), static, size=5.2)
    base.look_at(top, (0, 0.4, 0.8))


def bake_v3_weather():
    base.WEATHER_MATERIALS = V3_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in V3_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_v3_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("War Room v3 static shell missing")
    clear_inherited_room(static)
    palette = build_v3_palette()
    build_curved_observatory(static, palette)
    build_celestial_window(static, palette)
    build_round_command_table(static, palette)
    build_single_stove(static, palette)
    build_drafting_station(static, palette)
    build_armillary_light(static, palette)
    build_lighting(static)
    bake_v3_weather()
    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["war_room_contract"] = CONTRACT
    bpy.context.scene["war_room_contract"] = CONTRACT


def validate_v3():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "WR_ANCHOR_board_origin",
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
        "WR3_OBS_floor",
        "WR3_OBS_table_drum",
        "WR3_OBS_celestial_window",
        "WR3_OBS_stove_body",
        "WR3_OBS_drafting_top",
        "WR3_OBS_armillary_ring_0",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"War Room v3 contract objects missing: {missing}")
    forbidden_prefixes = (
        "WR_ARCH_", "WR_TABLE_", "WR_FIREPLACE_", "WR_DESK_", "WR_CREST_",
        "WR_WINDOW_", "WR_CANON_", "WR_ANCHOR_right_fireplace_practical",
    )
    forbidden = sorted(name for name in names if name.startswith(forbidden_prefixes))
    if forbidden:
        raise RuntimeError(f"War Room v3 inherited v2 visual geometry: {forbidden[:12]}")
    if sum(1 for name in names if name == "WR_ANCHOR_fireplace_practical") != 1:
        raise RuntimeError("War Room v3 must contain exactly one fireplace practical")


def validate_runtime_glb_v3(path, expected_factors):
    data = base.read_glb_json(path)
    extensions_used = set(data.get("extensionsUsed", []))
    if base.MESH_COMPRESSION_EXTENSION not in extensions_used:
        raise RuntimeError(
            f"War Room v3 runtime GLB missing {base.MESH_COMPRESSION_EXTENSION}: {sorted(extensions_used)}"
        )
    compressed_views = sum(
        1 for row in data.get("bufferViews", [])
        if base.MESH_COMPRESSION_EXTENSION in row.get("extensions", {})
    )
    if compressed_views < 12:
        raise RuntimeError(f"War Room v3 meshopt coverage suspiciously small: {compressed_views}")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    required_nodes = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
    }
    missing = sorted(required_nodes - node_names)
    if missing:
        raise RuntimeError(f"War Room v3 runtime nodes missing: {missing}")
    if "WR_ANCHOR_right_fireplace_practical" in node_names:
        raise RuntimeError("War Room v3 runtime contains a secondary-hearth anchor")

    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_materials = {
        "WR3_MAT_warm_travertine",
        "WR3_MAT_radial_slate",
        "WR3_MAT_deep_teal_enamel",
        "WR3_MAT_patinated_copper",
        "WR3_MAT_sunlit_brass",
        "WR3_MAT_chart_walnut",
        "WR3_MAT_chart_green_leather",
        "WR3_MAT_celestial_blue",
    }
    missing_materials = sorted(required_materials - set(materials))
    if missing_materials:
        raise RuntimeError(f"War Room v3 runtime materials missing: {missing_materials}")
    for name in required_materials:
        factor = materials[name].get("pbrMetallicRoughness", {}).get("baseColorFactor")
        expected = expected_factors.get(name)
        if not isinstance(factor, list) or len(factor) < 3 or min(factor[:3]) >= 0.95:
            raise RuntimeError(f"War Room v3 material lost authored colour: {name}={factor}")
        if expected is not None and any(abs(float(factor[i]) - float(expected[i])) > 0.012 for i in range(3)):
            raise RuntimeError(f"War Room v3 material factor drift: {name}={factor} expected={expected}")


def export_shell_v3(path):
    sanitized_links, runtime_textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = sanitized_links
    scene["war_room_runtime_texture_count"] = runtime_textures
    source_meshes, batched_meshes, merged_away = base.collapse_runtime_static_shell()
    base.WEATHER_MATERIALS = V3_WEATHER_MATERIALS
    base.strip_unused_weather_layers()
    print(f"War Room v3 runtime batching: {source_meshes} -> {batched_meshes} meshes ({merged_away} merged)")

    bpy.ops.object.select_all(action="DESELECT")
    runtime_anchors = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
    }
    selected = 0
    for obj in scene.objects:
        is_static_mesh = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_runtime_anchor = obj.type == "EMPTY" and obj.name in runtime_anchors
        if is_static_mesh or is_runtime_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 50:
        raise RuntimeError(f"War Room v3 runtime shell selection too small: {selected}")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
        **base.meshopt_export_kwargs(),
    )
    patched = base.patch_runtime_glb_base_color_factors(path, factors)
    scene["war_room_runtime_base_color_factor_count"] = patched
    scene["war_room_runtime_mesh_compression"] = base.MESH_COMPRESSION_EXTENSION
    validate_runtime_glb_v3(path, factors)
    bpy.ops.object.select_all(action="DESELECT")


def main():
    options = base.args()
    base.CONTRACT = CONTRACT
    base.wipe()
    base.build()
    base.validate()
    apply_v3_identity()
    validate_v3()

    blend = Path(options.blend)
    glb = Path(options.glb)
    preview = Path(options.preview)
    manifest = Path(options.manifest)
    for path in (blend, glb, preview, manifest):
        path.parent.mkdir(parents=True, exist_ok=True)
    base.manifest(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    base.render(preview)
    export_shell_v3(glb)
    print(f"War Room v3 OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
