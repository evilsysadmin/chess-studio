#!/usr/bin/env python3
"""Build Chess Studio's independent PvP Duel Room shell.

The Duel Room is a medieval castle chamber authored specifically for human-vs-human
play. It deliberately reuses only the proven War Room board anchor, preview pieces,
camera plumbing and export helpers; the visible room is independent.

Blender owns the static room. The app owns clocks, player identity, turn state,
legal moves, overlays and all chess semantics.
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


CONTRACT = "pvp-duel-room-medieval-v1"
DUEL_WEATHER_MATERIALS = frozenset({
    "PVP_MAT_wall_stone",
    "PVP_MAT_floor_stone",
    "PVP_MAT_dais_stone",
})


def clear_inherited_room(static):
    """Keep only the proven camera from the inherited v2 shell."""
    for obj in list(static.objects):
        if obj.name == "WR_CAMERA_hero":
            continue
        bpy.data.objects.remove(obj, do_unlink=True)



def palette():
    return {
        "wall": base.material(
            "PVP_MAT_wall_stone", (0.085, 0.078, 0.070, 1),
            rough=0.92, texture="stone", scale=5.2, bump=0.105, weather=True,
        ),
        "floor": base.material(
            "PVP_MAT_floor_stone", (0.050, 0.058, 0.058, 1),
            rough=0.84, texture="stone", scale=5.0, bump=0.070, weather=True,
        ),
        "dais": base.material(
            "PVP_MAT_dais_stone", (0.205, 0.182, 0.145, 1),
            rough=0.73, coat=0.035, texture="stone", scale=4.0, bump=0.060, weather=True,
        ),
        "limestone": base.material(
            "PVP_MAT_limestone", (0.43, 0.39, 0.31, 1),
            rough=0.82, texture="stone", scale=4.4, bump=0.060,
        ),
        "wet_stone": base.material(
            "PVP_MAT_wet_stone", (0.032, 0.042, 0.044, 1),
            rough=0.29, coat=0.34, texture="stone", scale=6.5, bump=0.025,
        ),
        "recess": base.material(
            "PVP_MAT_recess_stone", (0.070, 0.070, 0.064, 1),
            rough=0.90, texture="stone", scale=5.8, bump=0.080, weather=True,
        ),
        "oak": base.material(
            "PVP_MAT_dark_oak", (0.055, 0.019, 0.008, 1),
            rough=0.46, coat=0.18, texture="wood", scale=2.4, bump=0.060,
        ),
        "oak_mid": base.material(
            "PVP_MAT_oak_mid", (0.105, 0.036, 0.012, 1),
            rough=0.45, coat=0.16, texture="wood", scale=2.8, bump=0.052,
        ),
        "iron": base.material(
            "PVP_MAT_black_iron", (0.012, 0.014, 0.015, 1),
            metal=0.90, rough=0.52, texture="metal", scale=30, bump=0.026,
        ),
        "brass": base.material(
            "PVP_MAT_old_brass", (0.30, 0.135, 0.025, 1),
            metal=0.88, rough=0.38, coat=0.10, texture="metal", scale=30, bump=0.016,
        ),
        "red": base.material(
            "PVP_MAT_banner_red", (0.185, 0.010, 0.008, 1),
            rough=0.78, sheen=0.14, texture="fabric", scale=48, bump=0.045,
        ),
        "blue": base.material(
            "PVP_MAT_banner_blue", (0.008, 0.032, 0.105, 1),
            rough=0.78, sheen=0.14, texture="fabric", scale=48, bump=0.045,
        ),
        "ivory": base.material(
            "PVP_MAT_ivory", (0.61, 0.54, 0.41, 1),
            rough=0.66, coat=0.03, texture="fabric", scale=42, bump=0.030,
        ),
        "seat_leather": base.material(
            "PVP_MAT_seat_leather", (0.075, 0.020, 0.010, 1),
            rough=0.50, coat=0.18, sheen=0.08, texture="leather", scale=50, bump=0.040,
        ),
        "fire": bpy.data.materials["WR_MAT_fire_core"],
        "night": base.material(
            "PVP_MAT_moon_glass", (0.006, 0.018, 0.055, 1),
            rough=0.16, coat=0.46,
            emission=(0.010, 0.055, 0.19, 1), emission_strength=0.82,
        ),
    }

def cylinder_between(name, start, end, radius, material, owner, *, vertices=24):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = base.cylinder(name, (start + end) / 2.0, radius, direction.length,
                        material, owner, vertices=vertices)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj



def build_floor_and_dais(static, p):
    # Dungeon flagstones: cold, irregular and slightly wet around the perimeter.
    base.cube("PVP_ROOM_floor", (0, 0.8, -0.10), (8.6, 7.0, 0.10),
              p["floor"], static, bevel=0.035)
    for row in range(-5, 6):
        y = row * 1.08 + 0.65
        for col in range(-7, 8):
            x = col * 1.08
            if abs(x) > 7.95 or y < -4.75 or y > 6.05:
                continue
            inset = 0.505
            if abs(x) > 6.0 and (row + col) % 3 == 0:
                mat = p["wet_stone"]
            elif (row * 2 + col) % 11 == 0:
                mat = p["dais"]
            else:
                mat = p["floor"]
            tile = base.cube(
                f"PVP_ROOM_floor_tile_{row+5}_{col+7}", (x, y, 0.015),
                (inset, inset, 0.025), mat, static, bevel=0.015,
            )
            tile.rotation_euler.z = math.radians(((row * 7 + col * 3) % 5 - 2) * 0.28)

    # Raised octagonal stone fighting dais: the board is still the visual sovereign.
    base.cylinder("PVP_DUEL_dais", (0, 0.0, 0.18), 4.35, 0.34,
                  p["dais"], static, vertices=8)
    base.torus("PVP_DUEL_dais_outer_iron", (0, 0.0, 0.365), 4.05, 0.050,
               p["iron"], static)
    base.torus("PVP_DUEL_dais_inner_brass", (0, 0.0, 0.372), 3.56, 0.022,
               p["brass"], static)

    # Drainage channels sell "old fortress" without entering the board interaction cone.
    for x in (-5.35, 5.35):
        base.cube(
            f"PVP_DUEL_drain_{'left' if x < 0 else 'right'}",
            (x, 0.65, 0.055), (0.16, 4.95, 0.030), p["iron"], static, bevel=0.018,
        )
        for idx, y in enumerate((-3.7, -2.0, -0.3, 1.4, 3.1, 4.8)):
            base.cube(
                f"PVP_DUEL_drain_bar_{'left' if x < 0 else 'right'}_{idx}",
                (x, y, 0.092), (0.31, 0.035, 0.018), p["iron"], static, bevel=0.012,
            )

    # Player identity is a restrained floor accent, not an esports carpet.
    for side, mat, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        base.cube(
            f"PVP_DUEL_identity_inlay_{label}",
            (side * 3.05, -4.05, 0.105), (0.16, 1.55, 0.018),
            mat, static, bevel=0.035,
        )


def build_architecture(static, p):
    # Heavy fortress envelope. No foreground columns: board selection remains sacred.
    base.cube("PVP_ROOM_rear_wall", (0, 6.52, 3.55), (8.7, 0.34, 3.70),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_ROOM_left_wall", (-8.47, 0.85, 3.35), (0.30, 5.55, 3.45),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_ROOM_right_wall", (8.47, 0.85, 3.35), (0.30, 5.55, 3.45),
              p["wall"], static, bevel=0.05)

    for side in (-1, 1):
        for idx, y in enumerate((-3.15, 0.25, 3.65)):
            x = side * 7.88
            base.cube(
                f"PVP_ROOM_buttress_{side}_{idx}", (x, y, 2.95),
                (0.50, 0.58, 2.98), p["wall"], static, bevel=0.11,
            )
            base.cylinder(
                f"PVP_ROOM_buttress_cap_{side}_{idx}", (x, y, 5.96),
                0.50, 0.20, p["limestone"], static, vertices=8,
            )

    # Irregular ashlar relief. Leave the central prison portal clear.
    stone_index = 0
    for row in range(7):
        z = 1.18 + row * 0.78
        offset = 0.52 if row % 2 else 0.0
        for col in range(-8, 9):
            x = col * 1.02 + offset
            if abs(x) < 2.62 and z < 5.85:
                continue
            width = 0.455 + 0.025 * ((row + col) % 3)
            height = 0.335 + 0.018 * ((row * 2 + col) % 3)
            block = base.cube(
                f"PVP_ROOM_masonry_{stone_index}", (x, 6.155, z),
                (width, 0.055, height), p["wall"], static, bevel=0.035,
            )
            block.rotation_euler.z = math.radians(((row * 5 + col * 3) % 5 - 2) * 0.30)
            stone_index += 1

    # Deep pointed prison portal: black recess + portcullis + limestone dressings.
    base.cube("PVP_DUEL_portal_void", (0, 6.16, 2.60), (2.34, 0.10, 2.54),
              p["recess"], static, bevel=0.10)
    # A few broad back-stones keep the portcullis readable instead of collapsing
    # into a featureless black rectangle in the hero framing.
    for row, z in enumerate((1.20, 2.10, 3.00, 3.90, 4.80)):
        base.cube(
            f"PVP_DUEL_portal_back_course_{row}", (0, 6.035, z),
            (2.20, 0.022, 0.028), p["dais"], static, bevel=0.010,
        )
    for side in (-1, 1):
        base.cube(
            f"PVP_DUEL_portal_pier_{side}", (side * 2.55, 5.96, 2.62),
            (0.30, 0.26, 2.63), p["limestone"], static, bevel=0.08,
        )
        spring = base.cube(
            f"PVP_DUEL_portal_arch_{side}", (side * 1.30, 5.95, 5.55),
            (1.42, 0.25, 0.27), p["limestone"], static, bevel=0.09,
        )
        spring.rotation_euler.y = math.radians(-side * 25.5)
    base.cube("PVP_DUEL_portal_keystone", (0, 5.70, 6.03), (0.31, 0.22, 0.40),
              p["dais"], static, bevel=0.07)

    # Portcullis itself: readable silhouette, safely behind the board.
    for idx, x in enumerate((-1.85, -1.38, -0.92, -0.46, 0.0, 0.46, 0.92, 1.38, 1.85)):
        bar = base.cylinder(
            f"PVP_DUEL_portcullis_bar_{idx}", (x, 5.72, 2.68),
            0.048, 4.30, p["iron"], static, vertices=12,
        )
        if idx == 4:
            bar.name = "PVP_DUEL_portcullis"
    for idx, z in enumerate((1.20, 2.08, 2.96, 3.84, 4.72)):
        base.cube(
            f"PVP_DUEL_portcullis_cross_{idx}", (0, 5.72, z),
            (2.02, 0.055, 0.055), p["iron"], static, bevel=0.016,
        )

    # Narrow moon slit above the gate: dungeon, not observatory.
    base.cube("PVP_ROOM_window_reveal", (0, 6.02, 6.48), (0.57, 0.22, 0.78),
              p["limestone"], static, bevel=0.14)
    base.cube("PVP_ROOM_window_glass", (0, 5.76, 6.48), (0.38, 0.035, 0.61),
              p["night"], static, bevel=0.11)
    base.cube("PVP_ROOM_window_mullion", (0, 5.68, 6.48),
              (0.040, 0.045, 0.57), p["iron"], static, bevel=0.012)
    base.cube("PVP_ROOM_window_transom", (0, 5.68, 6.48),
              (0.34, 0.045, 0.040), p["iron"], static, bevel=0.012)

    # Side oubliette grilles reinforce the dungeon silhouette.
    for side in (-1, 1):
        x = side * 6.72
        base.cube(
            f"PVP_DUEL_side_cell_void_{side}", (x, 6.05, 2.18),
            (0.88, 0.075, 1.48), p["iron"], static, bevel=0.06,
        )
        for idx, dx in enumerate((-0.58, -0.29, 0.0, 0.29, 0.58)):
            base.cylinder(
                f"PVP_DUEL_side_cell_bar_{side}_{idx}", (x + dx, 5.72, 2.20),
                0.032, 2.72, p["iron"], static, vertices=10,
            )


def build_vault_and_chains(static, p):
    # Gothic transverse ribs create a Teutonic fortress ceiling line without a heavy roof mesh.
    for rib_idx, y in enumerate((-3.55, -0.15, 3.25, 5.55)):
        points = [
            (-8.10, y, 5.55),
            (-5.00, y, 6.35),
            (-2.15, y, 7.18),
            (0.00, y, 7.82),
            (2.15, y, 7.18),
            (5.00, y, 6.35),
            (8.10, y, 5.55),
        ]
        for seg in range(len(points) - 1):
            cylinder_between(
                f"PVP_DUEL_vault_rib_{rib_idx}_{seg}",
                points[seg], points[seg + 1], 0.105, p["limestone"], static, vertices=12,
            )

    # Hanging chains stay outside the interaction cone but add a grim dungeon layer.
    for side in (-1, 1):
        x = side * 6.15
        y = 3.82
        base.torus(
            f"PVP_DUEL_chain_anchor_{side}", (x, y, 5.30),
            0.18, 0.045, p["iron"], static,
        ).rotation_euler.x = math.pi / 2
        for idx in range(7):
            link = base.torus(
                f"PVP_DUEL_chain_{side}_{idx}", (x, y, 4.90 - idx * 0.31),
                0.115, 0.027, p["iron"], static,
            )
            link.rotation_euler.x = math.pi / 2
            link.rotation_euler.z = math.radians(90 if idx % 2 else 0)


def build_duel_banners(static, p):
    # Teutonic field: bone-white cloth and black cross. PvP colors survive only as a narrow identity edge.
    for side, accent, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        x = side * 4.92
        base.cube(
            f"PVP_DUEL_banner_{label}", (x, 5.70, 3.42),
            (0.92, 0.055, 1.52), p["ivory"], static, bevel=0.075,
        )
        base.cube(
            f"PVP_DUEL_banner_cross_vertical_{label}", (x, 5.61, 3.50),
            (0.105, 0.040, 0.88), p["iron"], static, bevel=0.020,
        )
        base.cube(
            f"PVP_DUEL_banner_cross_horizontal_{label}", (x, 5.60, 3.66),
            (0.55, 0.040, 0.105), p["iron"], static, bevel=0.020,
        )
        if label == "red":
            bpy.data.objects[f"PVP_DUEL_banner_cross_vertical_{label}"].name = "PVP_DUEL_teutonic_cross"
        base.cube(
            f"PVP_DUEL_banner_identity_{label}", (x + side * 0.78, 5.59, 3.42),
            (0.065, 0.038, 1.36), accent, static, bevel=0.018,
        )
        rail = base.cylinder(
            f"PVP_DUEL_banner_rail_{label}", (x, 5.74, 5.05),
            0.065, 2.25, p["iron"], static, vertices=20,
        )
        rail.rotation_euler.y = math.pi / 2



def build_teutonic_armory(static, p):
    """Peripheral fortress details: shields, polearms and arrow slits, never the board cone."""
    for side, label in ((-1, "left"), (1, "right")):
        wall_x = side * 8.10

        # Narrow defensive slit with limestone dressing on each side wall.
        slit_y = 2.18
        base.cube(
            f"PVP_DUEL_arrow_slit_{label}", (wall_x, slit_y, 3.58),
            (0.050, 0.13, 0.72), p["recess"], static, bevel=0.025,
        )
        for dz in (-0.82, 0.82):
            base.cube(
                f"PVP_DUEL_arrow_slit_cap_{label}_{dz:+.2f}",
                (wall_x - side * 0.018, slit_y, 3.58 + dz),
                (0.060, 0.25, 0.075), p["limestone"], static, bevel=0.022,
            )
        for dy in (-0.25, 0.25):
            base.cube(
                f"PVP_DUEL_arrow_slit_jamb_{label}_{dy:+.2f}",
                (wall_x - side * 0.018, slit_y + dy, 3.58),
                (0.060, 0.075, 0.78), p["limestone"], static, bevel=0.022,
            )

        # Teutonic wall shield: ivory field, black cross, pointed lower plate.
        shield_y = -0.35
        base.cube(
            f"PVP_DUEL_armory_shield_{label}", (wall_x - side * 0.035, shield_y, 3.05),
            (0.060, 0.58, 0.68), p["ivory"], static, bevel=0.12,
        )
        point = base.cube(
            f"PVP_DUEL_armory_shield_point_{label}",
            (wall_x - side * 0.035, shield_y, 2.43),
            (0.060, 0.31, 0.31), p["ivory"], static, bevel=0.045,
        )
        point.rotation_euler.x = math.radians(45)
        base.cube(
            f"PVP_DUEL_armory_cross_vertical_{label}",
            (wall_x - side * 0.105, shield_y, 3.04),
            (0.035, 0.105, 0.54), p["iron"], static, bevel=0.018,
        )
        base.cube(
            f"PVP_DUEL_armory_cross_horizontal_{label}",
            (wall_x - side * 0.105, shield_y, 3.18),
            (0.035, 0.42, 0.105), p["iron"], static, bevel=0.018,
        )

        # Two restrained halberds frame the shield. They live flat to the side wall,
        # so they add silhouette without creating foreground click occluders.
        for idx, pole_y in enumerate((shield_y - 0.88, shield_y + 0.88)):
            shaft = cylinder_between(
                f"PVP_DUEL_halberd_{label}_{idx}",
                (wall_x - side * 0.08, pole_y, 1.35),
                (wall_x - side * 0.08, pole_y, 4.72),
                0.038, p["oak_mid"], static, vertices=12,
            )
            blade = base.cube(
                f"PVP_DUEL_halberd_blade_{label}_{idx}",
                (wall_x - side * 0.105, pole_y - 0.11, 4.46),
                (0.035, 0.20, 0.26), p["iron"], static, bevel=0.030,
            )
            blade.rotation_euler.x = math.radians(18 if idx == 0 else -18)
            bpy.ops.mesh.primitive_cone_add(
                vertices=12, radius1=0.070, radius2=0.0, depth=0.34,
                location=(wall_x - side * 0.08, pole_y, 4.92),
            )
            spike = bpy.context.object
            spike.name = f"PVP_DUEL_halberd_spike_{label}_{idx}"
            spike.data.materials.append(p["iron"])
            base.tag(spike, base.ROLE_STATIC)
            base.relink(spike, static)

        # Low iron rack physically ties the weapon display to the masonry.
        base.cube(
            f"PVP_DUEL_armory_rack_{label}",
            (wall_x - side * 0.07, shield_y, 1.18),
            (0.055, 1.25, 0.070), p["iron"], static, bevel=0.025,
        )

def build_sconces_and_gate(static, p):
    # Twin iron braziers are the warm practicals. Gatework is authored into the rear portal.
    for side, label in ((-1, "left"), (1, "right")):
        x, y = side * 5.92, 5.42
        base.cylinder(
            f"PVP_DUEL_brazier_bowl_{label}", (x, y, 1.78),
            0.46, 0.22, p["iron"], static, vertices=12,
        )
        for leg_side in (-1, 1):
            leg = base.cylinder(
                f"PVP_DUEL_brazier_leg_{label}_{leg_side}", (x + leg_side * 0.20, y, 1.10),
                0.040, 1.16, p["iron"], static, vertices=10,
            )
            leg.rotation_euler.y = math.radians(leg_side * 9)
        # Layered ellipsoids read as flame at gameplay distance; the previous
        # emissive cube looked like a lantern bulb in the generated preview.
        base.sphere(
            f"PVP_DUEL_brazier_flame_base_{label}", (x, y, 2.04),
            0.19, p["fire"], static, scale=(0.86, 0.72, 1.28),
        )
        base.sphere(
            f"PVP_DUEL_brazier_flame_tip_{label}", (x + side * 0.035, y - 0.010, 2.30),
            0.12, p["fire"], static, scale=(0.62, 0.56, 1.55),
        )
        lamp = base.light(
            f"PVP_LIGHT_brazier_{label}", "POINT", (x, y - 0.28, 2.20),
            190.0, (1.0, 0.27, 0.055), static, radius=1.15,
        )
        lamp["war_room_runtime_dynamic"] = "pvp-brazier"

    # Iron wall hooks and restraints: sparse, readable, not horror-prop clutter.
    for side in (-1, 1):
        x = side * 7.70
        for idx, y in enumerate((-1.55, 1.25, 4.05)):
            base.torus(
                f"PVP_DUEL_wall_ring_{side}_{idx}", (x, y, 2.25),
                0.16, 0.038, p["iron"], static,
            ).rotation_euler.y = math.pi / 2


def build_duelist_furniture(static, p):
    # Austere duelist stations: oak and iron, deliberately not lounge furniture.
    for side, accent, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        x = side * 6.55
        y = -2.72
        base.cube(
            f"PVP_DUEL_seat_{label}", (x, y, 0.60),
            (0.78, 0.54, 0.12), p["oak_mid"], static, bevel=0.055,
        )
        base.cube(
            f"PVP_DUEL_seat_front_{label}", (x, y - 0.48, 0.33),
            (0.78, 0.08, 0.34), p["iron"], static, bevel=0.035,
        )
        for sx in (-0.62, 0.62):
            base.cylinder(
                f"PVP_DUEL_seat_post_{label}_{sx:+.2f}",
                (x + sx, y + 0.40, 1.12), 0.055, 1.30,
                p["iron"], static, vertices=12,
            )
        base.cube(
            f"PVP_DUEL_seat_identity_{label}", (x, y + 0.49, 1.25),
            (0.48, 0.055, 0.10), accent, static, bevel=0.018,
        )


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "pvp-duel-room"
    scene["pvp_duel_room_contract"] = CONTRACT
    scene.view_settings.exposure = 0.08

    # Cold moon from the prison slit, warm braziers, quiet neutral board fill.
    moon = base.light("PVP_LIGHT_moon_key", "AREA", (0.0, 5.30, 7.05), 460.0,
                      (0.14, 0.27, 0.62), static, size=3.6)
    base.look_at(moon, (0.0, 0.6, 1.0))
    top = base.light("PVP_LIGHT_board_top", "AREA", (0.0, 0.4, 8.65), 245.0,
                     (0.72, 0.68, 0.58), static, size=4.6)
    base.look_at(top, (0.0, 0.2, 0.65))
    rim = base.light("PVP_LIGHT_dungeon_rim", "AREA", (0.0, -4.8, 5.8), 150.0,
                     (0.28, 0.34, 0.43), static, size=4.0)
    base.look_at(rim, (0.0, 1.0, 1.15))
    gate_fill = base.light("PVP_LIGHT_gate_fill", "AREA", (0.0, 3.85, 5.45), 135.0,
                           (0.24, 0.30, 0.40), static, size=3.2)
    base.look_at(gate_fill, (0.0, 5.82, 2.85))

    base.anchor("PVP_ANCHOR_red_identity", (-4.92, 5.42, 3.42), static)
    base.anchor("PVP_ANCHOR_blue_identity", (4.92, 5.42, 3.42), static)
    base.anchor("PVP_ANCHOR_room_status", (0, 5.50, 5.58), static)
    base.anchor("PVP_ANCHOR_brazier_left", (-5.92, 5.14, 2.20), static)
    base.anchor("PVP_ANCHOR_brazier_right", (5.92, 5.14, 2.20), static)
    base.anchor("PVP_ANCHOR_moon_fill", (0.0, 5.16, 6.48), static)

def bake_weather():
    base.WEATHER_MATERIALS = DUEL_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in DUEL_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("PvP Duel Room inherited static collection missing")
    clear_inherited_room(static)
    p = palette()
    build_floor_and_dais(static, p)
    build_architecture(static, p)
    build_vault_and_chains(static, p)
    build_duel_banners(static, p)
    build_teutonic_armory(static, p)
    build_sconces_and_gate(static, p)
    build_duelist_furniture(static, p)
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
        "PVP_ROOM_floor",
        "PVP_DUEL_dais",
        "PVP_DUEL_banner_red",
        "PVP_DUEL_banner_blue",
        "PVP_DUEL_teutonic_cross",
        "PVP_DUEL_portcullis",
        "PVP_DUEL_vault_rib_0_0",
        "PVP_DUEL_chain_-1_0",
        "PVP_DUEL_arrow_slit_left",
        "PVP_DUEL_armory_shield_left",
        "PVP_DUEL_halberd_left_0",
        "PVP_ROOM_window_glass",
        "PVP_DUEL_seat_red",
        "PVP_DUEL_seat_blue",
        "PVP_ANCHOR_red_identity",
        "PVP_ANCHOR_blue_identity",
        "PVP_ANCHOR_room_status",
        "PVP_ANCHOR_brazier_left",
        "PVP_ANCHOR_brazier_right",
        "PVP_ANCHOR_moon_fill",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"PvP Duel Room contract objects missing: {missing}")
    forbidden = sorted(name for name in names if name.startswith(("WR_ARCH_", "WR_CANON_", "WR3_OBS_")))
    if forbidden:
        raise RuntimeError(f"PvP Duel Room inherited visible War Room geometry: {forbidden[:12]}")

    anchor = bpy.data.objects["WR_ANCHOR_board_origin"]
    if tuple(round(v, 3) for v in anchor.location) != (0.0, 0.0, round(base.BOARD_Z, 3)):
        raise RuntimeError(f"PvP Duel Room board anchor drift: {tuple(anchor.location)}")

    # Slightly steeper framing than standard War Room improves piece selection.
    camera = bpy.context.scene.camera
    camera.data.lens = 48.0
    camera.location = (0.0, -15.6, 9.35)
    base.look_at(camera, (0.0, 0.82, 1.48))


def export_shell(path):
    links, textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = links
    scene["war_room_runtime_texture_count"] = textures
    base.WEATHER_MATERIALS = DUEL_WEATHER_MATERIALS
    base.strip_unused_weather_layers()

    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in scene.objects:
        is_static = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_anchor = obj.type == "EMPTY" and obj.name.startswith("PVP_ANCHOR_")
        if is_static or is_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 140:
        raise RuntimeError(f"PvP Duel Room runtime selection too small: {selected}")

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
    if patched < 12:
        raise RuntimeError(f"PvP Duel Room runtime factor patch too small: {patched}")
    data = base.read_glb_json(path)
    if base.MESH_COMPRESSION_EXTENSION not in set(data.get("extensionsUsed", [])):
        raise RuntimeError("PvP Duel Room runtime GLB missing meshopt")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    for name in (
        "PVP_ANCHOR_red_identity",
        "PVP_ANCHOR_blue_identity",
        "PVP_ANCHOR_room_status",
        "PVP_ANCHOR_brazier_left",
        "PVP_ANCHOR_brazier_right",
        "PVP_ANCHOR_moon_fill",
    ):
        if name not in node_names:
            raise RuntimeError(f"PvP Duel Room runtime anchor missing: {name}")


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
    print(f"PvP Duel Room OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
