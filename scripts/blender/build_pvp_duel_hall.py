#!/usr/bin/env python3
"""Build the authored 3D shell for Chess Studio's PvP Sala de Duelos lobby.

This is NOT the live PvP Duel Room used once a match starts. It is the castle
lobby where players expose availability, browse rivals, handle challenges and
open the secondary room chat.

Blender owns only static architecture, furniture, authored lighting and stable
hotspot anchors. React/backend remain authoritative for roster, challenges,
ratings, presence, chat and handoff into the dedicated Duel Room.
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


CONTRACT = "pvp-duel-hall-gothic-lobby-v1"
HALL_WEATHER_MATERIALS = frozenset({
    "PVP_HALL_MAT_wall_stone",
    "PVP_HALL_MAT_floor_stone",
    "PVP_HALL_MAT_limestone",
})

HOTSPOTS = (
    "PVP_HALL_ANCHOR_identity",
    "PVP_HALL_ANCHOR_roster",
    "PVP_HALL_ANCHOR_herald",
    "PVP_HALL_ANCHOR_chat",
)


def clear_inherited_room(static):
    """Keep only shared camera plumbing + hidden board anchor needed by base manifest."""
    for obj in list(static.objects):
        if obj.name in {"WR_CAMERA_hero", "WR_ANCHOR_board_origin"}:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def palette():
    return {
        "wall": base.material(
            "PVP_HALL_MAT_wall_stone", (0.065, 0.058, 0.054, 1),
            rough=0.93, texture="stone", scale=5.6, bump=0.095, weather=True,
        ),
        "floor": base.material(
            "PVP_HALL_MAT_floor_stone", (0.052, 0.048, 0.045, 1),
            rough=0.88, texture="stone", scale=5.2, bump=0.060, weather=True,
        ),
        "limestone": base.material(
            "PVP_HALL_MAT_limestone", (0.29, 0.245, 0.19, 1),
            rough=0.84, texture="stone", scale=4.2, bump=0.055, weather=True,
        ),
        "oak": base.material(
            "PVP_HALL_MAT_dark_oak", (0.055, 0.018, 0.008, 1),
            rough=0.42, coat=0.20, texture="wood", scale=2.5, bump=0.055,
        ),
        "oak_mid": base.material(
            "PVP_HALL_MAT_oak_mid", (0.120, 0.042, 0.014, 1),
            rough=0.44, coat=0.18, texture="wood", scale=2.7, bump=0.048,
        ),
        "brass": base.material(
            "PVP_HALL_MAT_old_brass", (0.34, 0.145, 0.024, 1),
            metal=0.90, rough=0.34, coat=0.12, texture="metal", scale=30, bump=0.012,
        ),
        "iron": base.material(
            "PVP_HALL_MAT_black_iron", (0.012, 0.013, 0.015, 1),
            metal=0.88, rough=0.54, texture="metal", scale=28, bump=0.020,
        ),
        "velvet": base.material(
            "PVP_HALL_MAT_midnight_velvet", (0.008, 0.025, 0.072, 1),
            rough=0.80, sheen=0.16, texture="fabric", scale=48, bump=0.040,
        ),
        "parchment": base.material(
            "PVP_HALL_MAT_parchment", (0.55, 0.39, 0.19, 1),
            rough=0.78, texture="fabric", scale=34, bump=0.025,
        ),
        "leather": base.material(
            "PVP_HALL_MAT_leather", (0.115, 0.028, 0.014, 1),
            rough=0.42, coat=0.24, texture="leather", scale=44, bump=0.030,
        ),
        "moon": base.material(
            "PVP_HALL_MAT_moon_glass", (0.010, 0.035, 0.100, 1),
            rough=0.18, coat=0.42,
            emission=(0.025, 0.10, 0.28, 1), emission_strength=0.72,
        ),
        "glass": base.material(
            "PVP_HALL_MAT_display_glass", (0.20, 0.24, 0.28, 1),
            rough=0.12, coat=0.55,
        ),
        "ivory": base.material(
            "PVP_HALL_MAT_ivory", (0.56, 0.49, 0.37, 1),
            rough=0.64, coat=0.04,
        ),
        "fire": base.material(
            "PVP_HALL_MAT_fire", (0.88, 0.12, 0.005, 1),
            rough=0.22, emission=(0.58, 0.055, 0.002, 1), emission_strength=0.52,
        ),
    }


def build_envelope(static, p):
    base.cube("PVP_HALL_floor", (0, 0.8, -0.08), (8.8, 6.7, 0.08),
              p["floor"], static, bevel=0.03)
    base.cube("PVP_HALL_rear_wall", (0, 6.55, 3.6), (8.9, 0.32, 3.75),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_HALL_left_wall", (-8.60, 1.15, 3.35), (0.30, 5.3, 3.45),
              p["wall"], static, bevel=0.05)
    base.cube("PVP_HALL_right_wall", (8.60, 1.15, 3.35), (0.30, 5.3, 3.45),
              p["wall"], static, bevel=0.05)

    # Broad floor runner: physical composition, not a web card.
    base.cube("PVP_HALL_runner", (0.0, 0.15, 0.045), (4.55, 4.45, 0.025),
              p["velvet"], static, bevel=0.08)
    base.cube("PVP_HALL_runner_brass_left", (-4.48, 0.15, 0.074), (0.025, 4.34, 0.012),
              p["brass"], static, bevel=0.008)
    base.cube("PVP_HALL_runner_brass_right", (4.48, 0.15, 0.074), (0.025, 4.34, 0.012),
              p["brass"], static, bevel=0.008)

    # Repeating gothic bays keep the room legible at gameplay distance.
    for side in (-1, 1):
        for idx, y in enumerate((-2.7, 0.25, 3.20)):
            x = side * 7.95
            base.cube(
                f"PVP_HALL_pier_{side}_{idx}", (x, y, 3.0),
                (0.44, 0.48, 3.0), p["wall"], static, bevel=0.10,
            )
            base.cube(
                f"PVP_HALL_pier_cap_{side}_{idx}", (x, y, 5.95),
                (0.52, 0.56, 0.11), p["limestone"], static, bevel=0.04,
            )
            corbel = base.cube(
                f"PVP_HALL_corbel_{side}_{idx}", (x - side * 0.34, y, 5.55),
                (0.34, 0.25, 0.10), p["limestone"], static, bevel=0.04,
            )
            corbel.rotation_euler.y = math.radians(side * 24)

    # Large moon window at the rear-right, as in the approved premium composition.
    wx = 4.85
    base.cube("PVP_HALL_window_reveal", (wx, 6.06, 4.25), (2.05, 0.20, 2.36),
              p["limestone"], static, bevel=0.22)
    base.cube("PVP_HALL_window_glass", (wx, 5.80, 4.25), (1.72, 0.035, 2.02),
              p["moon"], static, bevel=0.18)
    base.cube("PVP_HALL_window_mullion", (wx, 5.68, 4.25), (0.045, 0.04, 1.90),
              p["iron"], static, bevel=0.012)
    for z in (3.35, 4.25, 5.15):
        base.cube(f"PVP_HALL_window_transom_{z:.2f}", (wx, 5.68, z),
                  (1.62, 0.04, 0.035), p["iron"], static, bevel=0.012)
    # Moon disk behind the window.
    moon = base.sphere("PVP_HALL_moon", (5.52, 6.16, 4.95), 0.82, p["ivory"], static,
                       scale=(1.0, 0.18, 1.0))
    moon["pvp_hall_background"] = True

    # Left heraldic banner + right matching pennant.
    for side, label in ((-1, "left"), (1, "right")):
        x = side * 6.55
        base.cube(f"PVP_HALL_banner_{label}", (x, 6.05, 4.35),
                  (0.78, 0.035, 1.38), p["velvet"], static, bevel=0.035)
        base.cube(f"PVP_HALL_banner_trim_{label}", (x, 6.00, 3.02),
                  (0.80, 0.045, 0.030), p["brass"], static, bevel=0.010)
        # restrained knight crest: head + neck only
        base.sphere(f"PVP_HALL_banner_crest_{label}", (x, 5.94, 4.60),
                    0.19, p["brass"], static, scale=(0.80, 0.35, 1.0))
        neck = base.cube(f"PVP_HALL_banner_crest_neck_{label}", (x, 5.94, 4.32),
                         (0.09, 0.035, 0.24), p["brass"], static, bevel=0.025)
        neck.rotation_euler.z = math.radians(side * 12)

    # Chandelier lives high enough to frame the hall without crossing hotspot UI.
    base.torus("PVP_HALL_chandelier_ring", (0, 0.85, 6.25), 1.15, 0.055,
               p["brass"], static)
    for idx, angle in enumerate(range(0, 360, 45)):
        rad = math.radians(angle)
        x, y = math.cos(rad) * 1.03, 0.85 + math.sin(rad) * 1.03
        base.cylinder(f"PVP_HALL_chandelier_candle_{idx}", (x, y, 6.45),
                      0.035, 0.34, p["ivory"], static, vertices=10)
        base.sphere(f"PVP_HALL_chandelier_flame_{idx}", (x, y, 6.68),
                    0.055, p["fire"], static, scale=(0.72, 0.72, 1.35))
    for idx, (sx, sy) in enumerate(((-0.78, 0.2), (0.78, 0.2), (0.0, 1.65))):
        base.cylinder(f"PVP_HALL_chandelier_chain_{idx}", (sx, sy, 7.15),
                      0.018, 1.50, p["iron"], static, vertices=8)


def build_identity_lectern(static, p):
    x, y = -5.65, -0.25
    base.cube("PVP_HALL_identity_plinth", (x, y, 0.38), (1.32, 0.95, 0.38),
              p["oak"], static, bevel=0.12)
    base.cube("PVP_HALL_identity_body", (x, y + 0.05, 1.15), (1.02, 0.72, 0.68),
              p["oak_mid"], static, bevel=0.10)
    top = base.cube("PVP_HALL_identity_top", (x, y - 0.05, 1.92), (1.28, 0.92, 0.11),
                    p["oak"], static, bevel=0.08)
    top.rotation_euler.x = math.radians(-4)
    base.cube("PVP_HALL_identity_brass_lip", (x, y - 0.92, 1.84), (1.18, 0.035, 0.055),
              p["brass"], static, bevel=0.014)

    # Big pawn under a display dome: recognizable even before HTML overlays load.
    base.cylinder("PVP_HALL_identity_pawn_base", (x, y, 2.12), 0.34, 0.16,
                  p["ivory"], static, vertices=24)
    base.sphere("PVP_HALL_identity_pawn_body", (x, y, 2.48), 0.28,
                p["ivory"], static, scale=(0.78, 0.78, 1.18))
    base.sphere("PVP_HALL_identity_pawn_head", (x, y, 2.86), 0.20,
                p["ivory"], static)
    base.cylinder("PVP_HALL_identity_dome", (x, y, 2.54), 0.56, 1.42,
                  p["glass"], static, vertices=32)
    base.torus("PVP_HALL_identity_dome_ring", (x, y, 1.84), 0.58, 0.035,
               p["brass"], static)

    # Heraldic shield-like boss.
    base.cube("PVP_HALL_identity_crest", (x, y - 0.74, 1.18), (0.28, 0.045, 0.34),
              p["velvet"], static, bevel=0.08)
    base.sphere("PVP_HALL_identity_crest_boss", (x, y - 0.80, 1.18), 0.10,
                p["brass"], static, scale=(1.0, 0.35, 1.0))

    base.anchor("PVP_HALL_ANCHOR_identity", (x, y - 0.92, 2.16), static)


def build_strategy_table(static, p):
    # Central table carries the rival register and herald dispatch.
    base.cube("PVP_HALL_strategy_top", (0, 0.25, 1.18), (3.55, 2.25, 0.14),
              p["oak"], static, bevel=0.14)
    base.cube("PVP_HALL_strategy_inlay", (0, 0.14, 1.34), (2.95, 1.66, 0.025),
              p["leather"], static, bevel=0.08)
    for side in (-1, 1):
        base.cube(f"PVP_HALL_strategy_runner_edge_{side}", (side * 2.78, 0.14, 1.37),
                  (0.026, 1.54, 0.012), p["brass"], static, bevel=0.008)
    for sx in (-2.75, 2.75):
        for sy in (-1.55, 1.55):
            base.cylinder(
                f"PVP_HALL_strategy_leg_{sx:+.2f}_{sy:+.2f}", (sx, 0.25 + sy, 0.56),
                0.17, 1.08, p["oak_mid"], static, vertices=16,
            )
            base.sphere(
                f"PVP_HALL_strategy_foot_{sx:+.2f}_{sy:+.2f}", (sx, 0.25 + sy, 0.07),
                0.20, p["brass"], static, scale=(1.0, 1.0, 0.50),
            )

    # Upright physical rival board at the rear edge.
    base.cube("PVP_HALL_roster_frame", (0, 2.02, 2.65), (3.12, 0.16, 1.48),
              p["oak"], static, bevel=0.11)
    base.cube("PVP_HALL_roster_surface", (0, 1.83, 2.65), (2.80, 0.035, 1.18),
              p["leather"], static, bevel=0.07)
    base.cube("PVP_HALL_roster_header", (0, 1.78, 3.57), (2.35, 0.025, 0.10),
              p["brass"], static, bevel=0.022)
    for row, z in enumerate((3.18, 2.72, 2.26)):
        base.cube(f"PVP_HALL_roster_row_{row}", (0, 1.74, z), (2.48, 0.018, 0.16),
                  p["parchment"], static, bevel=0.035)
        base.sphere(f"PVP_HALL_roster_medallion_{row}", (-2.12, 1.70, z), 0.10,
                    p["brass"], static, scale=(1.0, 0.35, 1.0))
        base.cube(f"PVP_HALL_roster_action_{row}", (2.06, 1.70, z), (0.28, 0.020, 0.10),
                  p["brass"], static, bevel=0.03)

    # Map / marquetry on table.
    base.cube("PVP_HALL_strategy_map", (0.20, -0.18, 1.39), (1.55, 0.95, 0.012),
              p["parchment"], static, bevel=0.06)
    for idx, (px, py) in enumerate(((-1.45, -0.85), (-0.95, -0.35), (1.15, -0.65), (1.55, 0.25))):
        base.cylinder(f"PVP_HALL_strategy_piece_{idx}", (px, py, 1.49), 0.08, 0.18,
                      p["ivory" if idx % 2 else "brass"], static, vertices=18)

    # Herald dispatch tray at the near edge, separate semantic anchor.
    base.cube("PVP_HALL_herald_tray", (0, -1.62, 1.48), (1.35, 0.48, 0.08),
              p["oak_mid"], static, bevel=0.08)
    scroll = base.cylinder("PVP_HALL_herald_scroll", (-0.20, -1.62, 1.62), 0.10, 1.45,
                           p["parchment"], static, vertices=20)
    scroll.rotation_euler.y = math.pi / 2
    base.sphere("PVP_HALL_herald_seal", (0.52, -1.70, 1.58), 0.105,
                p["leather"], static, scale=(1.0, 0.45, 1.0))

    base.anchor("PVP_HALL_ANCHOR_roster", (0, 1.52, 3.00), static)
    base.anchor("PVP_HALL_ANCHOR_herald", (0, -1.90, 1.88), static)


def build_chat_board(static, p):
    x, y = 5.70, -0.10
    base.cube("PVP_HALL_chat_frame", (x, y, 2.34), (1.68, 0.18, 1.78),
              p["oak"], static, bevel=0.12)
    base.cube("PVP_HALL_chat_parchment", (x, y - 0.20, 2.34), (1.42, 0.030, 1.46),
              p["parchment"], static, bevel=0.08)
    base.cube("PVP_HALL_chat_title_rail", (x, y - 0.25, 3.42), (1.05, 0.020, 0.07),
              p["brass"], static, bevel=0.020)
    for row, z in enumerate((2.93, 2.48, 2.03, 1.58)):
        base.cube(f"PVP_HALL_chat_line_{row}", (x, y - 0.25, z),
                  (1.08 - row * 0.08, 0.012, 0.028), p["oak_mid"], static, bevel=0.010)

    # Owl silhouette perched on the notice board.
    base.sphere("PVP_HALL_owl_body", (x + 0.95, y - 0.08, 4.12), 0.25,
                p["oak_mid"], static, scale=(0.78, 0.68, 1.10))
    base.sphere("PVP_HALL_owl_head", (x + 0.95, y - 0.08, 4.45), 0.19,
                p["oak_mid"], static)
    for side in (-1, 1):
        ear = base.cube(f"PVP_HALL_owl_ear_{side}", (x + 0.95 + side * 0.10, y - 0.08, 4.64),
                        (0.045, 0.035, 0.10), p["oak_mid"], static, bevel=0.016)
        ear.rotation_euler.y = math.radians(side * 18)
        base.sphere(f"PVP_HALL_owl_eye_{side}", (x + 0.95 + side * 0.065, y - 0.24, 4.48),
                    0.028, p["brass"], static, scale=(1.0, 0.5, 1.0))

    # Books + scrolls at the base make the chat board a used object.
    for idx, z in enumerate((0.28, 0.40, 0.52)):
        base.cube(f"PVP_HALL_chat_book_{idx}", (x - 0.92 + idx * 0.08, y - 0.10, z),
                  (0.52 - idx * 0.06, 0.32, 0.055),
                  p["leather" if idx != 1 else "velvet"], static, bevel=0.025)
    rolled = base.cylinder("PVP_HALL_chat_scroll", (x + 0.72, y - 0.10, 0.40),
                           0.10, 0.88, p["parchment"], static, vertices=18)
    rolled.rotation_euler.y = math.pi / 2

    base.anchor("PVP_HALL_ANCHOR_chat", (x, y - 0.35, 2.45), static)


def build_population(static, p):
    # Two restrained suits of armour at the rear wall. They are ambient, not hotspots.
    for side, label in ((-1, "left"), (1, "right")):
        x, y = side * 3.55, 5.45
        base.cylinder(f"PVP_HALL_armor_plinth_{label}", (x, y, 0.24), 0.46, 0.30,
                      p["limestone"], static, vertices=8)
        base.cylinder(f"PVP_HALL_armor_legs_{label}", (x, y, 1.08), 0.16, 1.35,
                      p["iron"], static, vertices=16)
        base.sphere(f"PVP_HALL_armor_torso_{label}", (x, y, 2.02), 0.35,
                    p["iron"], static, scale=(0.88, 0.55, 1.10))
        base.sphere(f"PVP_HALL_armor_helm_{label}", (x, y, 2.58), 0.19,
                    p["iron"], static, scale=(0.92, 0.95, 1.05))
        base.cylinder(f"PVP_HALL_armor_halberd_{label}", (x + side * 0.38, y, 1.75),
                      0.022, 3.18, p["oak_mid"], static, vertices=10)
        base.cube(f"PVP_HALL_armor_halberd_blade_{label}",
                  (x + side * 0.47, y, 3.20), (0.12, 0.025, 0.18),
                  p["brass"], static, bevel=0.025)

    # Candle practicals frame the three physical lobby zones.
    for idx, (x, y) in enumerate(((-7.05, -1.25), (-3.20, 3.95), (3.10, 3.95), (7.10, -1.20))):
        base.cylinder(f"PVP_HALL_candle_{idx}", (x, y, 1.48), 0.045, 0.62,
                      p["ivory"], static, vertices=10)
        base.sphere(f"PVP_HALL_candle_flame_{idx}", (x, y, 1.86), 0.070,
                    p["fire"], static, scale=(0.68, 0.68, 1.45))


def build_lighting(static):
    scene = bpy.context.scene
    scene["pvp_duel_hall_contract"] = CONTRACT
    scene.view_settings.exposure = 0.22

    moon = base.light("PVP_HALL_LIGHT_moon", "AREA", (5.3, 5.2, 6.5), 520.0,
                      (0.18, 0.34, 0.74), static, size=4.2)
    base.look_at(moon, (1.2, 0.3, 1.6))

    warm = base.light("PVP_HALL_LIGHT_chandelier", "POINT", (0.0, 0.8, 5.9), 315.0,
                      (1.0, 0.34, 0.08), static, radius=1.6)
    warm["war_room_runtime_dynamic"] = "pvp-hall-chandelier"

    for idx, (x, y) in enumerate(((-5.7, -0.3), (0.0, 0.3), (5.7, -0.1))):
        lamp = base.light(f"PVP_HALL_LIGHT_zone_{idx}", "AREA", (x, y - 0.8, 4.5), 175.0,
                          (0.95, 0.48, 0.18), static, size=2.2)
        base.look_at(lamp, (x, y, 1.7))

    fill = base.light("PVP_HALL_LIGHT_front_fill", "AREA", (0.0, -5.5, 4.2), 135.0,
                      (0.34, 0.38, 0.48), static, size=5.0)
    base.look_at(fill, (0.0, 0.4, 1.7))


def bake_weather():
    base.WEATHER_MATERIALS = HALL_WEATHER_MATERIALS
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH" or obj.get("war_room_role") != base.ROLE_STATIC:
            continue
        if any(mat and mat.name in HALL_WEATHER_MATERIALS for mat in obj.data.materials):
            base._bake_weather_colors(obj)


def apply_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("PvP Duel Hall inherited static collection missing")
    clear_inherited_room(static)
    p = palette()
    build_envelope(static, p)
    build_identity_lectern(static, p)
    build_strategy_table(static, p)
    build_chat_board(static, p)
    build_population(static, p)
    build_lighting(static)
    bake_weather()

    for obj in bpy.context.scene.objects:
        if obj.get("war_room_role"):
            obj["pvp_duel_hall_contract"] = CONTRACT


def validate_scene():
    names = {obj.name for obj in bpy.context.scene.objects}
    required = {
        "PVP_HALL_floor",
        "PVP_HALL_window_glass",
        "PVP_HALL_identity_plinth",
        "PVP_HALL_identity_pawn_head",
        "PVP_HALL_strategy_top",
        "PVP_HALL_roster_frame",
        "PVP_HALL_herald_tray",
        "PVP_HALL_chat_frame",
        "PVP_HALL_owl_body",
        *HOTSPOTS,
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"PvP Duel Hall contract objects missing: {missing}")

    forbidden = sorted(
        name for name in names
        if name.startswith(("WR_ARCH_", "WR_CANON_", "WR3_OBS_", "PVP_DUEL_"))
    )
    if forbidden:
        raise RuntimeError(f"PvP Duel Hall inherited visible gameplay-room geometry: {forbidden[:12]}")

    camera = bpy.context.scene.camera
    camera.data.lens = 47.0
    camera.location = (0.0, -16.4, 7.65)
    base.look_at(camera, (0.0, 0.85, 2.08))

    # Hotspots must be spatially distinct. A single central overlay would regress
    # the physical-room contract back into a dashboard.
    coords = [bpy.data.objects[name].matrix_world.translation.copy() for name in HOTSPOTS]
    for i, first in enumerate(coords):
        for second in coords[i + 1:]:
            if (first - second).length < 2.2:
                raise RuntimeError("PvP Duel Hall hotspot anchors overlap")


def export_shell(path):
    links, textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["pvp_duel_hall_runtime_material_links_removed"] = links
    scene["pvp_duel_hall_runtime_texture_count"] = textures
    base.WEATHER_MATERIALS = HALL_WEATHER_MATERIALS
    base.strip_unused_weather_layers()

    bpy.ops.object.select_all(action="DESELECT")
    selected = 0
    for obj in scene.objects:
        is_static = obj.type == "MESH" and obj.get("war_room_role") == base.ROLE_STATIC
        is_anchor = obj.type == "EMPTY" and obj.name.startswith("PVP_HALL_ANCHOR_")
        if is_static or is_anchor:
            obj.select_set(True)
            selected += 1
    if selected < 70:
        raise RuntimeError(f"PvP Duel Hall runtime selection too small: {selected}")

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
        raise RuntimeError(f"PvP Duel Hall runtime factor patch too small: {patched}")

    data = base.read_glb_json(path)
    if base.MESH_COMPRESSION_EXTENSION not in set(data.get("extensionsUsed", [])):
        raise RuntimeError("PvP Duel Hall runtime GLB missing meshopt")
    node_names = {row.get("name") for row in data.get("nodes", [])}
    for anchor in HOTSPOTS:
        if anchor not in node_names:
            raise RuntimeError(f"PvP Duel Hall runtime anchor missing: {anchor}")


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
    print(f"PvP Duel Hall OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
