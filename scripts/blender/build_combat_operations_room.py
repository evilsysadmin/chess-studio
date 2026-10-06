#!/usr/bin/env python3
"""Build Combat Chess' independent 3D Operations Room.

This room is not a War Room battle variant. It is the diegetic home for campaign
briefing, deployment, veterans, intel, memorial and quartermaster actions.

Blender owns static architecture, authored lighting and stable anchors. The app
owns roster state, chess legality, interaction and overlays.
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


CONTRACT = "combat-operations-room-v1"
ROOM_HALF_X = 8.6
ROOM_BACK_Y = 7.1
ROOM_FRONT_Y = -6.8
BOARD_DAIS_RADIUS = 4.55
BOARD_TABLE_HALF = 4.55

COMBAT_WEATHER_MATERIALS = frozenset({
    "COMBAT_MAT_wall_stone",
    "COMBAT_MAT_floor_stone",
    "COMBAT_MAT_dais_stone",
    "COMBAT_MAT_limestone",
})


def clear_inherited_room(static):
    """Keep only the proven preview camera from the inherited War Room builder."""
    for obj in list(static.objects):
        if obj.name == "WR_CAMERA_hero":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def palette():
    return {
        "wall": base.material(
            "COMBAT_MAT_wall_stone", (0.065, 0.070, 0.064, 1),
            rough=0.92, texture="stone", scale=5.8, bump=0.095, weather=True,
        ),
        "floor": base.material(
            "COMBAT_MAT_floor_stone", (0.040, 0.045, 0.041, 1),
            rough=0.90, texture="stone", scale=5.4, bump=0.075, weather=True,
        ),
        "dais": base.material(
            "COMBAT_MAT_dais_stone", (0.145, 0.138, 0.116, 1),
            rough=0.78, texture="stone", scale=4.0, bump=0.060, weather=True,
        ),
        "limestone": base.material(
            "COMBAT_MAT_limestone", (0.285, 0.265, 0.215, 1),
            rough=0.86, texture="stone", scale=4.0, bump=0.060, weather=True,
        ),
        "oak": base.material(
            "COMBAT_MAT_dark_oak", (0.052, 0.022, 0.010, 1),
            rough=0.48, coat=0.12, texture="wood", scale=2.5, bump=0.055,
        ),
        "oak_mid": base.material(
            "COMBAT_MAT_oak_mid", (0.105, 0.047, 0.016, 1),
            rough=0.50, coat=0.10, texture="wood", scale=2.8, bump=0.050,
        ),
        "iron": base.material(
            "COMBAT_MAT_black_iron", (0.012, 0.015, 0.013, 1),
            metal=0.90, rough=0.50, texture="metal", scale=28, bump=0.020,
        ),
        "brass": base.material(
            "COMBAT_MAT_old_brass", (0.31, 0.155, 0.035, 1),
            metal=0.86, rough=0.40, coat=0.08, texture="metal", scale=30, bump=0.015,
        ),
        "olive": base.material(
            "COMBAT_MAT_field_olive", (0.070, 0.095, 0.052, 1),
            rough=0.80, texture="fabric", scale=44, bump=0.042,
        ),
        "burgundy": base.material(
            "COMBAT_MAT_burgundy", (0.155, 0.018, 0.014, 1),
            rough=0.80, texture="fabric", scale=44, bump=0.042,
        ),
        "parchment": base.material(
            "COMBAT_MAT_parchment", (0.47, 0.365, 0.205, 1),
            rough=0.88, texture="fabric", scale=18, bump=0.018,
        ),
        "ink": base.material(
            "COMBAT_MAT_map_ink", (0.018, 0.022, 0.017, 1), rough=0.88,
        ),
        "wax": base.material(
            "COMBAT_MAT_wax", (0.48, 0.39, 0.22, 1), rough=0.80,
        ),
        "flame": base.material(
            "COMBAT_MAT_flame", (0.95, 0.18, 0.01, 1),
            rough=0.25, emission=(0.75, 0.08, 0.002, 1), emission_strength=1.0,
        ),
        "moon": base.material(
            "COMBAT_MAT_moon_glass", (0.006, 0.018, 0.048, 1),
            rough=0.16, coat=0.42,
            emission=(0.008, 0.035, 0.13, 1), emission_strength=0.72,
        ),
    }


def cylinder_between(name, start, end, radius, material, owner, *, vertices=16):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = base.cylinder(
        name,
        tuple((start + end) / 2.0),
        radius,
        direction.length,
        material,
        owner,
        vertices=vertices,
    )
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def build_floor(static, p):
    base.cube("COMBAT_ROOM_floor", (0, 0.20, -0.12), (8.55, 6.85, 0.12),
              p["floor"], static, bevel=0.035)

    # Broad flagstones keep the room grounded without turning the floor into noise.
    for row in range(-4, 6):
        y = row * 1.20 + 0.35
        for col in range(-6, 7):
            x = col * 1.22 + (0.61 if row % 2 else 0.0)
            if abs(x) > 7.95 or y < -4.95 or y > 6.35:
                continue
            stone = base.cube(
                f"COMBAT_ROOM_flagstone_{row+4}_{col+6}",
                (x, y, 0.015),
                (0.57, 0.55, 0.025),
                p["floor" if (row + col) % 7 else "dais"],
                static,
                bevel=0.018,
            )
            stone.rotation_euler.z = math.radians(((row * 5 + col * 3) % 5 - 2) * 0.25)

    base.cylinder("COMBAT_ROOM_dais", (0, 0.0, 0.18), BOARD_DAIS_RADIUS, 0.34,
                  p["dais"], static, vertices=12)
    base.torus("COMBAT_ROOM_dais_brass", (0, 0.0, 0.37), 4.22, 0.030, p["brass"], static)
    base.torus("COMBAT_ROOM_dais_iron", (0, 0.0, 0.365), 4.46, 0.045, p["iron"], static)


def build_board_table(static, p):
    """A squat campaign table under the live board, never above the square tops."""
    dais_top = 0.35
    pedestal_top = base.BOARD_Z - 0.22
    base.cylinder(
        "COMBAT_ROOM_board_contact_shadow", (0, 0, dais_top + 0.004),
        3.62, 0.008, p["iron"], static, vertices=12,
    )
    base.cylinder(
        "COMBAT_ROOM_board_pedestal", (0, 0, (dais_top + pedestal_top) / 2),
        3.18, pedestal_top - dais_top, p["oak"], static, vertices=12,
    )
    base.cylinder(
        "COMBAT_ROOM_board_pedestal_band", (0, 0, pedestal_top - 0.05),
        3.22, 0.055, p["brass"], static, vertices=12,
    )

    slab_top = base.BOARD_Z - 0.055
    slab_bottom = pedestal_top
    base.cube(
        "COMBAT_ROOM_board_table_top",
        (0, 0, (slab_top + slab_bottom) / 2),
        (BOARD_TABLE_HALF, BOARD_TABLE_HALF, (slab_top - slab_bottom) / 2),
        p["oak_mid"], static, bevel=0.04,
    )

    # Four low brass rails frame the board and keep the interaction cone clean.
    inner = 4.04
    outer = 4.52
    z = base.BOARD_Z - 0.058
    for side in (-1, 1):
        base.cube(
            f"COMBAT_ROOM_board_rail_x_{side}",
            (0, side * ((inner + outer) / 2), z),
            (outer, (outer - inner) / 2, 0.032),
            p["brass"], static, bevel=0.008,
        )
        base.cube(
            f"COMBAT_ROOM_board_rail_y_{side}",
            (side * ((inner + outer) / 2), 0, z),
            ((outer - inner) / 2, inner, 0.032),
            p["brass"], static, bevel=0.008,
        )


def build_architecture(static, p):
    base.cube("COMBAT_ROOM_rear_wall", (0, ROOM_BACK_Y, 3.55), (8.6, 0.36, 3.70),
              p["wall"], static, bevel=0.05)
    base.cube("COMBAT_ROOM_left_wall", (-8.48, 0.10, 3.35), (0.30, 6.65, 3.45),
              p["wall"], static, bevel=0.05)
    base.cube("COMBAT_ROOM_right_wall", (8.48, 0.10, 3.35), (0.30, 6.65, 3.45),
              p["wall"], static, bevel=0.05)

    # Heavy limestone piers create wall bays for each diegetic station.
    for side in (-1, 1):
        for idx, y in enumerate((-3.70, 0.00, 3.75)):
            x = side * 7.90
            base.cube(
                f"COMBAT_ROOM_pier_{side}_{idx}", (x, y, 3.00),
                (0.46, 0.52, 3.00), p["limestone"], static, bevel=0.08,
            )

    # Moonlit slit keeps a cool counterpoint behind the campaign map.
    base.cube("COMBAT_ROOM_window_reveal", (0, 6.76, 5.80), (1.10, 0.23, 1.05),
              p["limestone"], static, bevel=0.10)
    base.cube("COMBAT_ROOM_window_glass", (0, 6.50, 5.80), (0.80, 0.035, 0.82),
              p["moon"], static, bevel=0.08)
    base.cube("COMBAT_ROOM_window_mullion", (0, 6.43, 5.80), (0.045, 0.05, 0.78),
              p["iron"], static, bevel=0.01)

    # Back-wall cornice; no hanging beams across the board.
    base.cube("COMBAT_ROOM_rear_cornice", (0, 6.55, 6.75), (8.10, 0.22, 0.18),
              p["oak"], static, bevel=0.05)


def build_campaign_map(static, p):
    # Large framed parchment map: the room's semantic focal point after the board.
    base.cube("COMBAT_MAP_frame", (0, 6.49, 3.78), (2.72, 0.13, 1.55),
              p["oak"], static, bevel=0.10)
    base.cube("COMBAT_MAP_parchment", (0, 6.30, 3.78), (2.47, 0.035, 1.30),
              p["parchment"], static, bevel=0.05)

    # Simplified campaign topology: route lines + brass pins, readable without text.
    points = [
        (-1.75, 3.30), (-0.95, 4.20), (-0.25, 3.65),
        (0.45, 4.55), (1.15, 3.75), (1.75, 4.45),
    ]
    for idx, (x, z) in enumerate(points):
        base.sphere(
            f"COMBAT_MAP_pin_{idx}", (x, 6.20, z), 0.095,
            p["brass" if idx < len(points) - 1 else "burgundy"], static,
            scale=(1.0, 0.45, 1.0),
        )
    for idx in range(len(points) - 1):
        x0, z0 = points[idx]
        x1, z1 = points[idx + 1]
        cylinder_between(
            f"COMBAT_MAP_route_{idx}",
            (x0, 6.205, z0),
            (x1, 6.205, z1),
            0.025, p["ink"], static, vertices=10,
        )

    # Intel clips and brass rulers sell active planning without UI text.
    for side in (-1, 1):
        base.cube(
            f"COMBAT_MAP_clip_{side}", (side * 2.18, 6.18, 4.92),
            (0.18, 0.025, 0.06), p["brass"], static, bevel=0.015,
        )
    base.cube("COMBAT_MAP_ruler", (0.55, 6.16, 2.82), (0.85, 0.022, 0.035),
              p["brass"], static, bevel=0.012)
    base.anchor("COMBAT_ANCHOR_campaign_map", (0, 5.95, 3.75), static)


def build_barracks(static, p):
    """Left wall: persistent army, ranks and reserves."""
    x = -7.72
    base.cube("COMBAT_BARRACKS_back", (x, 0.15, 3.15), (0.22, 2.25, 2.30),
              p["oak"], static, bevel=0.06)
    for shelf_idx, z in enumerate((1.45, 2.55, 3.65, 4.75)):
        base.cube(
            f"COMBAT_BARRACKS_shelf_{shelf_idx}", (x + 0.30, 0.15, z),
            (0.48, 2.12, 0.07), p["oak_mid"], static, bevel=0.025,
        )

    # Eight restrained unit plinths, not a second chessboard.
    slot = 0
    for z in (1.82, 2.92, 4.02, 5.12):
        for y in (-1.25, 1.25):
            base.cylinder(
                f"COMBAT_BARRACKS_unit_plinth_{slot}", (x + 0.58, y, z),
                0.18, 0.10, p["brass"], static, vertices=12,
            )
            base.sphere(
                f"COMBAT_BARRACKS_helmet_{slot}", (x + 0.58, y, z + 0.23),
                0.16, p["iron"], static, scale=(0.92, 0.80, 1.02),
            )
            slot += 1

    # Three rank chevrons set into the top fascia.
    for idx in range(3):
        z = 5.64 - idx * 0.20
        left = (-7.28, -0.36, z)
        peak = (-7.04, 0.00, z - 0.10)
        right = (-7.28, 0.36, z)
        cylinder_between(f"COMBAT_BARRACKS_chevron_{idx}_a", left, peak, 0.035, p["brass"], static, vertices=10)
        cylinder_between(f"COMBAT_BARRACKS_chevron_{idx}_b", peak, right, 0.035, p["brass"], static, vertices=10)

    base.anchor("COMBAT_ANCHOR_barracks", (-6.95, 0.10, 2.90), static)


def build_memorial(static, p):
    """Right wall: permanent loss is visible, restrained and dignified."""
    x = 7.74
    base.cube("COMBAT_MEMORIAL_slab", (x, 0.70, 3.45), (0.20, 2.10, 2.35),
              p["wall"], static, bevel=0.06)
    base.cube("COMBAT_MEMORIAL_frame", (x - 0.24, 0.70, 3.45), (0.08, 1.78, 2.05),
              p["brass"], static, bevel=0.025)
    base.cube("COMBAT_MEMORIAL_panel", (x - 0.34, 0.70, 3.45), (0.04, 1.63, 1.90),
              p["iron"], static, bevel=0.018)

    # Brass service plaques: enough to read as memorial, no fake names.
    for row in range(4):
        for col in range(2):
            y = -0.35 + col * 1.95
            z = 2.35 + row * 0.72
            base.cube(
                f"COMBAT_MEMORIAL_plaque_{row}_{col}", (x - 0.42, y, z),
                (0.025, 0.70, 0.20), p["brass"], static, bevel=0.025,
            )

    # Candles below the plaques.
    for idx, y in enumerate((-1.10, -0.35, 0.40, 1.15, 1.90)):
        base.cylinder(
            f"COMBAT_MEMORIAL_candle_{idx}", (x - 0.55, y, 1.05),
            0.07, 0.30, p["wax"], static, vertices=14,
        )
        base.sphere(
            f"COMBAT_MEMORIAL_flame_{idx}", (x - 0.55, y, 1.27),
            0.055, p["flame"], static, scale=(0.65, 0.65, 1.35),
        )
    base.anchor("COMBAT_ANCHOR_memorial", (7.00, 0.75, 2.80), static)


def build_quartermaster(static, p):
    """Rear-right station for credits/market and equipment."""
    base.cube("COMBAT_QM_desk", (5.55, 5.72, 1.12), (1.42, 0.58, 0.12),
              p["oak_mid"], static, bevel=0.045)
    for side in (-1, 1):
        base.cube(
            f"COMBAT_QM_leg_{side}", (5.55 + side * 1.12, 5.72, 0.62),
            (0.12, 0.42, 0.55), p["oak"], static, bevel=0.025,
        )
    # Ledger + coin trays.
    base.cube("COMBAT_QM_ledger", (5.15, 5.58, 1.30), (0.46, 0.30, 0.035),
              p["parchment"], static, bevel=0.018)
    for idx in range(5):
        base.cylinder(
            f"COMBAT_QM_coin_{idx}", (5.88 + (idx % 3) * 0.16, 5.52 + (idx // 3) * 0.18, 1.31),
            0.065, 0.025, p["brass"], static, vertices=18,
        )
    # Supply crates.
    for idx, (x, y, s) in enumerate(((6.55, 4.80, 0.50), (5.85, 4.75, 0.38), (6.75, 5.60, 0.34))):
        base.cube(
            f"COMBAT_QM_crate_{idx}", (x, y, 0.42 + s * 0.5),
            (s, s * 0.72, s * 0.50), p["oak"], static, bevel=0.035,
        )
        base.cube(
            f"COMBAT_QM_crate_band_{idx}", (x, y, 0.42 + s * 0.5),
            (s + 0.018, 0.055, s * 0.52), p["iron"], static, bevel=0.012,
        )
    base.anchor("COMBAT_ANCHOR_quartermaster", (5.55, 5.05, 1.65), static)


def build_standards(static, p):
    # Paired campaign standards frame the map without hiding it.
    for side, mat, label in ((-1, p["olive"], "olive"), (1, p["burgundy"], "burgundy")):
        x = side * 3.55
        base.cylinder(f"COMBAT_STANDARD_pole_{label}", (x, 6.10, 3.75), 0.045, 3.75,
                      p["brass"], static, vertices=16)
        base.cube(f"COMBAT_STANDARD_banner_{label}", (x + side * 0.46, 6.05, 4.65),
                  (0.42, 0.035, 0.92), mat, static, bevel=0.035)
        # A single brass chevron on each banner.
        cylinder_between(
            f"COMBAT_STANDARD_mark_{label}_a",
            (x + side * 0.72, 6.00, 4.78),
            (x + side * 0.46, 6.00, 4.55),
            0.035, p["brass"], static, vertices=10,
        )
        cylinder_between(
            f"COMBAT_STANDARD_mark_{label}_b",
            (x + side * 0.46, 6.00, 4.55),
            (x + side * 0.20, 6.00, 4.78),
            0.035, p["brass"], static, vertices=10,
        )


def build_sconces(static, p):
    for side, label in ((-1, "left"), (1, "right")):
        x = side * 7.72
        for idx, y in enumerate((-3.55, 3.55)):
            base.cube(
                f"COMBAT_SCONCE_arm_{label}_{idx}", (x - side * 0.18, y, 3.65),
                (0.22, 0.08, 0.06), p["iron"], static, bevel=0.018,
            )
            base.cylinder(
                f"COMBAT_SCONCE_bowl_{label}_{idx}", (x - side * 0.42, y, 3.72),
                0.23, 0.12, p["iron"], static, vertices=16,
            )
            base.sphere(
                f"COMBAT_SCONCE_flame_{label}_{idx}", (x - side * 0.42, y, 3.93),
                0.11, p["flame"], static, scale=(0.72, 0.72, 1.45),
            )
            base.anchor(
                f"COMBAT_ANCHOR_sconce_{label}_{idx}",
                (x - side * 0.55, y, 3.95),
                static,
            )


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "combat-operations-room"
    scene["combat_operations_room_contract"] = CONTRACT
    scene.view_settings.exposure = 0.12

    top = base.light("COMBAT_LIGHT_board_top", "AREA", (0.0, -0.20, 8.80), 290.0,
                     (0.74, 0.69, 0.57), static, size=4.8)
    base.look_at(top, (0.0, 0.0, 0.75))

    map_key = base.light("COMBAT_LIGHT_map_key", "AREA", (0.0, 5.40, 6.20), 220.0,
                         (0.74, 0.47, 0.22), static, size=3.4)
    base.look_at(map_key, (0.0, 6.10, 3.65))

    moon = base.light("COMBAT_LIGHT_moon", "AREA", (0.0, 5.80, 7.25), 340.0,
                      (0.14, 0.27, 0.58), static, size=3.2)
    base.look_at(moon, (0.0, 1.0, 1.10))

    left = base.light("COMBAT_LIGHT_barracks", "AREA", (-6.25, 0.20, 4.55), 120.0,
                      (0.76, 0.32, 0.09), static, size=2.4)
    base.look_at(left, (-7.25, 0.20, 2.90))

    right = base.light("COMBAT_LIGHT_memorial", "AREA", (6.20, 0.60, 4.40), 95.0,
                       (0.66, 0.30, 0.10), static, size=2.1)
    base.look_at(right, (7.20, 0.70, 2.85))

    base.anchor("COMBAT_ANCHOR_board_fill", (0.0, -0.25, 5.80), static)
    base.anchor("COMBAT_ANCHOR_map_fill", (0.0, 5.80, 5.20), static)
    base.anchor("COMBAT_ANCHOR_barracks_fill", (-6.55, 0.15, 3.65), static)
    base.anchor("COMBAT_ANCHOR_memorial_fill", (6.55, 0.75, 3.55), static)


def bake_weather():
    base.WEATHER_MATERIALS = COMBAT_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in COMBAT_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("Combat Operations Room inherited static collection missing")

    clear_inherited_room(static)
    p = palette()
    build_floor(static, p)
    build_board_table(static, p)
    build_architecture(static, p)
    build_campaign_map(static, p)
    build_barracks(static, p)
    build_memorial(static, p)
    build_quartermaster(static, p)
    build_standards(static, p)
    build_sconces(static, p)
    build_lighting(static)
    bake_weather()

    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["war_room_contract"] = CONTRACT
    bpy.context.scene["war_room_contract"] = CONTRACT


def validate_scene():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "WR_ANCHOR_board_origin",
        "COMBAT_ROOM_floor",
        "COMBAT_ROOM_dais",
        "COMBAT_ROOM_board_table_top",
        "COMBAT_MAP_frame",
        "COMBAT_MAP_parchment",
        "COMBAT_BARRACKS_back",
        "COMBAT_MEMORIAL_panel",
        "COMBAT_QM_desk",
        "COMBAT_STANDARD_banner_olive",
        "COMBAT_STANDARD_banner_burgundy",
        "COMBAT_ANCHOR_campaign_map",
        "COMBAT_ANCHOR_barracks",
        "COMBAT_ANCHOR_memorial",
        "COMBAT_ANCHOR_quartermaster",
        "COMBAT_ANCHOR_board_fill",
        "COMBAT_ANCHOR_map_fill",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"Combat Operations Room contract objects missing: {missing}")

    forbidden = sorted(name for name in names if name.startswith(("WR_ARCH_", "WR_CANON_", "WR3_OBS_", "PVP_")))
    if forbidden:
        raise RuntimeError(f"Combat Operations Room inherited visible geometry: {forbidden[:12]}")

    anchor = bpy.data.objects["WR_ANCHOR_board_origin"]
    expected_z = round(base.BOARD_Z, 3)
    if tuple(round(v, 3) for v in anchor.location) != (0.0, 0.0, expected_z):
        raise RuntimeError(f"Combat Operations Room board anchor drift: {tuple(anchor.location)}")

    # Nothing authored as table furniture may rise over the live squares.
    tile_top = base.BOARD_Z + 0.0525
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or not obj.name.startswith("COMBAT_ROOM_board_"):
            continue
        corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
        top = max(co.z for co in corners)
        min_x, max_x = min(co.x for co in corners), max(co.x for co in corners)
        min_y, max_y = min(co.y for co in corners), max(co.y for co in corners)
        over_squares = min_x < 3.98 and max_x > -3.98 and min_y < 3.98 and max_y > -3.98
        if over_squares and top > tile_top - 0.010:
            raise RuntimeError(f"Combat Operations Room table occludes live board: {obj.name} top={top:.3f}")

    # Side stations stay outside the playable interaction band.
    for name in ("COMBAT_BARRACKS_back", "COMBAT_MEMORIAL_slab"):
        obj = bpy.data.objects[name]
        if abs(obj.location.x) < 6.8:
            raise RuntimeError(f"Combat Operations Room side station invades board: {name}")

    camera = bpy.context.scene.camera
    camera.data.lens = 46.0
    camera.location = (0.0, -16.0, 9.55)
    base.look_at(camera, (0.0, 0.78, 1.55))


def export_shell(path: Path):
    links, textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = links
    scene["war_room_runtime_texture_count"] = textures
    base.WEATHER_MATERIALS = COMBAT_WEATHER_MATERIALS
    base.strip_unused_weather_layers()

    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in scene.objects:
        is_static = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_anchor = obj.type == "EMPTY" and obj.name.startswith("COMBAT_ANCHOR_")
        if is_static or is_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 70:
        raise RuntimeError(f"Combat Operations Room runtime selection too small: {selected}")

    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_cameras=False,
        export_lights=False,
        **base.meshopt_export_kwargs(),
    )

    patched = base.patch_runtime_glb_base_color_factors(path, factors)
    if patched < 8:
        raise RuntimeError(f"Combat Operations Room runtime factor patch too small: {patched}")

    data = base.read_glb_json(path)
    if base.MESH_COMPRESSION_EXTENSION not in set(data.get("extensionsUsed", [])):
        raise RuntimeError("Combat Operations Room runtime GLB missing meshopt")

    node_names = {row.get("name") for row in data.get("nodes", [])}
    for name in (
        "COMBAT_ANCHOR_campaign_map",
        "COMBAT_ANCHOR_barracks",
        "COMBAT_ANCHOR_memorial",
        "COMBAT_ANCHOR_quartermaster",
        "COMBAT_ANCHOR_board_fill",
        "COMBAT_ANCHOR_map_fill",
    ):
        if name not in node_names:
            raise RuntimeError(f"Combat Operations Room runtime anchor missing: {name}")


def main():
    opt = base.args()
    base.CONTRACT = CONTRACT
    base.wipe()
    base.build()
    base.validate()
    apply_identity()
    validate_scene()

    blend = Path(opt.blend)
    glb = Path(opt.glb)
    preview = Path(opt.preview)
    manifest = Path(opt.manifest)
    for path in (blend, glb, preview, manifest):
        path.parent.mkdir(parents=True, exist_ok=True)

    base.manifest(manifest)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    base.render(preview)
    export_shell(glb)
    print(f"Combat Operations Room OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
