#!/usr/bin/env python3
"""Build the independent War Room v4 "Celestial Observatory" shell.

V3 keeps only the live-board anchor and canonical camera from the v2 generator.
Its authored room is rebuilt from an empty static collection: a curved tower
apse, circular command table, celestial window, single cast-iron stove,
restrained brass telescope, premium reading nook, celestial globe console and grounded tower entry
replace v2's rectangular hall.
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


CONTRACT = "war-room-golden-observatory-v4"
V4_CANON = "war-room-v4-moonlit-royal-observatory-2026-09-29"
V4_CAMERA_FOV_DEG = 22.0
V4_CAMERA_HALF_SPAN = 5.10
V4_CAMERA_PADDING = 1.015
V4_CAMERA_TARGET = (0.0, 0.42, 2.08)
V4_CAMERA_DIRECTION = (0.0, -10.2, 7.75)
V4_WALL_RADIUS = 8.72
V4_WALL_CENTER_Y = -0.72
V4_WALL_START_DEG = -112.0
V4_WALL_END_DEG = 112.0
V4_WALL_SEGMENT_COUNT = 19
# Snap the entry to an authored wall bay so the door plane is truly tangent to
# the same circular shell instead of looking like a freestanding prop.
V4_ENTRY_THETA_DEG = -76.0
V4_ENTRY_DOOR_Z = 1.90

V4_WEATHER_MATERIALS = frozenset({
    "WR4_MAT_warm_travertine",
    "WR4_MAT_pale_travertine",
    "WR4_MAT_radial_slate",
    "WR4_MAT_green_marble",
})


def clear_inherited_room(static):
    """Keep the proven camera; v4 owns every visible static mesh and light."""
    removed = 0
    for obj in list(static.objects):
        if obj.name == "WR_CAMERA_hero":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)
        removed += 1
    if removed < 180:
        raise RuntimeError(f"War Room v4 inherited-room teardown suspiciously small: {removed}")


def build_v4_palette():
    return {
        "stone": base.material(
            "WR4_MAT_warm_travertine", (0.33, 0.205, 0.105, 1),
            rough=0.77, coat=0.014, texture="stone", scale=4.3, bump=0.068, weather=True,
        ),
        "stone_light": base.material(
            "WR4_MAT_pale_travertine", (0.56, 0.395, 0.215, 1),
            rough=0.61, coat=0.050, texture="stone", scale=3.6, bump=0.042, weather=True,
        ),
        "slate": base.material(
            "WR4_MAT_radial_slate", (0.030, 0.070, 0.078, 1),
            rough=0.78, coat=0.014, texture="stone", scale=5.0, bump=0.052, weather=True,
        ),
        "green_marble": base.material(
            "WR4_MAT_green_marble", (0.010, 0.082, 0.052, 1),
            rough=0.40, coat=0.18, texture="stone", scale=3.5, bump=0.030, weather=True,
        ),
        "rug": base.material(
            "WR4_MAT_room_rug", (0.004, 0.070, 0.046, 1),
            rough=0.82, coat=0.02, sheen=0.18, texture="leather", scale=60, bump=0.055,
        ),
        "rug_red": base.material(
            "WR4_MAT_entry_rug", (0.22, 0.020, 0.014, 1),
            rough=0.74, coat=0.03, sheen=0.12, texture="leather", scale=52, bump=0.050,
        ),
        "book_red": base.material(
            "WR4_MAT_book_red", (0.22, 0.018, 0.012, 1),
            rough=0.68, coat=0.04, texture="leather", scale=40, bump=0.025,
        ),
        "book_blue": base.material(
            "WR4_MAT_book_blue", (0.018, 0.052, 0.105, 1),
            rough=0.66, coat=0.04, texture="leather", scale=40, bump=0.025,
        ),
        "teal": base.material(
            "WR4_MAT_deep_teal_enamel", (0.006, 0.105, 0.110, 1),
            rough=0.34, coat=0.38, texture="metal", scale=22, bump=0.018,
        ),
        "copper": base.material(
            "WR4_MAT_patinated_copper", (0.055, 0.275, 0.210, 1),
            metal=0.82, rough=0.37, coat=0.12, texture="metal", scale=26, bump=0.024,
        ),
        "brass": base.material(
            "WR4_MAT_sunlit_brass", (0.66, 0.305, 0.052, 1),
            metal=0.94, rough=0.20, coat=0.28, texture="metal", scale=31, bump=0.012,
        ),
        "brass_dark": base.material(
            "WR4_MAT_aged_brass", (0.22, 0.086, 0.017, 1),
            metal=0.92, rough=0.31, coat=0.18, texture="metal", scale=33, bump=0.013,
        ),
        "walnut": base.material(
            "WR4_MAT_chart_walnut", (0.128, 0.044, 0.014, 1),
            rough=0.34, coat=0.32, texture="wood", scale=2.5, bump=0.056,
        ),
        "walnut_dark": base.material(
            "WR4_MAT_chart_walnut_dark", (0.044, 0.014, 0.006, 1),
            rough=0.42, coat=0.22, texture="wood", scale=2.4, bump=0.048,
        ),
        "leather": base.material(
            "WR4_MAT_saddle_leather", (0.125, 0.030, 0.012, 1),
            rough=0.39, coat=0.24, sheen=0.15, texture="leather", scale=54, bump=0.044,
        ),
        "green_leather": base.material(
            "WR4_MAT_chart_green_leather", (0.007, 0.105, 0.050, 1),
            rough=0.37, coat=0.28, sheen=0.17, texture="leather", scale=56, bump=0.045,
        ),
        "night": base.material(
            "WR4_MAT_celestial_blue", (0.002, 0.018, 0.120, 1),
            rough=0.18, coat=0.52, emission=(0.006, 0.055, 0.25, 1), emission_strength=0.65,
        ),
        "aurora": base.material(
            "WR4_MAT_aurora_glass", (0.010, 0.235, 0.175, 1),
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
    """Build the canonical circular room: tiled floor, rug and curved paneled wall."""
    base.cylinder("WR4_OBS_floor", (0, 0.0, -0.14), 9.05, 0.24,
                  palette["slate"], static, vertices=96)

    # Golden observatory: ivory/green marble establishes the premium circular dais.
    tile_size = 1.46
    tile_half = 0.710
    tile_index = 0
    for row in range(-6, 7):
        for col in range(-6, 7):
            x = col * tile_size
            y = row * tile_size - 0.18
            if x * x + (y + 0.18) * (y + 0.18) > 8.28 * 8.28:
                continue
            # Ivory is the field; green appears as sparse marble inlays rather
            # than a checkerboard competing with the playable chessboard.
            green_inlay = ((row * 7 + col * 11) % 13 == 0)
            material = palette["green_marble"] if green_inlay else palette["stone_light"]
            base.cube(
                f"WR4_OBS_floor_tile_{tile_index}", (x, y, 0.010),
                (tile_half, tile_half, 0.030), material, static, bevel=0.018,
            )
            tile_index += 1

    # A thin brass perimeter inlay makes the green/ivory marble floor read as
    # an authored circular observatory surface without competing with the board.
    base.torus("WR4_OBS_floor_perimeter_inlay", (0, -0.18, 0.050), 8.05, 0.026,
               palette["brass_dark"], static)

    # Canonical 2026-09-29 composition: a burgundy board carpet sits over the
    # green marble ring, with a narrow green heraldic runner aimed at the player.
    # This gives the board a premium visual pedestal without adding UI chrome.
    base.cylinder("WR4_OBS_rug_field", (0, -0.05, 0.070), 5.78, 0.040,
                  palette["rug"], static, vertices=96)
    base.torus("WR4_OBS_rug_outer_ring", (0, -0.05, 0.112), 5.54, 0.038,
               palette["brass_dark"], static)
    base.torus("WR4_OBS_rug_inner_ring", (0, -0.05, 0.114), 5.20, 0.022,
               palette["brass"], static)
    base.cube("WR4_OBS_board_rug_border", (0, -0.06, 0.125), (5.48, 5.18, 0.028),
              palette["brass_dark"], static, bevel=0.11)
    base.cube("WR4_OBS_board_rug_red", (0, -0.06, 0.158), (5.33, 5.03, 0.020),
              palette["rug_red"], static, bevel=0.10)
    base.cube("WR4_OBS_heraldic_runner_border", (0, -5.52, 0.172), (1.20, 1.72, 0.018),
              palette["brass_dark"], static, bevel=0.08)
    base.cube("WR4_OBS_heraldic_runner", (0, -5.52, 0.194), (1.05, 1.62, 0.016),
              palette["rug"], static, bevel=0.07)

    radius = V4_WALL_RADIUS
    center_y = V4_WALL_CENTER_Y
    segment_count = V4_WALL_SEGMENT_COUNT
    start = math.radians(V4_WALL_START_DEG)
    end = math.radians(V4_WALL_END_DEG)
    step = (end - start) / segment_count
    half_length = radius * step * 0.515
    joints = []
    for index in range(segment_count):
        theta = start + (index + 0.5) * step
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        tangent = math.atan2(-math.sin(theta), math.cos(theta))
        lower = base.cube(
            f"WR4_OBS_apse_lower_{index}", (x, y, 1.48),
            (half_length, 0.20, 1.48), palette["walnut_dark"], static, bevel=0.055,
        )
        lower.rotation_euler.z = tangent
        upper = base.cube(
            f"WR4_OBS_apse_upper_{index}", (x, y, 4.72),
            (half_length, 0.18, 1.76), palette["walnut"], static, bevel=0.075,
        )
        upper.rotation_euler.z = tangent
        # Golden observatory: framed walnut panels add architectural depth
        # without stealing silhouette from the board or lunar oculus.
        panel = base.cube(
            f"WR4_OBS_apse_panel_{index}", (x, y - 0.17, 3.42),
            (half_length * 0.76, 0.065, 0.84), palette["walnut"], static, bevel=0.045,
        )
        panel.rotation_euler.z = tangent
        rail = base.cube(
            f"WR4_OBS_apse_brass_rail_{index}", (x, y - 0.235, 2.53),
            (half_length * 0.80, 0.022, 0.030), palette["brass_dark"], static, bevel=0.012,
        )
        rail.rotation_euler.z = tangent
        joints.append((theta - step / 2.0, index))
    joints.append((end, segment_count))

    for theta, index in joints:
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        base.cylinder(
            f"WR4_OBS_apse_pilaster_{index}", (x, y - 0.10, 3.42), 0.19, 6.34,
            palette["walnut_dark"], static, vertices=32,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_{index}", (x, y, 3.48), 0.105, 6.56,
            palette["walnut_dark"], static, vertices=32,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_foot_{index}", (x, y, 0.30), 0.23, 0.30,
            palette["brass_dark"], static, vertices=40,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_cap_{index}", (x, y, 6.55), 0.16, 0.16,
            palette["brass"], static, vertices=36,
        )


def build_celestial_window(static, palette):
    """Large moon-and-stars oculus: deliberately no orbital rings or chart lines."""
    cx, cy, cz = 0.0, 7.56, 4.05
    glass = base.cylinder(
        "WR4_OBS_celestial_window", (cx, cy, cz), 2.62, 0.085,
        palette["night"], static, vertices=96,
    )
    glass.rotation_euler.x = math.pi / 2
    base.torus(
        "WR4_OBS_celestial_window_outer", (cx, cy - 0.07, cz), 2.94, 0.145,
        palette["brass"], static, rotation=(math.pi / 2, 0, 0),
    )
    base.torus(
        "WR4_OBS_celestial_window_inner", (cx, cy - 0.12, cz), 2.70, 0.085,
        palette["walnut_dark"], static, rotation=(math.pi / 2, 0, 0),
    )
    base.torus(
        "WR4_OBS_celestial_window_reveal", (cx, cy + 0.02, cz), 3.18, 0.22,
        palette["walnut_dark"], static, rotation=(math.pi / 2, 0, 0),
    )
    base.torus(
        "WR4_OBS_celestial_window_halo", (cx, cy - 0.10, cz), 3.08, 0.050,
        palette["brass_dark"], static, rotation=(math.pi / 2, 0, 0),
    )
    # Deep stepped reveal keeps the oculus reading as architecture, not a flat screen.
    base.torus(
        "WR4_OBS_celestial_window_reveal_inner", (cx, cy - 0.155, cz), 2.79, 0.055,
        palette["brass_dark"], static, rotation=(math.pi / 2, 0, 0),
    )
    base.torus(
        "WR4_OBS_celestial_window_reveal_shadow", (cx, cy + 0.10, cz), 3.30, 0.075,
        palette["walnut_dark"], static, rotation=(math.pi / 2, 0, 0),
    )

    crescent_center = Vector((-0.92, cy - 0.255, cz + 0.66))
    crescent = base.cylinder(
        "WR4_OBS_window_crescent", crescent_center, 0.50, 0.040,
        palette["ivory"], static, vertices=64,
    )
    crescent.rotation_euler.x = math.pi / 2
    occluder = base.cylinder(
        "WR4_OBS_window_crescent_cutout",
        crescent_center + Vector((0.18, -0.028, 0.06)),
        0.47, 0.046, palette["night"], static, vertices=64,
    )
    occluder.rotation_euler.x = math.pi / 2

    stars = (
        (-1.55, 1.28, 0.025), (-1.15, 1.08, 0.032), (-0.56, 1.42, 0.022),
        (0.02, 1.22, 0.035), (0.52, 1.47, 0.024), (1.08, 1.18, 0.030),
        (1.52, 0.92, 0.024), (-1.72, 0.55, 0.020), (-1.22, 0.36, 0.028),
        (-0.30, 0.66, 0.021), (0.24, 0.78, 0.027), (0.82, 0.48, 0.021),
        (1.42, 0.28, 0.032), (-1.52, -0.08, 0.027), (-0.96, -0.36, 0.020),
        (-0.42, -0.04, 0.024), (0.18, -0.30, 0.032), (0.72, -0.02, 0.020),
        (1.20, -0.42, 0.026), (-1.24, -0.82, 0.022), (-0.62, -1.04, 0.030),
        (0.02, -0.78, 0.021), (0.56, -1.12, 0.026), (1.26, -0.94, 0.022),
    )
    for index, (dx, dz, radius) in enumerate(stars):
        base.sphere(
            f"WR4_OBS_window_star_{index}", (cx + dx, cy - 0.25, cz + dz),
            radius, palette["ivory"] if index % 4 else palette["brass"], static,
            scale=(1.0, 0.24, 1.0),
        )

    # Broad folded green drapery frames the lunar oculus while keeping the glass clear.
    for side in (-1, 1):
        x = side * 3.55
        curtain = base.cube(
            f"WR4_OBS_window_drape_{side}", (x, 7.34, 4.22),
            (0.64, 0.12, 1.92), palette["green_leather"], static, bevel=0.20,
        )
        curtain.rotation_euler.y = math.radians(side * 3)
        for fold in (-0.34, 0.0, 0.34):
            base.cube(
                f"WR4_OBS_window_drape_fold_{side}_{fold:+.2f}",
                (x + fold, 7.19, 4.22), (0.10, 0.055, 1.78),
                palette["teal"], static, bevel=0.055,
            )
        base.cube(
            f"WR4_OBS_window_drape_tie_{side}", (side * 3.43, 7.08, 3.72),
            (0.48, 0.055, 0.055), palette["brass"], static, bevel=0.025,
        )

    window_light = base.light(
        "WR4_LIGHT_window", "AREA", (0, 5.80, 4.55), 485.0,
        (0.16, 0.42, 1.0), static, size=5.8,
    )
    base.look_at(window_light, (0, 0.2, 1.1))
    base.anchor("WR_ANCHOR_window_moonlight", (0, 5.9, 4.55), static)


def build_round_command_table(static, palette):
    base.cylinder("WR4_OBS_table_drum", (0, 0, 0.47), 5.16, 0.62,
                  palette["walnut_dark"], static, vertices=96)
    base.cylinder("WR4_OBS_table_leather_top", (0, 0, 0.84), 5.04, 0.10,
                  palette["green_leather"], static, vertices=96)
    base.torus("WR4_OBS_table_brass_edge", (0, 0, 0.905), 5.04, 0.052,
               palette["brass"], static)
    base.torus("WR4_OBS_table_copper_inlay", (0, 0, 0.925), 4.92, 0.020,
               palette["copper"], static)
    base.cube("WR4_OBS_board_cradle", (0, 0, 0.98), (4.94, 4.94, 0.085),
              palette["walnut"], static, bevel=0.14)
    for side in (-1, 1):
        base.cube(f"WR4_OBS_board_brass_x_{side}", (0, side * 4.81, 1.075),
                  (4.74, 0.035, 0.035), palette["brass"], static, bevel=0.018)
        base.cube(f"WR4_OBS_board_brass_y_{side}", (side * 4.81, 0, 1.075),
                  (0.035, 4.74, 0.035), palette["brass"], static, bevel=0.018)
    base.cube("WR4_OBS_table_cartouche", (0, -5.17, 0.55), (0.78, 0.055, 0.22),
              palette["brass_dark"], static, bevel=0.18)
    base.torus("WR4_OBS_table_cartouche_ring", (0, -5.24, 0.56), 0.16, 0.032,
               palette["brass"], static, rotation=(math.pi / 2, 0, 0))


def build_white_fireplace(static, palette):
    """Canonical pale masonry fireplace from the approved V4 golden."""
    x, y = -5.65, 4.48
    # Broad ivory surround: visually warm/architectural, not a freestanding stove.
    base.cube("WR4_OBS_fireplace_plinth", (x, y, 0.30), (1.42, 0.62, 0.20),
              palette["stone_light"], static, bevel=0.10)
    base.cube("WR4_OBS_fireplace_body", (x, y + 0.14, 1.64), (1.48, 0.52, 1.32),
              palette["stone_light"], static, bevel=0.12)
    base.cube("WR4_OBS_fireplace_opening", (x, y - 0.43, 1.32), (0.88, 0.10, 0.72),
              palette["charcoal"], static, bevel=0.10)
    base.cube("WR4_OBS_fireplace_mantel", (x, y - 0.02, 3.03), (1.66, 0.67, 0.16),
              palette["stone_light"], static, bevel=0.10)
    base.cube("WR4_OBS_fireplace_mantel_trim", (x, y - 0.73, 2.89), (1.42, 0.05, 0.06),
              palette["brass_dark"], static, bevel=0.025)
    for side in (-1, 1):
        base.cube(f"WR4_OBS_fireplace_jamb_{side}", (x + side * 1.08, y - 0.36, 1.50),
                  (0.20, 0.16, 1.05), palette["stone_light"], static, bevel=0.08)
        base.cube(f"WR4_OBS_fireplace_cap_{side}", (x + side * 1.08, y - 0.38, 2.58),
                  (0.28, 0.18, 0.12), palette["stone"], static, bevel=0.06)

    fire_center = Vector((x, y - 0.58, 1.23))
    flame_body = base.sphere("WR4_OBS_fireplace_flame_body", fire_center,
                             0.36, palette["fire"], static, scale=(1.45, 0.20, 0.70))
    flame_body["war_room_runtime_dynamic"] = "v4-fire"
    for index, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.32, 0.02, 0.34, 1.10, -0.14),
        (0.00, 0.20, 0.30, 1.55, 0.10),
        (0.30, -0.01, 0.30, 1.02, 0.20),
    )):
        tongue = base.sphere(
            f"WR4_OBS_fireplace_flame_{index}", fire_center + Vector((dx, -0.03, dz)),
            0.25, palette["fire_core"] if index == 1 else palette["fire"], static,
            scale=(sx, 0.18, sz),
        )
        tongue.rotation_euler.y = tilt
        tongue["war_room_runtime_dynamic"] = "v4-fire"
    for log_x in (-0.38, 0.0, 0.38):
        log = base.cylinder(f"WR4_OBS_fireplace_log_{log_x:+.2f}",
                            (x + log_x, y - 0.54, 0.86), 0.10, 0.95,
                            palette["walnut_dark"], static, vertices=20)
        log.rotation_euler.y = math.pi / 2

    base.light("WR4_LIGHT_fireplace", "POINT", (x, y - 1.12, 1.58), 430.0,
               (1.0, 0.27, 0.045), static, radius=2.05)
    base.anchor("WR_ANCHOR_fireplace_practical", (x, y - 0.82, 1.65), static)


def build_oculus_desk(static, palette):
    """Low walnut writing desk directly below the lunar oculus."""
    x, y = 0.0, 5.55
    base.cube("WR4_OBS_oculus_desk_top", (x, y, 1.34), (2.60, 0.52, 0.09),
              palette["walnut"], static, bevel=0.055)
    for side in (-1, 1):
        base.cube(f"WR4_OBS_oculus_desk_pedestal_{side}", (side * 1.72, y + 0.05, 0.73),
                  (0.55, 0.44, 0.58), palette["walnut_dark"], static, bevel=0.05)
        for row, z in enumerate((0.48, 0.76, 1.03)):
            base.cube(f"WR4_OBS_oculus_desk_drawer_{side}_{row}",
                      (side * 1.72, y - 0.43, z), (0.43, 0.035, 0.10),
                      palette["walnut"], static, bevel=0.02)
            base.sphere(f"WR4_OBS_oculus_desk_pull_{side}_{row}",
                        (side * 1.72, y - 0.48, z), 0.032, palette["brass"], static)
    # Sparse books and green-shaded lamp: recognizable at hero distance without clutter.
    for index, (dx, mat) in enumerate(((-1.05, "book_red"), (-0.72, "book_blue"), (0.58, "book_red"))):
        base.cube(f"WR4_OBS_oculus_desk_book_{index}", (dx, y - 0.15, 1.48 + index * 0.035),
                  (0.25, 0.20, 0.045), palette[mat], static, bevel=0.018)
    base.cylinder("WR4_OBS_oculus_lamp_stem", (1.32, y - 0.10, 1.72), 0.045, 0.48,
                  palette["brass"], static, vertices=24)
    base.cylinder("WR4_OBS_oculus_lamp_shade", (1.32, y - 0.10, 2.00), 0.28, 0.16,
                  palette["green_leather"], static, vertices=40)
    base.light("WR4_LIGHT_oculus_desk", "POINT", (1.32, y - 0.55, 1.86), 76.0,
               (1.0, 0.58, 0.25), static, radius=0.85)


def build_library_wall(static, palette):
    """Integrated right-wall library from the golden composition."""
    x, y = 6.15, 4.45
    base.cube("WR4_OBS_library_back", (x, y, 2.35), (1.25, 0.34, 2.12),
              palette["walnut_dark"], static, bevel=0.07)
    for shelf, z in enumerate((0.62, 1.38, 2.14, 2.90, 3.66)):
        base.cube(f"WR4_OBS_library_shelf_{shelf}", (x, y - 0.37, z), (1.18, 0.36, 0.065),
                  palette["walnut"], static, bevel=0.03)
    book_index = 0
    for row, z in enumerate((0.92, 1.68, 2.44, 3.20)):
        for col in range(8):
            bx = x - 0.93 + col * 0.27
            mat = palette["book_red"] if (row + col) % 3 == 0 else palette["book_blue"]
            base.cube(f"WR4_OBS_library_book_{book_index}", (bx, y - 0.63, z),
                      (0.09, 0.16, 0.25 + 0.025 * ((row + col) % 2)),
                      mat, static, bevel=0.014)
            book_index += 1
    base.cube("WR4_OBS_library_crown", (x, y - 0.08, 4.55), (1.36, 0.42, 0.13),
              palette["walnut"], static, bevel=0.06)
    base.cube("WR4_OBS_library_crown_brass", (x, y - 0.52, 4.48), (1.18, 0.025, 0.035),
              palette["brass"], static, bevel=0.015)


def build_armor_pair(static, palette):
    """Two restrained ceremonial suits framing the room without stealing board focus."""
    for side in (-1, 1):
        x, y = side * 6.55, 2.85
        base.cylinder(f"WR4_OBS_armor_base_{side}", (x, y, 0.22), 0.48, 0.16,
                      palette["walnut_dark"], static, vertices=36)
        base.cube(f"WR4_OBS_armor_torso_{side}", (x, y, 1.32), (0.38, 0.25, 0.44),
                  palette["iron"], static, bevel=0.12)
        base.cube(f"WR4_OBS_armor_waist_{side}", (x, y, 0.93), (0.30, 0.22, 0.16),
                  palette["charcoal"], static, bevel=0.07)
        for leg in (-1, 1):
            base.cube(f"WR4_OBS_armor_leg_{side}_{leg}", (x + leg * 0.16, y, 0.57),
                      (0.10, 0.11, 0.24), palette["iron"], static, bevel=0.05)
        for shoulder in (-1, 1):
            base.sphere(f"WR4_OBS_armor_pauldron_{side}_{shoulder}",
                        (x + shoulder * 0.43, y, 1.55), 0.20,
                        palette["iron"], static, scale=(1.25, 0.75, 0.70))
        base.cube(f"WR4_OBS_armor_helmet_{side}", (x, y, 1.99), (0.25, 0.22, 0.24),
                  palette["iron"], static, bevel=0.12)
        base.cube(f"WR4_OBS_armor_visor_{side}", (x, y - 0.23, 1.98), (0.20, 0.025, 0.04),
                  palette["charcoal"], static, bevel=0.012)
        shaft_x = x - side * 0.48
        base.cylinder(f"WR4_OBS_armor_halberd_{side}", (shaft_x, y, 1.65), 0.025, 2.75,
                      palette["brass_dark"], static, vertices=16)


def build_observatory_telescope(static, palette):
    """A restrained premium telescope: legible, but secondary to the board and oculus."""
    hub = Vector((4.82, 4.46, 1.05))
    base.sphere("WR4_OBS_telescope_mount", hub, 0.16, palette["brass_dark"], static,
                scale=(1.08, 1.08, 0.90))
    base.cylinder("WR4_OBS_telescope_mount_ring", hub, 0.25, 0.060,
                  palette["copper"], static, vertices=48)

    tripod_feet = ((4.34, 3.96, 0.14), (5.30, 4.02, 0.14), (4.92, 4.86, 0.14))
    for index, foot in enumerate(tripod_feet):
        cylinder_between(f"WR4_OBS_telescope_tripod_{index}", hub, foot, 0.048,
                         palette["brass_dark"], static, vertices=24)
        base.cylinder(f"WR4_OBS_telescope_foot_{index}", foot, 0.105, 0.050,
                      palette["walnut_dark"], static, vertices=32)

    axis_start = Vector((4.42, 4.24, 1.48))
    axis_end = Vector((5.30, 4.90, 2.08))
    axis = (axis_end - axis_start).normalized()
    cylinder_between("WR4_OBS_telescope_tube", axis_start, axis_end, 0.125,
                     palette["brass"], static, vertices=48)
    cylinder_between("WR4_OBS_telescope_patina", axis_start + axis * 0.25,
                     axis_end - axis * 0.29, 0.138, palette["teal"], static, vertices=48)
    cylinder_between("WR4_OBS_telescope_front_collar", axis_end - axis * 0.12,
                     axis_end + axis * 0.055, 0.165, palette["copper"], static, vertices=48)
    cylinder_between("WR4_OBS_telescope_lens", axis_end + axis * 0.056,
                     axis_end + axis * 0.075, 0.132, palette["night"], static, vertices=48)
    cylinder_between("WR4_OBS_telescope_eyepiece", axis_start - axis * 0.22,
                     axis_start + axis * 0.015, 0.062, palette["brass_dark"], static, vertices=36)
    cylinder_between("WR4_OBS_telescope_focus_ring", axis_start - axis * 0.035,
                     axis_start + axis * 0.055, 0.148, palette["copper"], static, vertices=40)
    cylinder_between("WR4_OBS_telescope_dew_shield", axis_end - axis * 0.015,
                     axis_end + axis * 0.18, 0.176, palette["brass_dark"], static, vertices=48)
    base.torus("WR4_OBS_telescope_mount_trim", hub + Vector((0, 0, 0.015)),
               0.27, 0.021, palette["brass"], static)

    yoke_left = hub + Vector((-0.25, 0.0, 0.20))
    yoke_right = hub + Vector((0.25, 0.0, 0.20))
    cylinder_between("WR4_OBS_telescope_yoke", yoke_left, yoke_right, 0.056,
                     palette["brass"], static, vertices=28)
    for side, point in (("left", yoke_left), ("right", yoke_right)):
        base.sphere(f"WR4_OBS_telescope_yoke_cap_{side}", point, 0.085,
                    palette["copper"], static)

def build_lounge_corner(static, palette):
    """Compact club chair and side table from the canonical mock."""
    x, y = 6.72, -1.72
    chair_yaw = math.radians(-83)

    # Classic club-chair silhouette: padded cuboids read better at game camera
    # distance than the previous bulbous sphere-based back and arms.
    base.cube(
        "WR4_OBS_chair_seat", (x, y, 0.58), (0.76, 0.60, 0.16),
        palette["walnut_dark"], static, bevel=0.18,
    )
    back = base.cube(
        "WR4_OBS_chair_back", (x, y + 0.50, 1.34), (0.76, 0.19, 0.74),
        palette["green_leather"], static, bevel=0.32,
    )
    back.rotation_euler.x = math.radians(-7)
    back_pad = base.cube(
        "WR4_OBS_chair_back_pad", (x, y + 0.29, 1.34), (0.57, 0.11, 0.52),
        palette["green_leather"], static, bevel=0.22,
    )
    back_pad.rotation_euler.x = math.radians(-7)

    for side in (-1, 1):
        base.cube(
            f"WR4_OBS_chair_wing_{side}", (x + side * 0.62, y + 0.40, 1.35),
            (0.12, 0.22, 0.54), palette["leather"], static, bevel=0.16,
        )
        base.cube(
            f"WR4_OBS_chair_arm_{side}", (x + side * 0.77, y - 0.03, 0.91),
            (0.16, 0.53, 0.17), palette["leather"], static, bevel=0.16,
        )
        for front in (-1, 1):
            leg_z = 0.28
            base.cylinder(
                f"WR4_OBS_chair_leg_{side}_{front}",
                (x + side * 0.57, y + front * 0.40, leg_z),
                0.066, 0.34, palette["walnut_dark"], static, vertices=28,
            )
            base.cylinder(
                f"WR4_OBS_chair_leg_tip_{side}_{front}",
                (x + side * 0.57, y + front * 0.40, 0.095),
                0.072, 0.045, palette["brass_dark"], static, vertices=28,
            )
        for stud_index, stud_y in enumerate((-0.34, -0.08, 0.18)):
            base.sphere(
                f"WR4_OBS_chair_stud_{side}_{stud_index}",
                (x + side * 0.94, y + stud_y, 0.93),
                0.026, palette["brass"], static,
            )

    base.cube(
        "WR4_OBS_chair_cushion", (x, y - 0.07, 0.82), (0.61, 0.49, 0.13),
        palette["green_leather"], static, bevel=0.22,
    )
    for side in (-1, 1):
        base.cube(
            f"WR4_OBS_chair_inner_arm_{side}", (x + side * 0.60, y - 0.02, 0.96),
            (0.055, 0.43, 0.13), palette["green_leather"], static, bevel=0.10,
        )
    # A restrained brass foot rail and buttoning make the lounge read as
    # bespoke observatory furniture at the game camera distance.
    base.cube(
        "WR4_OBS_chair_front_rail", (x, y - 0.49, 0.43), (0.58, 0.055, 0.055),
        palette["brass_dark"], static, bevel=0.025,
    )
    for row, z in enumerate((1.18, 1.50)):
        for col, button_x in enumerate((-0.30, 0.0, 0.30)):
            base.sphere(
                f"WR4_OBS_chair_back_button_{row}_{col}",
                (x + button_x, y + 0.165, z),
                0.031, palette["brass_dark"], static,
            )
    for side in (-1, 1):
        base.cylinder(
            f"WR4_OBS_chair_back_brass_rail_{side}",
            (x + side * 0.69, y + 0.305, 1.36), 0.025, 0.92,
            palette["brass_dark"], static, vertices=20,
        )
    pillow = base.cube(
        "WR4_OBS_chair_pillow", (x, y + 0.17, 1.29), (0.39, 0.085, 0.30),
        palette["ivory"], static, bevel=0.15,
    )
    pillow.rotation_euler.x = math.radians(-7)

    # Turn the complete chair inward toward the command board, matching the
    # approved golden composition without moving its lounge-corner footprint.
    chair_parts = [obj for obj in static.objects if obj.name.startswith("WR4_OBS_chair_")]
    for obj in chair_parts:
        dx, dy = obj.location.x - x, obj.location.y - y
        obj.location.x = x + dx * math.cos(chair_yaw) - dy * math.sin(chair_yaw)
        obj.location.y = y + dx * math.sin(chair_yaw) + dy * math.cos(chair_yaw)
        obj.rotation_euler.z += chair_yaw

    tx, ty = 5.72, -2.72
    base.cylinder("WR4_OBS_side_table_top", (tx, ty, 0.78), 0.55, 0.10,
                  palette["walnut"], static, vertices=48)
    base.torus("WR4_OBS_side_table_brass_edge", (tx, ty, 0.835), 0.49, 0.025,
               palette["brass"], static)
    base.cylinder("WR4_OBS_side_table_pedestal", (tx, ty, 0.47), 0.12, 0.56,
                  palette["brass_dark"], static, vertices=32)
    base.cylinder("WR4_OBS_side_table_foot", (tx, ty, 0.17), 0.34, 0.08,
                  palette["walnut_dark"], static, vertices=40)
    base.cylinder("WR4_OBS_side_table_cup", (tx - 0.16, ty, 0.92), 0.10, 0.19,
                  palette["ivory"], static, vertices=32)
    base.cube("WR4_OBS_side_table_book", (tx + 0.15, ty, 0.91), (0.22, 0.16, 0.045),
              palette["book_red"], static, bevel=0.018)


def build_celestial_globe(static, palette):
    """Blue navigation globe on the compact walnut console from the canonical mock."""
    x, y = 6.48, -0.95
    base.cube(
        "WR4_OBS_globe_console_body", (x, y, 0.54), (0.70, 0.32, 0.40),
        palette["walnut_dark"], static, bevel=0.065,
    )
    base.cube(
        "WR4_OBS_globe_console_top", (x, y, 0.98), (0.82, 0.38, 0.065),
        palette["walnut"], static, bevel=0.055,
    )
    for drawer, z in enumerate((0.43, 0.72)):
        base.cube(
            f"WR4_OBS_globe_console_drawer_{drawer}", (x, y - 0.345, z),
            (0.59, 0.025, 0.11), palette["walnut"], static, bevel=0.025,
        )
        base.sphere(
            f"WR4_OBS_globe_console_pull_{drawer}", (x, y - 0.39, z),
            0.042, palette["brass"], static,
        )
    base.cube(
        "WR4_OBS_globe_console_plinth", (x, y, 0.12), (0.76, 0.35, 0.075),
        palette["brass_dark"], static, bevel=0.045,
    )
    center = (x, y, 1.43)
    base.cylinder(
        "WR4_OBS_globe_cradle_foot", (x, y, 1.075), 0.13, 0.08,
        palette["brass_dark"], static, vertices=32,
    )
    base.torus(
        "WR4_OBS_globe_cradle_ring", (x, y, 1.115), 0.15, 0.022,
        palette["brass"], static,
    )
    base.sphere(
        "WR4_OBS_globe_sphere", center, 0.34, palette["night"], static,
        scale=(1.0, 1.0, 1.0),
    )
    base.torus(
        "WR4_OBS_globe_meridian", center, 0.39, 0.025,
        palette["brass"], static, rotation=(math.pi / 2, 0, 0),
    )
    base.torus(
        "WR4_OBS_globe_equator", center, 0.36, 0.018,
        palette["brass_dark"], static,
    )
    # Sparse brass stars make the blue sphere read as a celestial globe at the
    # game camera without turning this secondary corner into another focal point.
    for star, (dx, dz) in enumerate((
        (-0.16, 0.12), (-0.05, 0.22), (0.08, 0.15),
        (0.18, 0.03), (-0.10, -0.08), (0.10, -0.16),
    )):
        dy = math.sqrt(max(0.0, 0.34 ** 2 - dx ** 2 - dz ** 2))
        base.sphere(
            f"WR4_OBS_globe_star_{star}", (x + dx, y - dy, center[2] + dz),
            0.016, palette["brass"], static,
        )


def build_wall_lanterns(static, palette):
    """Warm wall lanterns replace the suspended armillary and keep the ceiling open."""
    for side, x in (("left", -3.15), ("right", 3.15)):
        y, z = 7.30, 4.70
        base.cube(
            f"WR4_OBS_wall_lantern_{side}_plate", (x, y, z),
            (0.24, 0.08, 0.45), palette["walnut_dark"], static, bevel=0.06,
        )
        base.cube(
            f"WR4_OBS_wall_lantern_{side}_glow", (x, y - 0.12, z),
            (0.13, 0.08, 0.27), palette["fire_core"], static, bevel=0.05,
        )
        for dz in (-0.34, 0.34):
            base.cube(
                f"WR4_OBS_wall_lantern_{side}_cap_{dz:+.2f}", (x, y - 0.12, z + dz),
                (0.20, 0.12, 0.055), palette["brass"], static, bevel=0.025,
            )
        for dx in (-0.17, 0.17):
            base.cylinder(
                f"WR4_OBS_wall_lantern_{side}_rail_{dx:+.2f}",
                (x + dx, y - 0.12, z), 0.018, 0.62,
                palette["brass_dark"], static, vertices=16,
            )
        lamp = base.light(
            f"WR4_LIGHT_wall_lantern_{side}", "POINT", (x, y - 0.50, z), 118.0,
            (1.0, 0.44, 0.12), static, radius=1.05,
        )
        lamp["war_room_runtime_dynamic"] = "v4-lantern"
    base.anchor("WR_ANCHOR_chandelier_practical", (0, 6.85, 4.72), static)


def build_tower_entry(static, palette):
    """Tower door sits on a real threshold and has a small entry rug."""
    theta = math.radians(V4_ENTRY_THETA_DEG)
    radial = Vector((math.sin(theta), math.cos(theta), 0.0))
    tangent = Vector((math.cos(theta), -math.sin(theta), 0.0))
    wall = Vector((
        V4_WALL_RADIUS * radial.x,
        V4_WALL_CENTER_Y + V4_WALL_RADIUS * radial.y,
        0.0,
    ))
    # Seat the leaf against the inner face of the authored wall and use the exact
    # tangent of that circular shell. This keeps the whole portal visually welded
    # into the observatory rather than floating a few centimetres in front of it.
    center = wall - radial * 0.205
    angle = math.atan2(tangent.y, tangent.x)
    door_z = V4_ENTRY_DOOR_Z

    door = base.cube(
        "WR4_OBS_entry_door", (center.x, center.y, door_z),
        (0.88, 0.11, 1.80), palette["teal"], static, bevel=0.14,
    )
    door.rotation_euler.z = angle
    inset = base.cube(
        "WR4_OBS_entry_door_inset",
        (center.x - radial.x * 0.12, center.y - radial.y * 0.12, door_z),
        (0.68, 0.035, 1.56), palette["walnut_dark"], static, bevel=0.12,
    )
    inset.rotation_euler.z = angle

    for side in (-1, 1):
        point = center + tangent * (side * 1.02)
        jamb = base.cube(
            f"WR4_OBS_entry_jamb_{side}", (point.x, point.y, 2.02),
            (0.105, 0.20, 1.98), palette["copper"], static, bevel=0.055,
        )
        jamb.rotation_euler.z = angle
    lintel = base.cube(
        "WR4_OBS_entry_lintel", (center.x, center.y, 4.00),
        (1.12, 0.20, 0.11), palette["copper"], static, bevel=0.055,
    )
    lintel.rotation_euler.z = angle
    threshold = base.cube(
        "WR4_OBS_entry_threshold", (center.x, center.y, 0.105),
        (1.12, 0.24, 0.075), palette["brass_dark"], static, bevel=0.040,
    )
    threshold.rotation_euler.z = angle

    front = Vector((center.x, center.y, door_z)) - radial * 0.17
    glass_start = front - radial * 0.035 + Vector((0, 0, 0.72))
    glass_end = front + radial * 0.035 + Vector((0, 0, 0.72))
    cylinder_between(
        "WR4_OBS_entry_porthole", glass_start, glass_end, 0.34,
        palette["night"], static, vertices=56,
    )
    ring = base.torus(
        "WR4_OBS_entry_porthole_ring", glass_start, 0.39, 0.055,
        palette["brass"], static,
    )
    ring.rotation_euler = radial.to_track_quat("Z", "Y").to_euler()

    handle_center = front - tangent * 0.48 + Vector((0, 0, -0.30))
    base.sphere("WR4_OBS_entry_handle_hub", handle_center, 0.105,
                palette["brass_dark"], static)
    cylinder_between(
        "WR4_OBS_entry_handle", handle_center, handle_center + tangent * 0.34,
        0.045, palette["brass"], static, vertices=28,
    )

    rug_center = Vector((center.x, center.y, 0.105)) - radial * 1.10
    rug_border = base.cube(
        "WR4_OBS_entry_rug_border", rug_center, (0.92, 0.61, 0.025),
        palette["brass_dark"], static, bevel=0.07,
    )
    rug_border.rotation_euler.z = angle
    rug = base.cube(
        "WR4_OBS_entry_rug", rug_center + Vector((0, 0, 0.030)),
        (0.82, 0.52, 0.020), palette["rug_red"], static, bevel=0.06,
    )
    rug.rotation_euler.z = angle


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "v4-celestial-observatory"
    scene["war_room_visual_canon"] = V4_CANON
    scene.view_settings.exposure = 0.20

    key = base.light("WR4_LIGHT_key", "AREA", (-4.8, -3.8, 8.3), 585.0,
                     (1.0, 0.62, 0.32), static, size=6.1)
    base.look_at(key, (0, 0.5, 1.0))
    fill = base.light("WR4_LIGHT_fill", "AREA", (6.6, -2.6, 6.6), 500.0,
                      (0.15, 0.42, 1.00), static, size=6.0)
    base.look_at(fill, (0.4, 0.6, 1.5))
    top = base.light("WR4_LIGHT_top", "AREA", (0, 1.4, 8.7), 245.0,
                     (0.90, 0.70, 0.44), static, size=4.8)
    base.look_at(top, (0, 0.4, 0.8))


def apply_v4_camera():
    """Match the approved 2026-09-29 golden: wider board, slightly steeper play angle."""
    scene = bpy.context.scene
    cam = bpy.data.objects.get("WR_CAMERA_hero")
    if cam is None or cam.type != "CAMERA":
        raise RuntimeError("War Room v4 hero camera missing")
    vertical_fov = math.radians(V4_CAMERA_FOV_DEG)
    distance = (V4_CAMERA_HALF_SPAN / math.tan(vertical_fov / 2.0)) * V4_CAMERA_PADDING
    target = Vector(V4_CAMERA_TARGET)
    direction = Vector(V4_CAMERA_DIRECTION).normalized()
    cam.location = target + direction * distance
    cam.data.sensor_width = 36.0
    sensor_height = cam.data.sensor_width / (base.PREVIEW_SIZE[0] / base.PREVIEW_SIZE[1])
    cam.data.lens = sensor_height / (2.0 * math.tan(vertical_fov / 2.0))
    base.look_at(cam, target)
    cam["war_room_camera_profile"] = "v4-golden-wide-steep-v1"
    cam["runtime_vertical_fov_deg"] = V4_CAMERA_FOV_DEG
    cam["runtime_distance"] = round(distance, 5)
    cam["war_room_visual_canon"] = V4_CANON
    scene.camera = cam


def bake_v4_weather():
    base.WEATHER_MATERIALS = V4_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in V4_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_v4_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("War Room v4 static shell missing")
    clear_inherited_room(static)
    palette = build_v4_palette()
    build_curved_observatory(static, palette)
    build_celestial_window(static, palette)
    build_round_command_table(static, palette)
    build_white_fireplace(static, palette)
    build_oculus_desk(static, palette)
    build_library_wall(static, palette)
    build_armor_pair(static, palette)
    build_observatory_telescope(static, palette)
    build_lounge_corner(static, palette)
    build_tower_entry(static, palette)
    build_wall_lanterns(static, palette)
    build_lighting(static)
    apply_v4_camera()
    bake_v4_weather()
    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["war_room_contract"] = CONTRACT
    bpy.context.scene["war_room_contract"] = CONTRACT


def validate_v4():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "WR_ANCHOR_board_origin",
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
        "WR4_OBS_floor",
        "WR4_OBS_floor_tile_0",
        "WR4_OBS_rug_field",
        "WR4_OBS_table_drum",
        "WR4_OBS_celestial_window",
        "WR4_OBS_window_crescent",
        "WR4_OBS_window_star_0",
        "WR4_OBS_fireplace_body",
        "WR4_OBS_fireplace_flame_body",
        "WR4_OBS_oculus_desk_top",
        "WR4_OBS_library_back",
        "WR4_OBS_armor_torso_-1",
        "WR4_OBS_armor_torso_1",
        "WR4_OBS_telescope_tube",
        "WR4_OBS_chair_seat",
        "WR4_OBS_entry_door",
        "WR4_OBS_entry_rug",
        "WR4_OBS_wall_lantern_left_glow",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"War Room v4 contract objects missing: {missing}")
    forbidden_prefixes = (
        "WR_ARCH_", "WR_TABLE_", "WR_FIREPLACE_", "WR_DESK_", "WR_CREST_",
        "WR_WINDOW_", "WR_CANON_", "WR4_OBS_drafting_", "WR4_OBS_map_",
        "WR_ANCHOR_right_fireplace_practical", "WR4_OBS_window_spoke_",
        "WR4_OBS_window_moon", "WR4_OBS_aurora_", "WR4_OBS_window_orbit_",
        "WR4_OBS_window_constellation_", "WR4_OBS_canopy_rib_", "WR4_OBS_armillary_",
        "WR4_OBS_compass_",
    )
    forbidden = sorted(name for name in names if name.startswith(forbidden_prefixes))
    if forbidden:
        raise RuntimeError(f"War Room v4 inherited v2 visual geometry: {forbidden[:12]}")
    if sum(1 for name in names if name == "WR_ANCHOR_fireplace_practical") != 1:
        raise RuntimeError("War Room v4 must contain exactly one fireplace practical")

    end_rib = bpy.data.objects.get(f"WR4_OBS_apse_rib_{V4_WALL_SEGMENT_COUNT}")
    door = bpy.data.objects.get("WR4_OBS_entry_door")
    if end_rib is None or door is None:
        raise RuntimeError("War Room v4 shell/entry validation objects missing")
    if V4_WALL_END_DEG < 108 or V4_WALL_START_DEG > -108:
        raise RuntimeError("War Room v4 side shell no longer encloses the lateral room")
    expected_angle = math.radians(-V4_ENTRY_THETA_DEG)
    angle_error = abs(math.atan2(
        math.sin(door.rotation_euler.z - expected_angle),
        math.cos(door.rotation_euler.z - expected_angle),
    ))
    if angle_error > math.radians(0.25):
        raise RuntimeError(
            f"War Room v4 entry lost wall tangent: error={math.degrees(angle_error):.3f}deg"
        )
    if abs(float(door.location.z) - V4_ENTRY_DOOR_Z) > 0.01:
        raise RuntimeError(f"War Room v4 entry door floated vertically: z={door.location.z:.3f}")



def validate_runtime_glb_v4(path, expected_factors):
    data = base.read_glb_json(path)
    extensions_used = set(data.get("extensionsUsed", []))
    if base.MESH_COMPRESSION_EXTENSION not in extensions_used:
        raise RuntimeError(
            f"War Room v4 runtime GLB missing {base.MESH_COMPRESSION_EXTENSION}: {sorted(extensions_used)}"
        )
    compressed_views = sum(
        1 for row in data.get("bufferViews", [])
        if base.MESH_COMPRESSION_EXTENSION in row.get("extensions", {})
    )
    if compressed_views < 12:
        raise RuntimeError(f"War Room v4 meshopt coverage suspiciously small: {compressed_views}")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    required_nodes = {
        "WR_ANCHOR_fireplace_practical",
        "WR_ANCHOR_chandelier_practical",
        "WR_ANCHOR_window_moonlight",
        "WR4_OBS_fireplace_flame_body",
        "WR4_OBS_fireplace_flame_0",
        "WR4_OBS_fireplace_flame_1",
        "WR4_OBS_fireplace_flame_2",
    }
    missing = sorted(required_nodes - node_names)
    if missing:
        raise RuntimeError(f"War Room v4 runtime nodes missing: {missing}")
    if "WR_ANCHOR_right_fireplace_practical" in node_names:
        raise RuntimeError("War Room v4 runtime contains a secondary-hearth anchor")

    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_materials = {
        "WR4_MAT_warm_travertine",
        "WR4_MAT_radial_slate",
        "WR4_MAT_green_marble",
        "WR4_MAT_room_rug",
        "WR4_MAT_deep_teal_enamel",
        "WR4_MAT_patinated_copper",
        "WR4_MAT_sunlit_brass",
        "WR4_MAT_chart_walnut",
        "WR4_MAT_chart_green_leather",
        "WR4_MAT_celestial_blue",
    }
    missing_materials = sorted(required_materials - set(materials))
    if missing_materials:
        raise RuntimeError(f"War Room v4 runtime materials missing: {missing_materials}")
    for name in required_materials:
        factor = materials[name].get("pbrMetallicRoughness", {}).get("baseColorFactor")
        expected = expected_factors.get(name)
        if not isinstance(factor, list) or len(factor) < 3 or min(factor[:3]) >= 0.95:
            raise RuntimeError(f"War Room v4 material lost authored colour: {name}={factor}")
        if expected is not None and any(abs(float(factor[i]) - float(expected[i])) > 0.012 for i in range(3)):
            raise RuntimeError(f"War Room v4 material factor drift: {name}={factor} expected={expected}")


def export_shell_v4(path, batching=None):
    sanitized_links, runtime_textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = sanitized_links
    scene["war_room_runtime_texture_count"] = runtime_textures
    if batching is None:
        batching = base.collapse_runtime_static_shell()
    source_meshes, batched_meshes, merged_away = batching
    base.WEATHER_MATERIALS = V4_WEATHER_MATERIALS
    base.strip_unused_weather_layers()
    print(f"War Room v4 runtime batching: {source_meshes} -> {batched_meshes} meshes ({merged_away} merged)")

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
        raise RuntimeError(f"War Room v4 runtime shell selection too small: {selected}")
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_cameras=False, export_lights=False,
        **base.meshopt_export_kwargs(),
    )
    patched = base.patch_runtime_glb_base_color_factors(path, factors)
    scene["war_room_runtime_base_color_factor_count"] = patched
    scene["war_room_runtime_mesh_compression"] = base.MESH_COMPRESSION_EXTENSION
    validate_runtime_glb_v4(path, factors)
    bpy.ops.object.select_all(action="DESELECT")


def main():
    options = base.args()
    base.CONTRACT = CONTRACT
    base.wipe()
    base.build()
    base.validate()
    apply_v4_identity()
    validate_v4()

    blend = Path(options.blend)
    glb = Path(options.glb)
    preview = Path(options.preview)
    manifest = Path(options.manifest)
    for path in (blend, glb, preview, manifest):
        path.parent.mkdir(parents=True, exist_ok=True)
    base.manifest(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    preview_batching = base.collapse_runtime_static_shell()
    print(
        f"War Room v4 preview batching: {preview_batching[0]} -> "
        f"{preview_batching[1]} meshes ({preview_batching[2]} merged)"
    )
    base.render(preview)
    export_shell_v4(glb, preview_batching)
    print(f"War Room v4 OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
