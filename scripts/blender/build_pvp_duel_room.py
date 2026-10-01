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
        "armor": base.material(
            "PVP_MAT_armor_steel", (0.105, 0.115, 0.125, 1),
            metal=0.94, rough=0.31, coat=0.15, texture="metal", scale=28, bump=0.014,
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

        # Armoured sentinel on a low plinth, behind and outside the board.
        sx, sy = side * 5.72, 3.86
        base.cube(
            f"PVP_DUEL_sentinel_{label}_plinth", (sx, sy, 0.30),
            (0.48, 0.40, 0.30), p["dais"], static, bevel=0.07,
        )
        for leg_idx, dx in enumerate((-0.16, 0.16)):
            leg_side = -1 if leg_idx == 0 else 1
            # Proper articulated leg: pointed sabaton, instep, tapered greave,
            # winged poleyn, cuisse and a hanging tasset. These are the shapes
            # that survive the gameplay camera and stop the suit reading as a
            # stack of cylinders.
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_sabatons_{leg_idx}",
                (sx + dx, sy - 0.12, 0.49), 0.105, p["iron"], static,
                scale=(0.82, 1.90, 0.48),
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_instep_{leg_idx}",
                (sx + dx, sy - 0.03, 0.57), 0.095, p["armor"], static,
                scale=(0.92, 1.16, 0.62),
            )
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_greave_{leg_idx}",
                (sx + dx, sy, 0.82), 0.078, 0.105, 0.47,
                p["armor"], static,
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_knee_{leg_idx}",
                (sx + dx, sy - 0.04, 1.10), 0.105, p["armor"], static,
                scale=(1.0, 0.90, 1.0),
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_knee_wing_{leg_idx}",
                (sx + dx + leg_side * 0.085, sy - 0.03, 1.10),
                0.065, p["armor"], static, scale=(0.38, 0.92, 1.0),
            )
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_cuisse_{leg_idx}",
                (sx + dx, sy, 1.30), 0.098, 0.120, 0.38,
                p["armor"], static,
            )
            tasset = base.cube(
                f"PVP_DUEL_sentinel_{label}_tasset_{leg_idx}",
                (sx + dx + leg_side * 0.018, sy - 0.11, 1.43),
                (0.115, 0.018, 0.13), p["armor"], static, bevel=0.024,
            )
            tasset.rotation_euler.x = math.radians(-12)
            tasset.rotation_euler.y = math.radians(leg_side * 9)
        base.cube(
            f"PVP_DUEL_sentinel_{label}_torso", (sx, sy, 1.88),
            (0.38, 0.24, 0.52), p["armor"], static, bevel=0.10,
        )

        # Layered gothic plate over the structural torso.
        base.sphere(
            f"PVP_DUEL_sentinel_{label}_breastplate",
            (sx, sy - 0.04, 2.02), 0.34, p["armor"], static,
            scale=(0.92, 0.62, 1.02),
        )
        base.sphere(
            f"PVP_DUEL_sentinel_{label}_plackart",
            (sx, sy - 0.08, 1.78), 0.27, p["armor"], static,
            scale=(0.94, 0.64, 0.72),
        )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_breast_ridge",
            (sx, sy - 0.225, 2.02), (0.018, 0.015, 0.25),
            p["brass"], static, bevel=0.006,
        )
        # Three overlapping fauld lames bridge the cuirass and thighs.
        for lame_idx, (z, radius) in enumerate(((1.52, 0.29), (1.59, 0.30), (1.66, 0.31))):
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_fauld_{lame_idx}",
                (sx, sy, z), radius + 0.014, radius, 0.075,
                p["armor"], static, vertices=18,
            )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_belt", (sx, sy - 0.03, 1.47),
            (0.40, 0.27, 0.055), p["seat_leather"], static, bevel=0.025,
        )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_belt_buckle", (sx, sy - 0.295, 1.47),
            (0.050, 0.018, 0.043), p["brass"], static, bevel=0.010,
        )
        # Fluting catches the warm practicals without turning the cuirass into
        # jewellery; the centre ridge remains the primary gilt accent.
        for flute_idx, flute_x in enumerate((-0.12, 0.12)):
            flute = base.cube(
                f"PVP_DUEL_sentinel_{label}_breast_flute_{flute_idx}",
                (sx + flute_x, sy - 0.235, 2.02),
                (0.012, 0.010, 0.205), p["armor"], static, bevel=0.006,
            )
            flute.rotation_euler.y = math.radians(-8 if flute_x < 0 else 8)
        base.torus(
            f"PVP_DUEL_sentinel_{label}_neckline",
            (sx, sy - 0.02, 2.31), 0.145, 0.018, p["brass"], static,
        )
        for arm_idx, dx in enumerate((-0.43, 0.43)):
            arm=base.cylinder(
                f"PVP_DUEL_sentinel_{label}_arm_{arm_idx}",
                (sx + dx, sy, 1.90), 0.085, 0.82, p["armor"], static, vertices=14,
            )
            arm.rotation_euler.y = math.radians(8 if arm_idx == 0 else -8)

            arm_side = -1 if arm_idx == 0 else 1
            ax = sx + dx
            for lame_idx, (dz, radius, scale_z) in enumerate(((0.12, 0.18, 0.86), (0.04, 0.16, 0.72), (-0.04, 0.14, 0.62))):
                base.sphere(
                    f"PVP_DUEL_sentinel_{label}_pauldron_{arm_idx}_{lame_idx}",
                    (ax + arm_side * 0.018 * lame_idx, sy, 2.20 + dz),
                    radius, p["armor"], static,
                    scale=(1.12, 1.02, scale_z),
                )
            base.torus(
                f"PVP_DUEL_sentinel_{label}_pauldron_rim_{arm_idx}",
                (ax, sy, 2.30), 0.155, 0.014, p["brass"], static,
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_besagew_{arm_idx}",
                (ax - arm_side * 0.11, sy - 0.15, 2.11),
                0.060, p["brass"], static, scale=(1.0, 0.35, 1.0),
            )
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_rerebrace_{arm_idx}",
                (ax, sy, 1.93), 0.063, 0.072, 0.27,
                p["armor"], static,
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_elbow_{arm_idx}",
                (ax, sy - 0.02, 1.76), 0.088, p["armor"], static,
                scale=(1.0, 0.90, 1.0),
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_elbow_wing_{arm_idx}",
                (ax + arm_side * 0.075, sy - 0.015, 1.76),
                0.060, p["armor"], static, scale=(0.36, 1.0, 1.0),
            )
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_vambrace_{arm_idx}",
                (ax, sy - 0.02, 1.59), 0.055, 0.066, 0.25,
                p["armor"], static,
            )
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_gauntlet_cuff_{arm_idx}",
                (ax, sy - 0.035, 1.43), 0.073, 0.054, 0.09,
                p["iron"], static,
            )
            base.sphere(
                f"PVP_DUEL_sentinel_{label}_gauntlet_{arm_idx}",
                (ax, sy - 0.05, 1.35), 0.060, p["iron"], static,
                scale=(0.90, 1.12, 1.18),
            )
        for gorget_idx, (z, radius) in enumerate(((2.34, 0.155), (2.40, 0.135))):
            tapered_plate(
                f"PVP_DUEL_sentinel_{label}_gorget_{gorget_idx}",
                (sx, sy, z), radius + 0.012, radius, 0.055,
                p["armor"], static, vertices=18,
            )
        base.sphere(
            f"PVP_DUEL_sentinel_{label}_helmet", (sx, sy, 2.62),
            0.29, p["armor"], static, scale=(0.92, 0.90, 1.10),
        )
        base.sphere(
            f"PVP_DUEL_sentinel_{label}_visor_shell", (sx, sy - 0.16, 2.58),
            0.20, p["armor"], static, scale=(0.88, 0.72, 0.78),
        )
        base.sphere(
            f"PVP_DUEL_sentinel_{label}_visor_beak", (sx, sy - 0.31, 2.55),
            0.10, p["armor"], static, scale=(0.95, 1.25, 0.72),
        )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_visor", (sx, sy - 0.31, 2.62),
            (0.18, 0.026, 0.018), p["iron"], static, bevel=0.006,
        )
        for slit_idx, slit_x in enumerate((-0.075, 0.075)):
            base.cube(
                f"PVP_DUEL_sentinel_{label}_eye_slit_{slit_idx}",
                (sx + slit_x, sy - 0.335, 2.635),
                (0.052, 0.010, 0.010), p["iron"], static, bevel=0.003,
            )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_helm_comb", (sx, sy + 0.01, 2.92),
            (0.018, 0.12, 0.055), p["brass"], static, bevel=0.008,
        )
        cylinder_between(
            f"PVP_DUEL_sentinel_{label}_halberd",
            (sx - side * 0.56, sy + 0.02, 0.52),
            (sx - side * 0.56, sy + 0.02, 3.35),
            0.035, p["oak_mid"], static, vertices=12,
        )
        base.cube(
            f"PVP_DUEL_sentinel_{label}_halberd_blade",
            (sx - side * 0.66, sy, 3.08),
            (0.18, 0.035, 0.23), p["armor"], static, bevel=0.028,
        )
        bpy.ops.mesh.primitive_cone_add(
            vertices=12, radius1=0.055, radius2=0.0, depth=0.34,
            location=(sx - side * 0.56, sy + 0.02, 3.48),
        )
        spike = bpy.context.object
        spike.name = f"PVP_DUEL_sentinel_{label}_halberd_spike"
        spike.data.materials.append(p["armor"])
        base.tag(spike, base.ROLE_STATIC)
        base.relink(spike, static)

        sentinel_light = base.light(
            f"PVP_LIGHT_sentinel_{label}", "POINT",
            (sx, sy - 0.38, 1.35), 72.0,
            (0.72, 0.22, 0.06), static, radius=0.9,
        )
        sentinel_light["war_room_runtime_dynamic"] = "pvp-sentinel"

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
        x = side * 6.55
        y = -2.72
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
            (0.82, 0.58, 0.13), p["oak"], static, bevel=0.075,
        )
        frame.rotation_euler.z = yaw
        frame["pvp_duel_faces_board"] = True
        chair_cube("cushion", (0.0, -0.02, 0.80), (0.70, 0.49, 0.12),
                   p["seat_leather"], bevel=0.11)

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
        chair_cube("back_frame", (0.0, 0.44, 1.64), (0.62, 0.075, 0.66),
                   p["oak"], bevel=0.085)
        chair_cube("back_leather", (0.0, 0.355, 1.64), (0.52, 0.040, 0.53),
                   p["seat_leather"], bevel=0.075)
        chair_cube("crest", (0.0, 0.335, 1.73), (0.18, 0.022, 0.20),
                   accent, bevel=0.060)
        chair_cube("crest_bar", (0.0, 0.31, 1.74), (0.26, 0.014, 0.045),
                   p["brass"], bevel=0.012)

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
        base.look_at(side_fill, (side * 5.05, 3.10, 1.90))

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

    # Both seats must genuinely face the board. Local chair forward is -Y; after
    # yaw its world-space direction is (sin(yaw), -cos(yaw)).
    for label in ("red", "blue"):
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
