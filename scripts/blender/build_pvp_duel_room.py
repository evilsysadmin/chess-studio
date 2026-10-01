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
DUEL_DAIS_RADIUS = 4.35
SIDE_WALL_INNER_X = 8.17
WALL_PROP_MIN_RADIUS = 6.80
WALL_CONTACT_MAX_GAP = 0.35
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
        "armor": base.material(
            "PVP_MAT_armor_steel", (0.150, 0.160, 0.172, 1),
            metal=0.93, rough=0.30, coat=0.14, texture="metal", scale=28, bump=0.012,
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
            "PVP_MAT_seat_leather", (0.155, 0.032, 0.012, 1),
            rough=0.38, coat=0.28, sheen=0.10, texture="leather", scale=50, bump=0.034,
        ),
        "fire": base.material(
            "PVP_MAT_fire_orange", (0.70, 0.070, 0.002, 1),
            rough=0.28, emission=(0.42, 0.028, 0.0005, 1), emission_strength=0.38,
        ),
        "fire_core": base.material(
            "PVP_MAT_fire_gold", (0.98, 0.18, 0.006, 1),
            rough=0.24, emission=(0.58, 0.055, 0.001, 1), emission_strength=0.48,
        ),
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


def tapered_plate(name, loc, r_bottom, r_top, depth, material, owner, *, vertices=14):
    """Low-poly truncated cone for articulated plate sections."""
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices,
        radius1=r_bottom,
        radius2=r_top,
        depth=depth,
        location=loc,
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    obj.data.shade_smooth()
    base.tag(obj, base.ROLE_STATIC)
    base.relink(obj, owner)
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
    base.cylinder("PVP_DUEL_dais", (0, 0.0, 0.18), DUEL_DAIS_RADIUS, 0.34,
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
            f"PVP_DUEL_portal_arch_{side}", (side * 1.30, 6.00, 5.55),
            (1.30, 0.18, 0.20), p["wall"], static, bevel=0.075,
        )
        spring.rotation_euler.y = math.radians(-side * 25.5)
    base.cube("PVP_DUEL_portal_keystone", (0, 5.70, 6.03), (0.31, 0.22, 0.40),
              p["dais"], static, bevel=0.07)

    # A second, darker pointed arch sits behind the bars. This gives the gate
    # actual corridor depth instead of reading as one black rectangle.
    for side in (-1, 1):
        base.cube(
            f"PVP_DUEL_inner_gate_pier_{side}", (side * 1.42, 6.045, 2.88),
            (0.16, 0.030, 1.72), p["dais"], static, bevel=0.045,
        )
        inner_arch = base.cube(
            f"PVP_DUEL_inner_gate_arch_{side}", (side * 0.72, 6.040, 4.78),
            (0.82, 0.030, 0.14), p["dais"], static, bevel=0.045,
        )
        inner_arch.rotation_euler.y = math.radians(-side * 28.0)
    base.cube(
        "PVP_DUEL_inner_gate_floor", (0, 6.035, 1.05),
        (1.28, 0.030, 0.10), p["wet_stone"], static, bevel=0.025,
    )

    # Gate machinery: two wall-mounted hoist wheels make the portcullis feel functional.
    for side, label in ((-1, "left"), (1, "right")):
        wheel_x = side * 3.18
        wheel_y = 5.72
        wheel_z = 3.72

        wheel = base.torus(
            f"PVP_DUEL_gate_winch_{label}",
            (wheel_x, wheel_y, wheel_z),
            0.49, 0.068, p["brass"], static,
            rotation=(math.pi / 2, 0.0, 0.0),
        )
        base.cylinder(
            f"PVP_DUEL_gate_winch_hub_{label}",
            (wheel_x, wheel_y, wheel_z),
            0.14, 0.26, p["iron"], static, vertices=18,
        ).rotation_euler.x = math.pi / 2

        base.cube(
            f"PVP_DUEL_gate_winch_mount_{label}",
            (wheel_x, wheel_y + 0.14, wheel_z),
            (0.62, 0.16, 0.62), p["recess"], static, bevel=0.08,
        )
        base.cube(
            f"PVP_DUEL_gate_winch_mount_cap_{label}",
            (wheel_x, wheel_y + 0.12, wheel_z + 0.66),
            (0.70, 0.18, 0.08), p["limestone"], static, bevel=0.035,
        )

        for spoke_idx, angle in enumerate((0, 45, 90, 135)):
            spoke = base.cube(
                f"PVP_DUEL_gate_winch_spoke_{label}_{spoke_idx}",
                (wheel_x, wheel_y - 0.01, wheel_z),
                (0.40, 0.030, 0.034), p["oak_mid"], static, bevel=0.020,
            )
            spoke.rotation_euler.y = math.radians(angle)

        # Short chain run from each winch toward the portcullis head.
        chain_start = Vector((wheel_x - side * 0.40, wheel_y - 0.05, wheel_z + 0.16))
        chain_end = Vector((side * 1.72, 5.70, 4.68))
        direction = chain_end - chain_start
        for link_idx in range(7):
            t = link_idx / 6
            pos = chain_start + direction * t
            link = base.torus(
                f"PVP_DUEL_gate_chain_{label}_{link_idx}",
                tuple(pos), 0.075, 0.020, p["iron"], static,
            )
            link.rotation_euler.x = math.pi / 2
            link.rotation_euler.z = math.radians(90 if link_idx % 2 else 0)

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

    # Downward spear teeth turn the gate into a real defensive portcullis.
    for idx, x in enumerate((-1.85, -1.38, -0.92, -0.46, 0.0, 0.46, 0.92, 1.38, 1.85)):
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=0.0, radius2=0.082, depth=0.34,
            location=(x, 5.72, 0.37),
        )
        tooth = bpy.context.object
        tooth.name = f"PVP_DUEL_portcullis_tooth_{idx}"
        tooth.data.materials.append(p["iron"])
        base.tag(tooth, base.ROLE_STATIC)
        base.relink(tooth, static)

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
    """Frame the arena with side masonry instead of pale beams crossing the hero view."""
    for side, label in ((-1, "left"), (1, "right")):
        x = side * 7.72
        for idx, y in enumerate((-3.10, 0.15, 3.40)):
            base.cube(
                f"PVP_DUEL_side_pier_{label}_{idx}",
                (x, y, 2.95), (0.30, 0.44, 2.95),
                p["wall"], static, bevel=0.09,
            )
            base.cube(
                f"PVP_DUEL_side_pier_cap_{label}_{idx}",
                (x - side * 0.10, y, 5.88), (0.36, 0.54, 0.12),
                p["limestone"], static, bevel=0.045,
            )
            # A short corbel suggests the vault spring without throwing a beam
            # through the gameplay camera.
            corbel = base.cube(
                f"PVP_DUEL_side_corbel_{label}_{idx}",
                (x - side * 0.34, y, 5.52), (0.36, 0.28, 0.11),
                p["limestone"], static, bevel=0.045,
            )
            corbel.rotation_euler.y = math.radians(side * 24)

        # Heavy hanging chains add depth along the extreme walls only.
        for chain_idx, y in enumerate((-2.10, 2.65)):
            base.torus(
                f"PVP_DUEL_chain_anchor_{label}_{chain_idx}",
                (side * 7.28, y, 5.62), 0.18, 0.045, p["iron"], static,
                rotation=(math.pi / 2, 0, 0),
            )
            for idx in range(8):
                link = base.torus(
                    f"PVP_DUEL_chain_{label}_{chain_idx}_{idx}",
                    (side * 7.28, y, 5.22 - idx * 0.31),
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
            (0.76, 0.055, 1.28), accent, static, bevel=0.075,
        )
        base.cube(
            f"PVP_DUEL_banner_cross_vertical_{label}", (x, 5.61, 3.50),
            (0.070, 0.040, 0.54), p["ivory"], static, bevel=0.020,
        )
        base.cube(
            f"PVP_DUEL_banner_cross_horizontal_{label}", (x, 5.60, 3.66),
            (0.31, 0.040, 0.070), p["ivory"], static, bevel=0.020,
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
    """Peripheral fortress details that read in the hero camera without touching the board."""
    for side, label in ((-1, "left"), (1, "right")):
        # Defensive slit remains on the side wall: architectural depth, not decoration.
        wall_x = side * 8.10
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

        # The armory itself sits on the rear wall, outside the banners and above
        # the braziers, where it reads in the canonical framing.
        shield_x = side * 6.55
        shield_y = 5.82
        shield_z = 3.82
        base.cube(
            f"PVP_DUEL_armory_shield_{label}", (shield_x, shield_y, shield_z),
            (0.58, 0.060, 0.67), p["ivory"], static, bevel=0.12,
        )
        point = base.cube(
            f"PVP_DUEL_armory_shield_point_{label}",
            (shield_x, shield_y, shield_z - 0.63),
            (0.31, 0.060, 0.31), p["ivory"], static, bevel=0.045,
        )
        point.rotation_euler.y = math.radians(45)
        base.cube(
            f"PVP_DUEL_armory_cross_vertical_{label}",
            (shield_x, shield_y - 0.075, shield_z),
            (0.105, 0.035, 0.54), p["iron"], static, bevel=0.018,
        )
        base.cube(
            f"PVP_DUEL_armory_cross_horizontal_{label}",
            (shield_x, shield_y - 0.075, shield_z + 0.14),
            (0.42, 0.035, 0.105), p["iron"], static, bevel=0.018,
        )

        # Two wall-hung halberds flank the shield. Their shafts stay vertical,
        # which strengthens the prison/fortress rhythm behind the board.
        for idx, pole_x in enumerate((shield_x - 0.88, shield_x + 0.88)):
            cylinder_between(
                f"PVP_DUEL_halberd_{label}_{idx}",
                (pole_x, shield_y + 0.02, 2.72),
                (pole_x, shield_y + 0.02, 5.22),
                0.038, p["oak_mid"], static, vertices=12,
            )
            blade = base.cube(
                f"PVP_DUEL_halberd_blade_{label}_{idx}",
                (pole_x - side * 0.10, shield_y - 0.035, 4.90),
                (0.20, 0.035, 0.26), p["iron"], static, bevel=0.030,
            )
            blade.rotation_euler.y = math.radians(18 if idx == 0 else -18)
            bpy.ops.mesh.primitive_cone_add(
                vertices=12, radius1=0.070, radius2=0.0, depth=0.34,
                location=(pole_x, shield_y + 0.02, 5.38),
            )
            spike = bpy.context.object
            spike.name = f"PVP_DUEL_halberd_spike_{label}_{idx}"
            spike.data.materials.append(p["iron"])
            base.tag(spike, base.ROLE_STATIC)
            base.relink(spike, static)

        base.cube(
            f"PVP_DUEL_armory_rack_{label}",
            (shield_x, shield_y + 0.025, 2.62),
            (1.26, 0.055, 0.070), p["iron"], static, bevel=0.025,
        )



def build_gothic_sentinel(static, p, side, label, sx, sy):
    """Life-size ceremonial gothic plate, authored facing local -Y then aimed at the board."""
    prefix = f"PVP_DUEL_sentinel_{label}"
    parts = []
    yaw = math.atan2(-sx, sy)
    foot = 0.50

    def add(obj):
        parts.append(obj)
        return obj

    def sph(name, loc, radius, mat, scale=(1.0, 1.0, 1.0)):
        return add(base.sphere(
            f"{prefix}_{name}", loc, radius, mat, static, scale=scale,
        ))

    def box(name, loc, half, mat, *, bevel=0.01, rot=None):
        obj = add(base.cube(
            f"{prefix}_{name}", loc, half, mat, static, bevel=bevel,
        ))
        if rot is not None:
            obj.rotation_euler = rot
        return obj

    def taper(name, loc, r_bottom, r_top, depth, mat, *, vertices=16):
        return add(tapered_plate(
            f"{prefix}_{name}", loc, r_bottom, r_top, depth,
            mat, static, vertices=vertices,
        ))

    # Stone pedestal stays architectural and is not rotated/scaled with the suit.
    base.cube(
        f"{prefix}_plinth", (sx, sy, 0.26),
        (0.44, 0.42, 0.26), p["dais"], static, bevel=0.07,
    )
    base.cube(
        f"{prefix}_plinth_top", (sx, sy, 0.48),
        (0.40, 0.38, 0.045), p["oak"], static, bevel=0.025,
    )

    # Legs: pointed sabatons, greaves, winged poleyns, cuisses and tassets.
    for leg in (-1, 1):
        lx = sx + leg * 0.12
        sph(f"sabaton_{leg}", (lx, sy - 0.08, foot + 0.04), 0.075, p["iron"],
            scale=(0.75, 1.90, 0.45))
        sph(f"instep_{leg}", (lx, sy - 0.02, foot + 0.08), 0.072, p["armor"],
            scale=(0.90, 1.10, 0.62))
        taper(f"greave_{leg}", (lx, sy, foot + 0.34), 0.062, 0.086, 0.50, p["armor"])
        sph(f"knee_{leg}", (lx, sy - 0.04, foot + 0.61), 0.082, p["armor"],
            scale=(1.0, 0.90, 1.0))
        sph(f"knee_wing_{leg}", (lx + leg * 0.07, sy - 0.03, foot + 0.61), 0.060, p["armor"],
            scale=(0.35, 0.90, 1.0))
        taper(f"cuisse_{leg}", (lx, sy, foot + 0.87), 0.085, 0.108, 0.46, p["armor"])
        box(
            f"tasset_{leg}",
            (lx + leg * 0.02, sy - 0.10, foot + 1.03),
            (0.10, 0.012, 0.12), p["armor"], bevel=0.020,
            rot=(math.radians(-12), math.radians(leg * 10), 0),
        )

    # Small dark core keeps gaps between articulated plates believable.
    box("torso", (sx, sy + 0.02, 1.86), (0.20, 0.12, 0.34), p["iron"], bevel=0.07)

    # Fauld + fluted cuirass.
    for lame, (z, radius) in enumerate(((1.62, 0.232), (1.69, 0.240), (1.76, 0.246))):
        taper(f"fauld_{lame}", (sx, sy, z), radius + 0.012, radius, 0.075, p["armor"], vertices=20)
    sph("breastplate", (sx, sy - 0.01, 2.06), 0.30, p["armor"], scale=(0.94, 0.60, 1.00))
    sph("plackart", (sx, sy - 0.07, 1.86), 0.24, p["armor"], scale=(0.95, 0.62, 0.75))
    box("breast_ridge", (sx, sy - 0.188, 2.04), (0.014, 0.010, 0.22), p["brass"], bevel=0.006)
    for flute in (-1, 1):
        box(
            f"breast_flute_{flute}", (sx + flute * 0.10, sy - 0.170, 2.03),
            (0.010, 0.010, 0.19), p["armor"], bevel=0.005,
            rot=(0, math.radians(flute * -8), 0),
        )
    add(base.torus(f"{prefix}_neckline", (sx, sy - 0.02, 2.30), 0.13, 0.018, p["brass"], static))
    box("belt", (sx, sy - 0.02, 1.58), (0.25, 0.16, 0.028), p["seat_leather"], bevel=0.012)
    box("belt_buckle", (sx, sy - 0.18, 1.58), (0.035, 0.008, 0.030), p["brass"], bevel=0.005)

    # House-colour tabard gives each sentinel a PvP identity without turning it into a mascot.
    field = p["red"] if side < 0 else p["blue"]
    tilt = (math.radians(-8), 0, 0)
    box("tabard", (sx, sy - 0.20, 1.38), (0.16, 0.010, 0.20), field, bevel=0.008, rot=tilt)
    box("tabard_hem", (sx, sy - 0.225, 1.185), (0.16, 0.008, 0.018), p["brass"], bevel=0.004, rot=tilt)

    # Arms: three-lame pauldrons, besagews, articulated elbows and gauntlets.
    for arm_idx, arm in enumerate((-1, 1)):
        ax = sx + arm * 0.34
        for lame, (dz, radius, scale_z) in enumerate(((0.0, 0.16, 0.85), (-0.08, 0.145, 0.75), (-0.15, 0.13, 0.65))):
            sph(
                f"pauldron_{arm_idx}_{lame}",
                (ax + arm * 0.02 * lame, sy, 2.24 + dz),
                radius, p["armor"], scale=(1.15, 1.05, scale_z),
            )
        add(base.torus(
            f"{prefix}_pauldron_rim_{arm_idx}",
            (ax, sy, 2.30), 0.145, 0.012, p["brass"], static,
        ))
        sph(f"besagew_{arm_idx}", (ax - arm * 0.10, sy - 0.15, 2.12), 0.05, p["brass"],
            scale=(1.0, 0.35, 1.0))
        taper(f"rerebrace_{arm_idx}", (ax + arm * 0.02, sy, 1.98), 0.058, 0.066, 0.26, p["armor"])
        sph(f"elbow_{arm_idx}", (ax + arm * 0.025, sy + 0.01, 1.84), 0.065, p["armor"])
        sph(f"elbow_wing_{arm_idx}", (ax + arm * 0.06, sy + 0.01, 1.84), 0.055, p["armor"],
            scale=(0.35, 1.0, 1.0))
        taper(f"vambrace_{arm_idx}", (ax + arm * 0.025, sy - 0.02, 1.68), 0.050, 0.060, 0.26, p["armor"])
        taper(f"gauntlet_cuff_{arm_idx}", (ax + arm * 0.025, sy - 0.03, 1.53), 0.070, 0.052, 0.08, p["iron"])
        sph(f"gauntlet_{arm_idx}", (ax + arm * 0.025, sy - 0.04, 1.46), 0.055, p["iron"],
            scale=(0.9, 1.1, 1.2))

    # Two-lame gorget and beaked armet.
    for lame, (z, radius) in enumerate(((2.33, 0.125), (2.38, 0.108))):
        taper(f"gorget_{lame}", (sx, sy, z), radius + 0.010, radius, 0.05, p["armor"], vertices=18)
    sph("helmet", (sx, sy + 0.01, 2.56), 0.165, p["armor"], scale=(0.92, 1.0, 1.12))
    sph("visor_shell", (sx, sy - 0.10, 2.53), 0.12, p["armor"], scale=(0.82, 0.95, 0.80))
    sph("visor_beak", (sx, sy - 0.19, 2.51), 0.060, p["armor"], scale=(0.90, 1.30, 0.80))
    box("visor", (sx, sy - 0.188, 2.585), (0.085, 0.012, 0.010), p["iron"], bevel=0.002)
    box("helm_comb", (sx, sy + 0.01, 2.72), (0.012, 0.13, 0.035), p["brass"], bevel=0.006)

    # Halberd, grounded and proportioned as part of the same authored figure.
    hx = sx + 0.44
    shaft_top = 3.30
    add(base.cylinder(
        f"{prefix}_halberd", (hx, sy - 0.05, (foot + shaft_top) / 2.0),
        0.022, shaft_top - foot, p["oak_mid"], static, vertices=10,
    ))
    box("halberd_langet", (hx, sy - 0.05, shaft_top - 0.34), (0.028, 0.028, 0.18), p["iron"], bevel=0.006)
    blade = box("halberd_blade", (hx + 0.12, sy - 0.05, shaft_top - 0.22), (0.12, 0.010, 0.13), p["armor"], bevel=0.02)
    blade.rotation_euler.y = math.radians(-6)
    box("halberd_fluke", (hx - 0.09, sy - 0.05, shaft_top - 0.22), (0.08, 0.010, 0.022), p["armor"],
        bevel=0.006, rot=(0, math.radians(-18), 0))
    box("halberd_spike", (hx, sy - 0.05, shaft_top + 0.15), (0.018, 0.010, 0.17), p["armor"], bevel=0.006)

    # Scale around the planted feet, then rotate local -Y to face the board centre.
    k = 1.28
    c, sn = math.cos(yaw), math.sin(yaw)
    for part in parts:
        part.location.x = sx + (part.location.x - sx) * k
        part.location.y = sy + (part.location.y - sy) * k
        part.location.z = foot + (part.location.z - foot) * k
        part.scale = tuple(component * k for component in part.scale)

        dx, dy = part.location.x - sx, part.location.y - sy
        part.location.x = sx + c * dx - sn * dy
        part.location.y = sy + sn * dx + c * dy
        part.rotation_euler.z += yaw

    sentinel_light = base.light(
        f"PVP_LIGHT_sentinel_{label}", "POINT",
        (sx, sy - 0.35, 2.10), 78.0,
        (0.72, 0.27, 0.08), static, radius=0.95,
    )
    sentinel_light["war_room_runtime_dynamic"] = "pvp-sentinel"

def build_dungeon_population(static, p):
    """Populate the room like a working Teutonic fortress without touching the board cone."""
    for side, label in ((-1, "left"), (1, "right")):
        # Large chain-hung brazier near each side wall.
        bx, by, bz = side * 6.55, 1.62, 3.28
        base.cylinder(
            f"PVP_DUEL_hanging_brazier_{label}", (bx, by, bz),
            0.52, 0.24, p["iron"], static, vertices=16,
        )
        for flame_idx, (dz, radius) in enumerate(((0.22, 0.19), (0.43, 0.11))):
            base.sphere(
                f"PVP_DUEL_hanging_flame_{label}_{flame_idx}",
                (bx, by, bz + dz), radius, p["fire" if flame_idx == 0 else "fire_core"], static,
                scale=(0.88, 0.76, 1.45 if flame_idx == 0 else 1.72),
            )
        for chain_side in (-1, 1):
            start=(bx + chain_side * 0.26, by, bz + 0.08)
            end=(bx + chain_side * 0.14, by, 5.74)
            cylinder_between(
                f"PVP_DUEL_brazier_chain_{label}_{chain_side}",
                start, end, 0.026, p["iron"], static, vertices=10,
            )

        base.torus(
            f"PVP_DUEL_hanging_brazier_rim_{label}",
            (bx, by, bz + 0.08), 0.50, 0.045, p["iron"], static,
        )
        for cage_idx, angle in enumerate((0, 45, 90, 135)):
            cage = base.cube(
                f"PVP_DUEL_hanging_brazier_cage_{label}_{cage_idx}",
                (bx, by, bz + 0.16), (0.030, 0.030, 0.48),
                p["iron"], static, bevel=0.012,
            )
            cage.rotation_euler.z = math.radians(angle)
        side_light = base.light(
            f"PVP_LIGHT_side_brazier_{label}", "POINT",
            (bx, by - 0.16, bz + 0.34), 175.0,
            (1.0, 0.14, 0.018), static, radius=1.45,
        )
        side_light["war_room_runtime_dynamic"] = "pvp-side-brazier"

        # Premium ceremonial sentinel, independently authored for PvP but using
        # the proven gothic full-plate proportions from the V3 art language.
        # Sentinels belong to the fortress envelope, not the fighting dais.
        # The plinth sits almost flush with the side wall, in the clear bay
        # between buttresses, while the armour still faces the board.
        sx, sy = side * 7.55, 2.05
        build_gothic_sentinel(static, p, side, label, sx, sy)

        # Barrel + supply crate in the rear corner make the room feel occupied.
        cx, cy = side * 6.10, 4.92
        base.cylinder(
            f"PVP_DUEL_barrel_{label}", (cx, cy, 0.62),
            0.38, 1.05, p["oak_mid"], static, vertices=18,
        )
        for ring_idx, z in enumerate((0.20, 0.62, 1.04)):
            base.torus(
                f"PVP_DUEL_barrel_hoop_{label}_{ring_idx}",
                (cx, cy, z), 0.37, 0.026, p["iron"], static,
            )
        base.cube(
            f"PVP_DUEL_supply_crate_{label}", (side * 5.60, 5.02, 0.42),
            (0.40, 0.34, 0.42), p["oak"], static, bevel=0.045,
        )
        for brace in (-1, 1):
            diagonal=base.cube(
                f"PVP_DUEL_supply_crate_brace_{label}_{brace}",
                (side * 5.60, 4.67, 0.42),
                (0.055, 0.026, 0.45), p["iron"], static, bevel=0.012,
            )
            diagonal.rotation_euler.y = math.radians(brace * 38)


    # Mid-wall weapon racks add readable dungeon content in the hero crop.
    for side, label in ((-1, "left"), (1, "right")):
        rack_x = side * 5.55
        rack_y = 4.78
        base.cube(
            f"PVP_DUEL_mid_weapon_rack_{label}",
            (rack_x, rack_y, 2.15), (0.72, 0.055, 0.10),
            p["oak_mid"], static, bevel=0.028,
        )
        for weapon_idx, dx in enumerate((-0.42, 0.0, 0.42)):
            cylinder_between(
                f"PVP_DUEL_mid_weapon_{label}_{weapon_idx}",
                (rack_x + dx, rack_y, 1.25),
                (rack_x + dx, rack_y, 3.12),
                0.026, p["oak_mid"], static, vertices=10,
            )
            base.cube(
                f"PVP_DUEL_mid_weapon_blade_{label}_{weapon_idx}",
                (rack_x + dx - side * 0.06, rack_y - 0.035, 2.96),
                (0.10, 0.025, 0.16), p["armor"], static, bevel=0.020,
            )

    # Denser floor grates flank the dais, echoing the approved canon mock.
    for side, label in ((-1, "left"), (1, "right")):
        gx = side * 4.95
        base.cube(
            f"PVP_DUEL_floor_grate_spine_{label}", (gx, 0.35, 0.075),
            (0.10, 4.45, 0.025), p["iron"], static, bevel=0.012,
        )
        for idx, y in enumerate((-3.65, -3.05, -2.45, -1.85, -1.25, -0.65, -0.05, 0.55, 1.15, 1.75, 2.35, 2.95, 3.55, 4.15)):
            base.cube(
                f"PVP_DUEL_floor_grate_bar_{label}_{idx}",
                (gx, y, 0.095), (0.28, 0.035, 0.018),
                p["iron"], static, bevel=0.010,
            )


def build_sconces_and_gate(static, p):
    # Wall sconces and twin iron braziers make the fortress feel occupied.
    for side, label in ((-1, "left"), (1, "right")):
        wx, wy, wz = side * 3.72, 5.54, 3.72
        bracket = base.cylinder(
            f"PVP_DUEL_wall_sconce_bracket_{label}",
            (wx, wy, wz - 0.28), 0.035, 0.62, p["iron"], static, vertices=10,
        )
        bracket.rotation_euler.x = math.radians(90)
        base.cylinder(
            f"PVP_DUEL_wall_sconce_{label}",
            (wx, wy - 0.16, wz), 0.22, 0.14, p["iron"], static, vertices=12,
        )
        base.sphere(
            f"PVP_DUEL_wall_sconce_flame_{label}",
            (wx, wy - 0.17, wz + 0.25), 0.12, p["fire"], static,
            scale=(0.72, 0.60, 1.55),
        )
        base.sphere(
            f"PVP_DUEL_wall_sconce_core_{label}",
            (wx, wy - 0.18, wz + 0.36), 0.065, p["fire_core"], static,
            scale=(0.60, 0.52, 1.70),
        )
        wall_light = base.light(
            f"PVP_LIGHT_wall_sconce_{label}", "POINT",
            (wx, wy - 0.40, wz + 0.22), 85.0,
            (1.0, 0.19, 0.025), static, radius=1.0,
        )
        wall_light["war_room_runtime_dynamic"] = "pvp-wall-sconce"

    # Twin iron braziers remain the rear warm practicals.
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
            0.12, p["fire_core"], static, scale=(0.62, 0.56, 1.55),
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
    """Premium duelist chairs, angled so both seats unmistakably face the board."""
    for side, accent, label in ((-1, p["red"], "red"), (1, p["blue"], "blue")):
        # Chairs frame the duel from the wall. Their tall backs sit almost
        # flush with the side masonry while the seat still faces the board.
        x = side * 7.25
        y = -1.55
        yaw = math.atan2(-x, y)  # local -y is the seated player's forward direction
        cos_yaw = math.cos(yaw)
        sin_yaw = math.sin(yaw)

        def at(local_x, local_y, z):
            return (
                x + local_x * cos_yaw - local_y * sin_yaw,
                y + local_x * sin_yaw + local_y * cos_yaw,
                z,
            )

        def chair_cube(name, local, half, mat, *, bevel=0.02, local_yaw=0.0):
            obj = base.cube(
                f"PVP_DUEL_seat_{label}_{name}",
                at(local[0], local[1], local[2]),
                half, mat, static, bevel=bevel,
            )
            obj.rotation_euler.z = yaw + local_yaw
            return obj

        def chair_cylinder(name, local, radius, depth, mat, *, vertices=14):
            obj = base.cylinder(
                f"PVP_DUEL_seat_{label}_{name}",
                at(local[0], local[1], local[2]),
                radius, depth, mat, static, vertices=vertices,
            )
            obj.rotation_euler.z = yaw
            return obj

        # Seat frame + upholstered cushion. Keep the legacy seat name on the
        # structural frame because it is already part of the GLB contract.
        frame = base.cube(
            f"PVP_DUEL_seat_{label}",
            at(0.0, 0.0, 0.64),
            (0.88, 0.62, 0.14), p["oak"], static, bevel=0.080,
        )
        frame.rotation_euler.z = yaw
        frame["pvp_duel_faces_board"] = True
        chair_cube("cushion", (0.0, -0.02, 0.82), (0.75, 0.53, 0.13),
                   p["seat_leather"], bevel=0.12)

        # Four sturdy carved legs and a low apron.
        for leg_idx, (lx, ly) in enumerate(((-0.62, -0.39), (0.62, -0.39), (-0.62, 0.39), (0.62, 0.39))):
            chair_cylinder(f"leg_{leg_idx}", (lx, ly, 0.37), 0.085, 0.62, p["oak"], vertices=16)
            base.sphere(
                f"PVP_DUEL_seat_{label}_foot_{leg_idx}",
                at(lx, ly, 0.075), 0.095, p["brass"], static,
                scale=(1.0, 1.0, 0.55),
            )
        chair_cube("front_apron", (0.0, -0.50, 0.48), (0.72, 0.070, 0.18),
                   p["oak_mid"], bevel=0.045)

        # Tall throne-like back: dark oak frame, leather panel and restrained
        # PvP heraldry. The panel stays below the HUD and outside the board cone.
        for post_x in (-0.66, 0.66):
            chair_cylinder(f"back_post_{post_x:+.2f}", (post_x, 0.43, 1.47),
                           0.080, 1.62, p["oak"], vertices=16)
            base.sphere(
                f"PVP_DUEL_seat_{label}_finial_{post_x:+.2f}",
                at(post_x, 0.43, 2.28), 0.115, p["brass"], static,
            )
        chair_cube("back_frame", (0.0, 0.44, 1.76), (0.70, 0.085, 0.80),
                   p["oak"], bevel=0.10)
        chair_cube("back_leather", (0.0, 0.345, 1.76), (0.60, 0.050, 0.66),
                   p["seat_leather"], bevel=0.090)
        chair_cube("crest", (0.0, 0.325, 1.82), (0.20, 0.024, 0.24),
                   accent, bevel=0.065)
        chair_cube("crest_bar", (0.0, 0.30, 1.82), (0.28, 0.014, 0.045),
                   p["brass"], bevel=0.012)
        base.sphere(
            f"PVP_DUEL_seat_{label}_crest_medallion",
            at(0.0, 0.275, 1.82), 0.115, p["brass"], static,
            scale=(1.0, 0.34, 1.0),
        )
        for rail_idx, rail_x in enumerate((-0.54, 0.54)):
            chair_cube(
                f"back_rail_{rail_idx}",
                (rail_x, 0.405, 1.72), (0.055, 0.050, 0.62),
                p["brass"], bevel=0.018,
            )

        # Brass upholstery studs form a readable premium edge without a heavy
        # sculpt or texture dependency.
        stud_positions = (
            (-0.42, 0.305, 1.24), (0.42, 0.305, 1.24),
            (-0.42, 0.305, 1.64), (0.42, 0.305, 1.64),
            (-0.42, 0.305, 2.02), (0.42, 0.305, 2.02),
        )
        for stud_idx, (lx, ly, lz) in enumerate(stud_positions):
            base.sphere(
                f"PVP_DUEL_seat_{label}_stud_{stud_idx}",
                at(lx, ly, lz), 0.035, p["brass"], static,
            )

        # Carved armrests with a simple lion-boss cue on the forward cap.
        for arm_idx, arm_x in enumerate((-0.72, 0.72)):
            chair_cube(f"armrest_{arm_idx}", (arm_x, -0.02, 1.12),
                       (0.095, 0.50, 0.070), p["oak_mid"], bevel=0.050)
            chair_cylinder(f"arm_support_{arm_idx}", (arm_x, -0.18, 0.92),
                           0.065, 0.45, p["oak"], vertices=14)
            base.sphere(
                f"PVP_DUEL_seat_{label}_lion_boss_{arm_idx}",
                at(arm_x, -0.49, 1.13), 0.090, p["brass"], static,
                scale=(1.0, 0.72, 0.90),
            )

        chair_prefix = f"PVP_DUEL_seat_{label}"
        chair_scale = 1.12
        for obj in list(static.objects):
            if not obj.name.startswith(chair_prefix):
                continue
            obj.location.x = x + (obj.location.x - x) * chair_scale
            obj.location.y = y + (obj.location.y - y) * chair_scale
            obj.location.z *= chair_scale
            obj.scale = tuple(component * chair_scale for component in obj.scale)


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "pvp-duel-room"
    scene["pvp_duel_room_contract"] = CONTRACT
    scene.view_settings.exposure = 0.10

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

    for side, label in ((-1, "left"), (1, "right")):
        side_fill = base.light(
            f"PVP_LIGHT_side_fill_{label}", "AREA",
            (side * 6.30, 0.80, 4.60), 118.0,
            (0.80, 0.28, 0.08), static, size=2.7,
        )
        base.look_at(side_fill, (side * 7.30, 2.10, 1.90))

    base.anchor("PVP_ANCHOR_red_identity", (-4.92, 5.42, 3.42), static)
    base.anchor("PVP_ANCHOR_blue_identity", (4.92, 5.42, 3.42), static)
    base.anchor("PVP_ANCHOR_room_status", (0, 5.50, 5.58), static)
    base.anchor("PVP_ANCHOR_brazier_left", (-5.92, 5.14, 2.20), static)
    base.anchor("PVP_ANCHOR_brazier_right", (5.92, 5.14, 2.20), static)
    base.anchor("PVP_ANCHOR_side_brazier_left", (-6.55, 1.62, 3.62), static)
    base.anchor("PVP_ANCHOR_side_brazier_right", (6.55, 1.62, 3.62), static)
    base.anchor("PVP_ANCHOR_moon_fill", (0.0, 5.16, 6.48), static)
    base.anchor("PVP_ANCHOR_gate_depth", (0.0, 5.96, 3.25), static)

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
    build_dungeon_population(static, p)
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
        "PVP_DUEL_gate_winch_left",
        "PVP_DUEL_portcullis_tooth_0",
        "PVP_DUEL_inner_gate_pier_-1",
        "PVP_DUEL_inner_gate_floor",
        "PVP_DUEL_side_pier_left_0",
        "PVP_DUEL_chain_left_0_0",
        "PVP_DUEL_hanging_brazier_left",
        "PVP_DUEL_wall_sconce_left",
        "PVP_DUEL_sentinel_left_torso",
        "PVP_DUEL_sentinel_left_breastplate",
        "PVP_DUEL_sentinel_left_fauld_0",
        "PVP_DUEL_sentinel_left_gauntlet_0",
        "PVP_DUEL_sentinel_left_gorget_0",
        "PVP_DUEL_sentinel_left_tabard",
        "PVP_DUEL_mid_weapon_rack_left",
        "PVP_DUEL_barrel_left",
        "PVP_DUEL_floor_grate_spine_left",
        "PVP_DUEL_arrow_slit_left",
        "PVP_DUEL_armory_shield_left",
        "PVP_DUEL_halberd_left_0",
        "PVP_ROOM_window_glass",
        "PVP_DUEL_seat_red",
        "PVP_DUEL_seat_blue",
        "PVP_DUEL_seat_red_back_leather",
        "PVP_DUEL_seat_blue_back_leather",
        "PVP_DUEL_seat_red_lion_boss_0",
        "PVP_DUEL_seat_blue_lion_boss_0",
        "PVP_DUEL_seat_red_crest_medallion",
        "PVP_DUEL_seat_blue_crest_medallion",
        "PVP_ANCHOR_red_identity",
        "PVP_ANCHOR_blue_identity",
        "PVP_ANCHOR_room_status",
        "PVP_ANCHOR_brazier_left",
        "PVP_ANCHOR_brazier_right",
        "PVP_ANCHOR_side_brazier_left",
        "PVP_ANCHOR_side_brazier_right",
        "PVP_ANCHOR_moon_fill",
        "PVP_ANCHOR_gate_depth",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"PvP Duel Room contract objects missing: {missing}")

    def wall_gap_for_object(name, side):
        obj = bpy.data.objects[name]
        if obj.type != "MESH":
            raise RuntimeError(f"PvP Duel Room wall-contact object is not mesh: {name}")
        xs = [(obj.matrix_world @ Vector(corner)).x for corner in obj.bound_box]
        outer_x = min(xs) if side < 0 else max(xs)
        return SIDE_WALL_INNER_X - abs(outer_x)

    # Both seats must genuinely face the board. Local chair forward is -Y; after
    # yaw its world-space direction is (sin(yaw), -cos(yaw)). They also belong
    # to the wall band: the back nearly touches masonry and the chair centre
    # remains well outside the fighting dais.
    for label, side in (("red", -1), ("blue", 1)):
        seat = bpy.data.objects[f"PVP_DUEL_seat_{label}"]
        to_board = Vector((-seat.location.x, -seat.location.y))
        if to_board.length <= 0.01:
            raise RuntimeError(f"PvP Duel Room {label} seat has invalid board vector")
        to_board.normalize()
        yaw = float(seat.rotation_euler.z)
        forward = Vector((math.sin(yaw), -math.cos(yaw)))
        if forward.dot(to_board) < 0.985:
            raise RuntimeError(
                f"PvP Duel Room {label} seat does not face board: dot={forward.dot(to_board):.4f}"
            )
        seat_radius = math.hypot(seat.location.x, seat.location.y)
        if seat_radius < WALL_PROP_MIN_RADIUS:
            raise RuntimeError(
                f"PvP Duel Room {label} seat invades board safety band: radius={seat_radius:.3f}"
            )
        seat_gap = wall_gap_for_object(f"PVP_DUEL_seat_{label}_back_frame", side)
        if seat_gap < -0.08 or seat_gap > WALL_CONTACT_MAX_GAP:
            raise RuntimeError(
                f"PvP Duel Room {label} seat is not wall-adjacent: wall_gap={seat_gap:.3f}"
            )

    # Sentinel plinths obey the same spatial rule. Decorative guards must frame
    # the room from the masonry, never creep back toward the board.
    for label, side in (("left", -1), ("right", 1)):
        plinth = bpy.data.objects[f"PVP_DUEL_sentinel_{label}_plinth"]
        sentinel_radius = math.hypot(plinth.location.x, plinth.location.y)
        if sentinel_radius < WALL_PROP_MIN_RADIUS:
            raise RuntimeError(
                f"PvP Duel Room {label} sentinel invades board safety band: radius={sentinel_radius:.3f}"
            )
        sentinel_gap = wall_gap_for_object(f"PVP_DUEL_sentinel_{label}_plinth", side)
        if sentinel_gap < -0.08 or sentinel_gap > WALL_CONTACT_MAX_GAP:
            raise RuntimeError(
                f"PvP Duel Room {label} sentinel is not wall-adjacent: wall_gap={sentinel_gap:.3f}"
            )

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
    if selected < 190:
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
        "PVP_ANCHOR_gate_depth",
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
