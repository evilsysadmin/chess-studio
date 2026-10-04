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
    """Keep only shared camera plumbing + hidden board anchor needed by base manifest.

    The War Room builder also creates preview board/piece geometry in a separate
    collection. Lobby authoring must remove that too or the Hall renders as a
    chess arena instead of a matchmaking room.
    """
    for obj in list(bpy.context.scene.objects):
        if obj.name in {"WR_CAMERA_hero", "WR_ANCHOR_board_origin"}:
            continue
        if obj.name.startswith("WR_PREVIEW_") or obj.name in static.objects:
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
        "burgundy": base.material(
            "PVP_HALL_MAT_burgundy_velvet", (0.145, 0.012, 0.018, 1),
            rough=0.78, sheen=0.14, texture="fabric", scale=46, bump=0.038,
        ),
        "parchment": base.material(
            "PVP_HALL_MAT_parchment", (0.32, 0.19, 0.075, 1),
            rough=0.82, texture="fabric", scale=34, bump=0.030,
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
        "moon_disk": base.material(
            "PVP_HALL_MAT_moon_disk", (0.82, 0.86, 0.78, 1),
            rough=0.58,
            emission=(0.46, 0.53, 0.72, 1), emission_strength=0.42,
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

    # Large moon window at the rear-right, now framed as a pointed gothic bay
    # rather than a modern rectangle.
    wx = 4.85
    base.cube("PVP_HALL_window_glass", (wx, 5.80, 4.25), (1.72, 0.035, 2.02),
              p["moon"], static, bevel=0.12)
    for side in (-1, 1):
        base.cube(
            f"PVP_HALL_window_jamb_{side}", (wx + side * 1.88, 5.96, 4.20),
            (0.18, 0.18, 2.10), p["limestone"], static, bevel=0.08,
        )
        arch = base.cube(
            f"PVP_HALL_window_arch_{side}", (wx + side * 0.90, 5.96, 6.18),
            (1.08, 0.18, 0.16), p["limestone"], static, bevel=0.07,
        )
        arch.rotation_euler.y = math.radians(-side * 31)
    base.cube("PVP_HALL_window_sill", (wx, 5.96, 2.18), (1.96, 0.20, 0.16),
              p["limestone"], static, bevel=0.06)
    base.cube("PVP_HALL_window_mullion", (wx, 5.68, 4.20), (0.045, 0.04, 1.82),
              p["iron"], static, bevel=0.012)
    for z in (3.36, 4.20, 5.04):
        base.cube(f"PVP_HALL_window_transom_{z:.2f}", (wx, 5.68, z),
                  (1.60, 0.04, 0.035), p["iron"], static, bevel=0.012)

    # Put the moon in front of the opaque blue glass material so the authored
    # silhouette survives both Eevee preview and the sanitized runtime GLB.
    moon = base.sphere("PVP_HALL_moon", (5.45, 5.72, 4.98), 0.76, p["moon_disk"], static,
                       scale=(1.0, 0.10, 1.0))
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


def build_castle_dressing(static, p):
    """Add occupied-castle depth around the four functional lobby stations."""

    # Irregular rear-wall ashlar relief. Keep the moon bay and the centre of
    # the rival board readable; the stones should frame furniture, not fight it.
    stone_idx = 0
    for row in range(6):
        z = 0.72 + row * 0.88
        offset = 0.48 if row % 2 else 0.0
        for col in range(-8, 9):
            x = col * 1.02 + offset
            if 2.55 < x < 7.15 and 1.85 < z < 6.65:
                continue
            if abs(x) < 3.25 and z < 4.55:
                continue
            if abs(x) > 8.2:
                continue
            width = 0.43 + 0.035 * ((row + col) % 3)
            height = 0.32 + 0.020 * ((row * 2 + col) % 3)
            block = base.cube(
                f"PVP_HALL_masonry_{stone_idx}", (x, 6.17, z),
                (width, 0.045, height), p["wall"], static, bevel=0.030,
            )
            block.rotation_euler.z = math.radians(((row * 7 + col * 3) % 5 - 2) * 0.35)
            stone_idx += 1

    # Floor flagstones outside the central runner make the room feel authored
    # instead of like furniture standing on one featureless slab.
    tile_idx = 0
    for row in range(-4, 5):
        y = row * 1.22 + 0.32
        for side in (-1, 1):
            for lane in (5.45, 6.65, 7.82):
                x = side * lane
                tile = base.cube(
                    f"PVP_HALL_floor_tile_{tile_idx}", (x, y, 0.018),
                    (0.53, 0.52, 0.022), p["floor"], static, bevel=0.018,
                )
                tile.rotation_euler.z = math.radians(((tile_idx * 3) % 5 - 2) * 0.4)
                tile_idx += 1

    # Rear-left library bay: a small but dense castle-life cue behind Tu puesto.
    lib_x = -6.55
    base.cube("PVP_HALL_library_back", (lib_x, 5.92, 2.30), (1.05, 0.18, 2.05),
              p["oak"], static, bevel=0.08)
    for shelf_idx, z in enumerate((0.68, 1.45, 2.22, 2.99, 3.76)):
        base.cube(
            f"PVP_HALL_library_shelf_{shelf_idx}", (lib_x, 5.67, z),
            (0.94, 0.25, 0.055), p["oak_mid"], static, bevel=0.025,
        )
    book_idx = 0
    for shelf_z, count in ((0.82, 6), (1.59, 7), (2.36, 6), (3.13, 5)):
        for idx in range(count):
            bx = lib_x - 0.72 + idx * (1.44 / max(1, count - 1))
            h = 0.19 + 0.025 * ((idx + book_idx) % 3)
            mat = p["burgundy"] if idx % 3 == 0 else (p["velvet"] if idx % 3 == 1 else p["leather"])
            base.cube(
                f"PVP_HALL_library_book_{book_idx}", (bx, 5.40, shelf_z + h),
                (0.075, 0.11, h), mat, static, bevel=0.012,
            )
            book_idx += 1
    for side in (-1, 1):
        base.cylinder(
            f"PVP_HALL_library_post_{side}", (lib_x + side * 0.96, 5.58, 2.25),
            0.075, 3.95, p["oak_mid"], static, vertices=14,
        )
        base.sphere(
            f"PVP_HALL_library_finial_{side}", (lib_x + side * 0.96, 5.58, 4.26),
            0.10, p["brass"], static,
        )

    # Narrow wall sconces: warm pools along the rear wall, with silhouettes
    # clear enough to read at the lobby camera distance.
    for idx, x in enumerate((-4.15, -1.85, 1.85, 3.05, 7.15)):
        base.cube(
            f"PVP_HALL_sconce_mount_{idx}", (x, 5.82, 4.38),
            (0.08, 0.06, 0.28), p["iron"], static, bevel=0.018,
        )
        arm = base.cylinder(
            f"PVP_HALL_sconce_arm_{idx}", (x, 5.48, 4.30),
            0.022, 0.58, p["iron"], static, vertices=10,
        )
        arm.rotation_euler.x = math.pi / 2
        base.cylinder(
            f"PVP_HALL_sconce_candle_{idx}", (x, 5.22, 4.48),
            0.042, 0.34, p["ivory"], static, vertices=10,
        )
        base.sphere(
            f"PVP_HALL_sconce_flame_{idx}", (x, 5.22, 4.70),
            0.062, p["fire"], static, scale=(0.65, 0.65, 1.45),
        )

    # Carved front apron and heraldic boss give the strategy table the visual
    # weight of ceremonial furniture instead of a modern desk.
    base.cube("PVP_HALL_strategy_front_apron", (0, -1.93, 0.82), (3.15, 0.13, 0.38),
              p["oak_mid"], static, bevel=0.09)
    base.cube("PVP_HALL_strategy_front_inlay", (0, -2.075, 0.84), (1.72, 0.025, 0.18),
              p["burgundy"], static, bevel=0.05)
    base.sphere("PVP_HALL_strategy_front_boss", (0, -2.12, 0.84), 0.16,
                p["brass"], static, scale=(1.0, 0.34, 1.0))
    for side in (-1, 1):
        brace = base.cube(
            f"PVP_HALL_strategy_front_brace_{side}", (side * 2.62, -1.93, 0.72),
            (0.10, 0.10, 0.48), p["oak"], static, bevel=0.035,
        )
        brace.rotation_euler.y = math.radians(side * 18)

    # A burgundy under-table carpet with a brass border brings the approved
    # mock's warm ceremonial centre back into a very dark room.
    base.cube("PVP_HALL_central_rug", (0, -0.05, 0.086), (3.85, 2.78, 0.018),
              p["burgundy"], static, bevel=0.08)
    for x in (-3.73, 3.73):
        base.cube(f"PVP_HALL_central_rug_edge_x_{x:+.2f}", (x, -0.05, 0.108),
                  (0.025, 2.62, 0.010), p["brass"], static, bevel=0.006)
    for y in (-2.65, 2.55):
        base.cube(f"PVP_HALL_central_rug_edge_y_{y:+.2f}", (0, y, 0.108),
                  (3.70, 0.025, 0.010), p["brass"], static, bevel=0.006)


def build_gothic_architecture_pass(static, p):
    """Break the dashboard silhouette with three authored gothic bays and tracery."""

    # Three pointed arches align with the lobby's semantic zones. They are kept
    # shallow and behind furniture so they read as architecture, never panels.
    bays = (
        (-5.65, 3.55, 1.62, "identity"),
        (0.00, 4.05, 2.55, "roster"),
        (5.70, 3.65, 1.72, "chat"),
    )
    for cx, spring_z, half_w, label in bays:
        for side in (-1, 1):
            base.cube(
                f"PVP_HALL_bay_jamb_{label}_{side}",
                (cx + side * half_w, 6.02, 2.25),
                (0.17, 0.16, 1.95), p["limestone"], static, bevel=0.055,
            )
            arch = base.cube(
                f"PVP_HALL_bay_arch_{label}_{side}",
                (cx + side * half_w * 0.50, 6.00, spring_z + 1.18),
                (half_w * 0.58, 0.16, 0.14), p["limestone"], static, bevel=0.050,
            )
            arch.rotation_euler.y = math.radians(-side * 30)
        base.cube(
            f"PVP_HALL_bay_keystone_{label}", (cx, 5.86, spring_z + 1.82),
            (0.16, 0.20, 0.24), p["brass"], static, bevel=0.045,
        )

    # Replace the "office window" reading with lancet-style tracery over the
    # existing moon glass. Bars are vertical and radial instead of a square grid.
    wx = 4.85
    for xoff in (-0.58, 0.58):
        base.cube(
            f"PVP_HALL_window_lancet_{xoff:+.2f}", (wx + xoff, 5.64, 4.28),
            (0.030, 0.035, 1.70), p["iron"], static, bevel=0.008,
        )
    for side in (-1, 1):
        spoke = base.cube(
            f"PVP_HALL_window_tracery_spoke_{side}",
            (wx + side * 0.40, 5.64, 5.52),
            (0.48, 0.030, 0.028), p["iron"], static, bevel=0.008,
        )
        spoke.rotation_euler.y = math.radians(-side * 31)

    # Three small hanging velvet status plaques establish the premium hall
    # rhythm without competing with the future live HTML labels.
    for idx, (x, label) in enumerate(((-2.1, "left"), (0.0, "center"), (2.1, "right"))):
        base.cube(
            f"PVP_HALL_status_plaque_{label}", (x, 4.95, 5.42),
            (0.72, 0.07, 0.34), p["velvet"], static, bevel=0.060,
        )
        base.cube(
            f"PVP_HALL_status_plaque_trim_{label}", (x, 4.86, 5.42),
            (0.76, 0.018, 0.37), p["brass"], static, bevel=0.025,
        )
        # Re-layer the velvet face slightly toward camera so brass reads as frame.
        base.cube(
            f"PVP_HALL_status_plaque_face_{label}", (x, 4.82, 5.42),
            (0.66, 0.012, 0.29), p["velvet"], static, bevel=0.045,
        )
        for side in (-1, 1):
            chain = base.cylinder(
                f"PVP_HALL_status_chain_{label}_{side}",
                (x + side * 0.48, 4.96, 6.02),
                0.012, 0.82, p["iron"], static, vertices=8,
            )

    # Tabletop clutter is peripheral and low: books, scroll tubes and wax pots
    # create an occupied strategy desk while preserving the central UI plane.
    for idx, (x, y, z, sx, sy) in enumerate((
        (-2.45, 0.98, 1.50, 0.44, 0.30),
        (-2.28, 1.18, 1.61, 0.38, 0.27),
        (2.42, 0.95, 1.50, 0.42, 0.28),
    )):
        base.cube(
            f"PVP_HALL_table_book_{idx}", (x, y, z),
            (sx, sy, 0.055), p["leather" if idx != 1 else "velvet"], static, bevel=0.025,
        )
    for idx, (x, y) in enumerate(((-2.40, -0.72), (2.35, -0.60))):
        tube = base.cylinder(
            f"PVP_HALL_table_scroll_{idx}", (x, y, 1.52),
            0.08, 0.82, p["parchment"], static, vertices=18,
        )
        tube.rotation_euler.y = math.pi / 2
        base.sphere(
            f"PVP_HALL_table_wax_{idx}", (x + (0.52 if idx == 0 else -0.50), y, 1.47),
            0.07, p["burgundy"], static, scale=(1.0, 1.0, 0.65),
        )


def build_identity_lectern(static, p):
    x, y = -5.65, -0.20
    base.cube("PVP_HALL_identity_plinth", (x, y, 0.42), (1.55, 1.10, 0.42),
              p["oak"], static, bevel=0.12)
    base.cube("PVP_HALL_identity_body", (x, y + 0.05, 1.24), (1.18, 0.82, 0.76),
              p["oak_mid"], static, bevel=0.10)
    top = base.cube("PVP_HALL_identity_top", (x, y - 0.05, 2.08), (1.48, 1.02, 0.12),
                    p["oak"], static, bevel=0.08)
    top.rotation_euler.x = math.radians(-4)
    base.cube("PVP_HALL_identity_brass_lip", (x, y - 0.92, 1.84), (1.18, 0.035, 0.055),
              p["brass"], static, bevel=0.014)
    # Carved front posts and heraldic cloth give the station a lectern silhouette
    # instead of reading as a generic cabinet.
    for side in (-1, 1):
        base.cylinder(
            f"PVP_HALL_identity_post_{side}", (x + side * 1.06, y - 0.70, 1.30),
            0.085, 1.22, p["oak"], static, vertices=16,
        )
        base.sphere(
            f"PVP_HALL_identity_post_finial_{side}", (x + side * 0.92, y - 0.62, 1.80),
            0.105, p["brass"], static,
        )
    base.cube("PVP_HALL_identity_heraldry", (x, y - 0.735, 1.20), (0.46, 0.024, 0.42),
              p["velvet"], static, bevel=0.06)
    base.cube("PVP_HALL_identity_heraldry_cross", (x, y - 0.765, 1.20), (0.30, 0.018, 0.045),
              p["brass"], static, bevel=0.01)

    # Big pawn under a display dome: recognizable even before HTML overlays load.
    base.cylinder("PVP_HALL_identity_pawn_base", (x, y, 2.34), 0.39, 0.18,
                  p["ivory"], static, vertices=24)
    base.sphere("PVP_HALL_identity_pawn_body", (x, y, 2.74), 0.32,
                p["ivory"], static, scale=(0.78, 0.78, 1.18))
    base.sphere("PVP_HALL_identity_pawn_head", (x, y, 3.18), 0.23,
                p["ivory"], static)
    # Open brass display cage reads as a premium vitrine in Eevee/GLB without
    # relying on fragile alpha/transmission settings. The pawn stays visible.
    base.torus("PVP_HALL_identity_dome_ring", (x, y, 2.05), 0.66, 0.040,
               p["brass"], static)
    base.torus("PVP_HALL_identity_dome_crown", (x, y, 3.55), 0.34, 0.028,
               p["brass"], static)
    for rib_idx, angle in enumerate((0, 60, 120)):
        rad = math.radians(angle)
        rib = base.cube(
            f"PVP_HALL_identity_dome_rib_{rib_idx}",
            (x + math.cos(rad) * 0.48, y + math.sin(rad) * 0.48, 2.80),
            (0.020, 0.020, 0.72), p["brass"], static, bevel=0.008,
        )
        rib.rotation_euler.z = rad

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
    base.cube("PVP_HALL_roster_frame", (0, 1.92, 2.48), (2.90, 0.16, 1.18),
              p["oak"], static, bevel=0.11)
    base.cube("PVP_HALL_roster_surface", (0, 1.73, 2.48), (2.58, 0.035, 0.92),
              p["leather"], static, bevel=0.07)
    base.cube("PVP_HALL_roster_header", (0, 1.68, 3.18), (2.15, 0.025, 0.09),
              p["brass"], static, bevel=0.022)
    for side in (-1, 1):
        base.cylinder(
            f"PVP_HALL_roster_post_{side}", (side * 2.66, 1.73, 2.50),
            0.080, 1.72, p["oak_mid"], static, vertices=14,
        )
        base.sphere(
            f"PVP_HALL_roster_finial_{side}", (side * 2.66, 1.73, 3.38),
            0.12, p["brass"], static,
        )
    base.cube("PVP_HALL_roster_crown", (0, 1.72, 3.50), (1.12, 0.08, 0.14),
              p["oak_mid"], static, bevel=0.08)
    base.sphere("PVP_HALL_roster_crown_boss", (0, 1.60, 3.50), 0.13,
                p["brass"], static, scale=(1.0, 0.32, 1.0))
    for row, z in enumerate((2.93, 2.50, 2.07)):
        base.cube(f"PVP_HALL_roster_row_{row}", (0, 1.64, z), (2.30, 0.018, 0.14),
                  p["parchment"], static, bevel=0.035)
        base.sphere(f"PVP_HALL_roster_medallion_{row}", (-1.98, 1.60, z), 0.09,
                    p["brass"], static, scale=(1.0, 0.35, 1.0))
        base.cube(f"PVP_HALL_roster_action_{row}", (1.94, 1.60, z), (0.24, 0.020, 0.09),
                  p["brass"], static, bevel=0.03)

    # Map / marquetry on table.
    base.cube("PVP_HALL_strategy_map", (0.20, -0.18, 1.39), (1.55, 0.95, 0.012),
              p["parchment"], static, bevel=0.06)
    for idx, (px, py) in enumerate(((-1.45, -0.85), (-0.95, -0.35), (1.15, -0.65), (1.55, 0.25))):
        base.cylinder(f"PVP_HALL_strategy_piece_{idx}", (px, py, 1.49), 0.08, 0.18,
                      p["ivory" if idx % 2 else "brass"], static, vertices=18)

    # Herald dispatch tray at the near edge, separate semantic anchor.
    base.cube("PVP_HALL_herald_runner", (0, -1.38, 1.39), (1.70, 0.62, 0.018),
              p["burgundy"], static, bevel=0.05)
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
    x, y = 5.70, 0.05
    base.cube("PVP_HALL_chat_frame", (x, y, 2.30), (1.42, 0.17, 1.50),
              p["oak"], static, bevel=0.12)
    base.cube("PVP_HALL_chat_parchment", (x, y - 0.20, 2.30), (1.16, 0.030, 1.18),
              p["parchment"], static, bevel=0.08)
    base.cube("PVP_HALL_chat_title_rail", (x, y - 0.25, 3.42), (1.05, 0.020, 0.07),
              p["brass"], static, bevel=0.020)
    # Carved gable + brass bosses stop the notice board reading as a flat monitor.
    for side in (-1, 1):
        gable = base.cube(
            f"PVP_HALL_chat_gable_{side}", (x + side * 0.60, y - 0.10, 3.66),
            (0.68, 0.10, 0.10), p["oak_mid"], static, bevel=0.05,
        )
        gable.rotation_euler.y = math.radians(-side * 24)
        for z in (1.02, 3.62):
            base.sphere(
                f"PVP_HALL_chat_boss_{side}_{z:.2f}", (x + side * 1.48, y - 0.25, z),
                0.075, p["brass"], static, scale=(1.0, 0.38, 1.0),
            )
    for row, z in enumerate((2.78, 2.42, 2.06, 1.70)):
        base.cube(f"PVP_HALL_chat_line_{row}", (x, y - 0.25, z),
                  (0.90 - row * 0.07, 0.012, 0.026), p["oak_mid"], static, bevel=0.010)

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
    # Two articulated sentinel silhouettes occupy the rear side bays. They are
    # deliberately secondary to the functional furniture but must actually read.
    for side, label in ((-1, "left"), (1, "right")):
        x, y = side * 6.75, 4.55
        base.cylinder(f"PVP_HALL_armor_plinth_{label}", (x, y, 0.22), 0.46, 0.28,
                      p["limestone"], static, vertices=8)
        for leg_idx, leg_x in enumerate((-0.13, 0.13)):
            base.cylinder(
                f"PVP_HALL_armor_leg_{label}_{leg_idx}", (x + leg_x, y, 0.94),
                0.075, 1.18, p["iron"], static, vertices=14,
            )
        base.sphere(f"PVP_HALL_armor_torso_{label}", (x, y, 1.78), 0.31,
                    p["iron"], static, scale=(0.92, 0.58, 1.12))
        base.cube(f"PVP_HALL_armor_tabard_{label}", (x, y - 0.20, 1.42),
                  (0.16, 0.018, 0.30), p["velvet"], static, bevel=0.035)
        for arm_side in (-1, 1):
            ax = x + arm_side * 0.34
            base.sphere(
                f"PVP_HALL_armor_pauldron_{label}_{arm_side}", (ax, y, 1.96),
                0.13, p["iron"], static, scale=(1.15, 0.90, 0.72),
            )
            arm = base.cylinder(
                f"PVP_HALL_armor_arm_{label}_{arm_side}", (ax, y, 1.62),
                0.055, 0.56, p["iron"], static, vertices=12,
            )
            arm.rotation_euler.x = math.radians(6 * arm_side)
        base.cylinder(f"PVP_HALL_armor_gorget_{label}", (x, y, 2.10), 0.14, 0.10,
                      p["brass"], static, vertices=16)
        base.sphere(f"PVP_HALL_armor_helm_{label}", (x, y, 2.34), 0.17,
                    p["iron"], static, scale=(0.92, 0.96, 1.08))
        base.cube(f"PVP_HALL_armor_visor_{label}", (x, y - 0.16, 2.34),
                  (0.095, 0.014, 0.018), p["brass"], static, bevel=0.004)
        hx = x + side * 0.44
        base.cylinder(f"PVP_HALL_armor_halberd_{label}", (hx, y, 1.62),
                      0.022, 3.05, p["oak_mid"], static, vertices=10)
        base.cube(f"PVP_HALL_armor_halberd_blade_{label}",
                  (hx + side * 0.10, y, 3.10), (0.12, 0.025, 0.18),
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
    scene.view_settings.exposure = 0.30

    moon = base.light("PVP_HALL_LIGHT_moon", "AREA", (5.3, 5.2, 6.5), 520.0,
                      (0.18, 0.34, 0.74), static, size=4.2)
    base.look_at(moon, (1.2, 0.3, 1.6))

    warm = base.light("PVP_HALL_LIGHT_chandelier", "POINT", (0.0, 0.8, 5.9), 285.0,
                      (1.0, 0.34, 0.08), static, radius=1.6)
    warm["war_room_runtime_dynamic"] = "pvp-hall-chandelier"

    for idx, (x, y) in enumerate(((-5.7, -0.3), (0.0, 0.3), (5.7, -0.1))):
        lamp = base.light(f"PVP_HALL_LIGHT_zone_{idx}", "AREA", (x, y - 0.8, 4.5), 155.0,
                          (0.95, 0.48, 0.18), static, size=2.2)
        base.look_at(lamp, (x, y, 1.7))

    fill = base.light("PVP_HALL_LIGHT_front_fill", "AREA", (0.0, -5.5, 4.2), 165.0,
                      (0.34, 0.38, 0.48), static, size=5.0)
    base.look_at(fill, (0.0, 0.4, 1.7))

    # Local warm pools make the left/right functional stations legible without
    # flattening the moonlit rear wall.
    for label, (x, y) in (
        ("identity", (-5.65, -0.35)),
        ("chat", (5.70, -0.20)),
    ):
        lamp = base.light(
            f"PVP_HALL_LIGHT_{label}", "POINT", (x, y - 0.6, 3.25), 115.0,
            (1.0, 0.34, 0.07), static, radius=1.25,
        )
        lamp["war_room_runtime_dynamic"] = f"pvp-hall-{label}"


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
    build_castle_dressing(static, p)
    build_gothic_architecture_pass(static, p)
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
        if name.startswith(("WR_ARCH_", "WR_CANON_", "WR3_OBS_", "WR_PREVIEW_", "PVP_DUEL_"))
    )
    if forbidden:
        raise RuntimeError(f"PvP Duel Hall inherited visible gameplay-room geometry: {forbidden[:12]}")

    camera = bpy.context.scene.camera
    # The lobby camera must present all three physical stations at once. It is
    # intentionally wider than the gameplay camera because nothing here is a
    # selectable chessboard.
    camera.data.lens = 38.0
    camera.location = (0.0, -18.2, 7.25)
    base.look_at(camera, (0.0, 0.80, 2.18))

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
