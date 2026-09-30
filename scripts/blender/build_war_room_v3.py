#!/usr/bin/env python3
"""Build the independent War Room v3 "Armory Hall" shell.

V3 keeps only the live-board anchor and the proven camera object from the v2
generator. Its authored room is rebuilt from an empty static collection: a
stone castle hall open to the night sky, a ring of full plate armours standing
guard around the board, heraldic shields with crossed swords on the walls,
torches, banners and one great hearth.

The review camera reproduces the runtime's shared desktop play camera, so the
preview is what the player sees. The v3 live board is scaled x1.08 at runtime
(Board3DCore), so the preview board and the dais are sized for it.
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


CONTRACT = "war-room-armory-hall-v3"
V3_CANON = "war-room-v3-armory-hall-2026-09-30"

# Runtime shared desktop play camera (Board3DScene.fitBoardCamera, wide 16:9,
# immersive): 22° lens, WAR_ROOM_PLAY_PITCH (9.2, 9.55), target (0, 2.2, 0.16).
V3_CAMERA_FOV_DEG = 22.0
V3_CAMERA_HALF_SPAN = 5.38
V3_CAMERA_PADDING = 1.07 * 0.91 * 1.115
V3_CAMERA_TARGET = (0.0, -0.16, 2.20)
V3_CAMERA_DIRECTION = (0.0, -9.55, 9.2)

# Board3DCore renders the v3 live board at x1.08; size the preview and dais for it.
V3_RUNTIME_BOARD_SCALE = 1.08
V3_BOARD_HALF = 4.0 * V3_RUNTIME_BOARD_SCALE

# Hall footprint (Blender: +y away from the player, camera on -y).
V3_HALL_HALF_X = 8.6
V3_HALL_BACK_Y = 7.9
V3_HALL_FRONT_Y = -7.6
V3_WALL_TOP_Z = 5.0
V3_WALL_THICK = 0.45

# Armour ring: sides and back only, front pair pushed wide so no suit ever
# stands between the play camera and the near ranks.
V3_ARMOR_POSITIONS = (
    (-2.75, 6.35), (2.75, 6.35),
    (-6.05, 4.35), (6.05, 4.35),
    (-7.15, 0.75), (7.15, 0.75),
    (-7.15, -3.35), (7.15, -3.35),
)

V3_WEATHER_MATERIALS = frozenset({
    "WR3_MAT_castle_stone",
    "WR3_MAT_flagstone",
    "WR3_MAT_flagstone_dark",
})

V3_FLAME_NAMES = (
    "WR3_ARM_hearth_flame_body",
    "WR3_ARM_hearth_flame_0",
    "WR3_ARM_hearth_flame_1",
    "WR3_ARM_hearth_flame_2",
)


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
    # No sheen on v3 materials: Blender exports the sheen colour as full white,
    # which washes dark fabric/leather out in three.js.
    return {
        "stone": base.material(
            "WR3_MAT_castle_stone", (0.24, 0.215, 0.19, 1),
            rough=0.86, coat=0.01, texture="stone", scale=3.2, bump=0.090, weather=True,
        ),
        "flag": base.material(
            "WR3_MAT_flagstone", (0.235, 0.215, 0.19, 1),
            rough=0.62, coat=0.10, texture="stone", scale=4.0, bump=0.060, weather=True,
        ),
        "flag_dark": base.material(
            "WR3_MAT_flagstone_dark", (0.12, 0.11, 0.10, 1),
            rough=0.66, coat=0.08, texture="stone", scale=4.4, bump=0.060, weather=True,
        ),
        "oak": base.material(
            "WR3_MAT_dark_oak", (0.13, 0.065, 0.028, 1),
            rough=0.46, coat=0.20, texture="wood", scale=2.6, bump=0.060,
        ),
        "oak_dark": base.material(
            "WR3_MAT_black_oak", (0.045, 0.022, 0.010, 1),
            rough=0.52, coat=0.14, texture="wood", scale=2.4, bump=0.050,
        ),
        "steel": base.material(
            "WR3_MAT_plate_steel", (0.44, 0.46, 0.50, 1),
            metal=0.92, rough=0.24, coat=0.20, texture="metal", scale=30, bump=0.010,
        ),
        "steel_dark": base.material(
            "WR3_MAT_blackened_steel", (0.10, 0.10, 0.11, 1),
            metal=0.85, rough=0.38, coat=0.12, texture="metal", scale=30, bump=0.012,
        ),
        "gold": base.material(
            "WR3_MAT_gilded_trim", (0.80, 0.50, 0.14, 1),
            metal=0.92, rough=0.24, coat=0.24, texture="metal", scale=31, bump=0.010,
        ),
        "iron": base.material(
            "WR3_MAT_forged_iron", (0.055, 0.050, 0.048, 1),
            metal=0.78, rough=0.46, texture="metal", scale=28, bump=0.020,
        ),
        "crimson": base.material(
            "WR3_MAT_crimson_cloth", (0.28, 0.022, 0.020, 1),
            rough=0.78, texture="leather", scale=50, bump=0.030,
        ),
        "royal_blue": base.material(
            "WR3_MAT_royal_blue_cloth", (0.014, 0.040, 0.16, 1),
            rough=0.78, texture="leather", scale=50, bump=0.030,
        ),
        "forest": base.material(
            "WR3_MAT_forest_cloth", (0.012, 0.090, 0.040, 1),
            rough=0.80, texture="leather", scale=50, bump=0.030,
        ),
        "gold_thread": base.material(
            "WR3_MAT_gold_thread", (0.55, 0.32, 0.07, 1),
            rough=0.60, texture="leather", scale=60, bump=0.020,
        ),
        "leather": base.material(
            "WR3_MAT_saddle_leather", (0.16, 0.070, 0.030, 1),
            rough=0.50, coat=0.16, texture="leather", scale=50, bump=0.040,
        ),
        "glass": base.material(
            "WR3_MAT_moon_glass", (0.020, 0.060, 0.19, 1),
            rough=0.16, coat=0.50, emission=(0.030, 0.090, 0.32, 1), emission_strength=0.80,
        ),
        "night_sky": base.material(
            "WR3_MAT_night_sky", (0.004, 0.010, 0.050, 1),
            rough=0.9, emission=(0.008, 0.022, 0.120, 1), emission_strength=0.50,
        ),
        "night_ground": base.material(
            "WR3_MAT_night_ground", (0.006, 0.016, 0.024, 1),
            rough=0.95, emission=(0.004, 0.012, 0.030, 1), emission_strength=0.22,
        ),
        "ivory": bpy.data.materials["WR_MAT_ivory"],
        "charcoal": bpy.data.materials["WR_MAT_charcoal"],
        "fire": bpy.data.materials["WR_MAT_fire"],
        "fire_core": bpy.data.materials["WR_MAT_fire_core"],
    }


# --- shared helpers -----------------------------------------------------------------

def lod_sphere(name, loc, radius, material, owner, *, scale=(1, 1, 1)):
    """Smooth icosphere sized by radius (runtime budget; see build_war_room_v4)."""
    subdivisions = 1 if radius < 0.09 else 2 if radius < 0.22 else 3
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.ops.object.shade_smooth()
    obj.data.materials.append(material)
    base.tag(obj)
    base.relink(obj, owner)
    return obj


def cylinder_between(name, start, end, radius, material, owner, *, vertices=16):
    start = Vector(start)
    end = Vector(end)
    direction = end - start
    obj = base.cylinder(name, (start + end) / 2.0, radius, direction.length,
                        material, owner, vertices=vertices)
    obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    return obj


def join_into(objects, name):
    """Fuse authored parts into one mesh (one runtime draw) under a stable name."""
    objects = [obj for obj in objects if obj is not None]
    if not objects:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        for modifier in list(obj.modifiers):
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    bpy.ops.object.select_all(action="DESELECT")
    return joined


def fuse_by_material(prefix, static, name):
    """Fuse every static mesh whose name starts with `prefix` into one mesh per
    single material, e.g. the eight armours become a few runtime draws."""
    groups = {}
    for obj in list(static.objects):
        if obj.type != "MESH" or not obj.name.startswith(prefix) or obj.get("war_room_runtime_dynamic"):
            continue
        if len(obj.data.materials) != 1 or obj.data.materials[0] is None:
            continue
        groups.setdefault(obj.data.materials[0].name, []).append(obj)
    for index, (_material, objects) in enumerate(sorted(groups.items())):
        join_into(objects, f"{name}_{index}")


def placed(obj, origin, yaw):
    """Rotate a part authored around `origin` (local frame facing -y) by `yaw`."""
    dx, dy = obj.location.x - origin[0], obj.location.y - origin[1]
    c, s = math.cos(yaw), math.sin(yaw)
    obj.location.x = origin[0] + dx * c - dy * s
    obj.location.y = origin[1] + dx * s + dy * c
    obj.rotation_euler.z += yaw
    return obj


# --- architecture ---------------------------------------------------------------------

def build_hall(static, palette):
    """Stone castle hall open to the sky: flagstones, walls, pilasters, battlements."""
    hx, back, front = V3_HALL_HALF_X, V3_HALL_BACK_Y, V3_HALL_FRONT_Y
    base.cube("WR3_ARM_floor", (0, (back + front) / 2.0, -0.12),
              (hx + 0.6, (back - front) / 2.0 + 0.6, 0.12), palette["flag_dark"], static, bevel=0.02)

    tile = 1.40
    index = 0
    y = front + tile / 2.0
    row = 0
    while y < back:
        x = -hx + tile / 2.0 + (0.5 * tile if row % 2 else 0.0)
        col = 0
        while x < hx:
            material = palette["flag"] if (row * 3 + col) % 5 else palette["flag_dark"]
            base.cube(f"WR3_ARM_floor_tile_{index}", (x, y, 0.010),
                      (tile * 0.485, tile * 0.485, 0.03), material, static, bevel=0.02)
            index += 1
            x += tile
            col += 1
        y += tile
        row += 1

    wall_z = V3_WALL_TOP_Z / 2.0
    t = V3_WALL_THICK
    base.cube("WR3_ARM_wall_back", (0, back + t / 2.0, wall_z), (hx + t, t / 2.0, wall_z),
              palette["stone"], static, bevel=0.04)
    for side in (-1, 1):
        base.cube(f"WR3_ARM_wall_side_{side}", (side * (hx + t / 2.0), (back + front) / 2.0, wall_z),
                  (t / 2.0, (back - front) / 2.0, wall_z), palette["stone"], static, bevel=0.04)

    # Oak wainscot, a stone string course and pilasters give the walls rhythm.
    wains_h = 1.05
    base.cube("WR3_ARM_wainscot_back", (0, back - 0.06, wains_h / 2.0), (hx, 0.06, wains_h / 2.0),
              palette["oak"], static, bevel=0.03)
    for side in (-1, 1):
        base.cube(f"WR3_ARM_wainscot_side_{side}", (side * (hx - 0.06), (back + front) / 2.0, wains_h / 2.0),
                  (0.06, (back - front) / 2.0, wains_h / 2.0), palette["oak"], static, bevel=0.03)
    base.cube("WR3_ARM_wainscot_rail_back", (0, back - 0.13, wains_h), (hx, 0.05, 0.05),
              palette["oak_dark"], static, bevel=0.02)
    for side in (-1, 1):
        base.cube(f"WR3_ARM_wainscot_rail_side_{side}", (side * (hx - 0.13), (back + front) / 2.0, wains_h),
                  (0.05, (back - front) / 2.0, 0.05), palette["oak_dark"], static, bevel=0.02)

    for index, x in enumerate((-6.6, -3.3, 3.3, 6.6)):
        base.cube(f"WR3_ARM_pilaster_back_{index}", (x, back - 0.16, wall_z), (0.28, 0.16, wall_z),
                  palette["stone"], static, bevel=0.05)
    for side in (-1, 1):
        for index, y in enumerate((5.4, 2.2, -1.0, -4.2)):
            base.cube(f"WR3_ARM_pilaster_side_{side}_{index}", (side * (hx - 0.16), y, wall_z),
                      (0.16, 0.28, wall_z), palette["stone"], static, bevel=0.05)

    # A projecting stone cornice on corbels crowns the walls (an interior hall,
    # not a curtain wall: merlons read as toy teeth from the play camera).
    top = V3_WALL_TOP_Z
    base.cube("WR3_ARM_cornice_back", (0, back - 0.10, top - 0.10), (hx + t, t / 2.0 + 0.18, 0.12),
              palette["stone"], static, bevel=0.03)
    base.cube("WR3_ARM_cornice_frieze_back", (0, back - 0.02, top - 0.42), (hx, 0.05, 0.20),
              palette["oak_dark"], static, bevel=0.02)
    for side in (-1, 1):
        base.cube(f"WR3_ARM_cornice_side_{side}", (side * (hx + 0.08), (back + front) / 2.0, top - 0.10),
                  (t / 2.0 + 0.18, (back - front) / 2.0 + t, 0.12), palette["stone"], static, bevel=0.03)
        base.cube(f"WR3_ARM_cornice_frieze_side_{side}", (side * (hx - 0.02), (back + front) / 2.0, top - 0.42),
                  (0.05, (back - front) / 2.0, 0.20), palette["oak_dark"], static, bevel=0.02)
    corbel = 0.95
    for index in range(int(2 * hx / corbel) + 1):
        x = -hx + 0.45 + index * corbel
        if x > hx - 0.3:
            break
        base.cube(f"WR3_ARM_corbel_back_{index}", (x, back - 0.22, top - 0.32), (0.10, 0.18, 0.12),
                  palette["stone"], static, bevel=0.03)
    for side in (-1, 1):
        y = back - 0.45
        index = 0
        while y > front + 0.3:
            base.cube(f"WR3_ARM_corbel_side_{side}_{index}", (side * (hx - 0.22), y, top - 0.32), (0.18, 0.10, 0.12),
                      palette["stone"], static, bevel=0.03)
            y -= corbel
            index += 1
    fuse_by_material("WR3_ARM_corbel_", static, "WR3_ARM_corbels")
    fuse_by_material("WR3_ARM_floor_tile_", static, "WR3_ARM_flagstones")


def build_night_backdrop(static, palette):
    """Sky sleeve and dark ground beyond the battlements (seen from the steep camera)."""
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=30.0, depth=26.0,
                                        end_fill_type="NOTHING", location=(0, 0, 12.0))
    sky = bpy.context.object
    sky.name = "WR3_ARM_sky_backdrop"
    sky.data.materials.append(palette["night_sky"])
    base.tag(sky)
    base.relink(sky, static)
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=30.0, fill_type="NGON", location=(0, 0, -0.30))
    ground = bpy.context.object
    ground.name = "WR3_ARM_night_ground"
    ground.data.materials.append(palette["night_ground"])
    base.tag(ground)
    base.relink(ground, static)


def build_dais_and_board(static, palette):
    """Two-step round stone dais, crimson rug and an oak board frame sized for x1.08."""
    base.cylinder("WR3_ARM_dais_lower", (0, 0, 0.10), 6.2, 0.20, palette["stone"], static, vertices=64)
    base.cylinder("WR3_ARM_dais_upper", (0, 0, 0.26), 5.7, 0.12, palette["flag"], static, vertices=64)
    base.cylinder("WR3_ARM_dais_rug", (0, 0, 0.335), 5.45, 0.03, palette["crimson"], static, vertices=64)
    base.torus("WR3_ARM_dais_rug_ring", (0, 0, 0.355), 5.20, 0.035, palette["gold_thread"], static)
    base.torus("WR3_ARM_dais_rug_ring_inner", (0, 0, 0.355), 4.95, 0.020, palette["gold_thread"], static)

    inner = V3_BOARD_HALF + 0.05
    outer = inner + 0.62
    base.cube("WR3_ARM_board_plinth", (0, 0, 0.66), (outer - 0.10, outer - 0.10, 0.30),
              palette["oak_dark"], static, bevel=0.05)
    rim_center = (inner + outer) / 2.0
    rim_half = (outer - inner) / 2.0
    for side in (-1, 1):
        for axis, name in ((0, "x"), (1, "y")):
            loc = [0.0, 0.0, 1.06]
            half = [outer, outer, 0.085]
            loc[1 - axis] = side * rim_center
            half[1 - axis] = rim_half
            base.cube(f"WR3_ARM_board_rim_{name}_{side}", tuple(loc), tuple(half),
                      palette["oak"], static, bevel=0.05)
            inlay = [0.0, 0.0, 1.15]
            inlay_half = [inner + 0.02, inner + 0.02, 0.012]
            inlay[1 - axis] = side * (inner + 0.02)
            inlay_half[1 - axis] = 0.022
            base.cube(f"WR3_ARM_board_inlay_{name}_{side}", tuple(inlay), tuple(inlay_half),
                      palette["gold"], static, bevel=0.008)
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = outer - 0.20
            base.cube(f"WR3_ARM_board_corner_{sx}_{sy}", (sx * c, sy * c, 1.17), (0.24, 0.24, 0.05),
                      palette["iron"], static, bevel=0.03)
            lod_sphere(f"WR3_ARM_board_corner_boss_{sx}_{sy}", (sx * c, sy * c, 1.26), 0.11,
                       palette["gold"], static)


def scale_preview_board():
    """Preview-only: match the x1.08 live v3 board and seat White on the player side."""
    moved = 0
    for obj in bpy.context.scene.objects:
        if not obj.name.startswith("WR_PREVIEW_"):
            continue
        if obj.get("war_room_role") != base.ROLE_PREVIEW:
            raise RuntimeError(f"War Room v3 refuses to move non-preview object {obj.name}")
        if obj.name.startswith(("WR_PREVIEW_white_", "WR_PREVIEW_black_")):
            obj.location.y = -obj.location.y
            obj.rotation_euler.x = -obj.rotation_euler.x
            obj.rotation_euler.z = -obj.rotation_euler.z
        top = base.BOARD_Z
        obj.location.x *= V3_RUNTIME_BOARD_SCALE
        obj.location.y *= V3_RUNTIME_BOARD_SCALE
        obj.location.z = top + (obj.location.z - top) * V3_RUNTIME_BOARD_SCALE
        obj.scale = tuple(component * V3_RUNTIME_BOARD_SCALE for component in obj.scale)
        moved += 1
    if moved < 96:
        raise RuntimeError(f"War Room v3 preview board transform touched too few objects: {moved}")


# --- armour ring ----------------------------------------------------------------------

V3_ARMOR_SCALE = 1.32


def build_armor(index, x, y, static, palette):
    """Full plate armour on a stone plinth, holding a halberd, facing the board.

    Authored at 1 m scale, then grown by V3_ARMOR_SCALE about its foot so the
    suits read as life-size guards from the high play camera."""
    yaw = math.atan2(-x, y) + math.pi  # local -y faces the board centre
    origin = (x, y)
    prefix = f"WR3_ARM_armor_{index}"
    parts = []

    def add(obj):
        parts.append(obj)
        return obj

    add(base.cube(f"{prefix}_plinth", (x, y, 0.22), (0.46, 0.46, 0.22), palette["stone"], static, bevel=0.04))
    add(base.cube(f"{prefix}_plinth_cap", (x, y, 0.47), (0.50, 0.50, 0.04), palette["flag_dark"], static, bevel=0.02))
    for leg in (-1, 1):
        lx = x + leg * 0.13
        add(base.cube(f"{prefix}_greave_{leg}", (lx, y, 0.78), (0.085, 0.09, 0.27), palette["steel"], static, bevel=0.05))
        add(lod_sphere(f"{prefix}_knee_{leg}", (lx, y - 0.05, 1.07), 0.085, palette["steel"], static))
        add(base.cube(f"{prefix}_cuisse_{leg}", (lx, y, 1.33), (0.095, 0.10, 0.23), palette["steel"], static, bevel=0.05))
        add(base.cube(f"{prefix}_sabaton_{leg}", (lx, y - 0.07, 0.54), (0.08, 0.15, 0.05), palette["steel_dark"], static, bevel=0.03))
    add(base.cube(f"{prefix}_fauld", (x, y, 1.62), (0.25, 0.15, 0.10), palette["steel"], static, bevel=0.05))
    add(base.cube(f"{prefix}_breastplate", (x, y - 0.02, 2.00), (0.27, 0.17, 0.30), palette["steel"], static, bevel=0.12))
    add(base.cube(f"{prefix}_tabard", (x, y - 0.19, 1.72), (0.19, 0.012, 0.36), palette["crimson" if index % 2 else "royal_blue"], static, bevel=0.01))
    add(base.cube(f"{prefix}_belt", (x, y - 0.03, 1.66), (0.26, 0.16, 0.035), palette["leather"], static, bevel=0.015))
    for arm in (-1, 1):
        ax = x + arm * 0.36
        add(lod_sphere(f"{prefix}_pauldron_{arm}", (ax, y, 2.22), 0.15, palette["steel"], static, scale=(1.2, 1.0, 0.8)))
        add(base.cube(f"{prefix}_vambrace_{arm}", (ax + arm * 0.02, y - 0.02, 1.90), (0.07, 0.07, 0.24), palette["steel"], static, bevel=0.04))
        add(lod_sphere(f"{prefix}_gauntlet_{arm}", (ax + arm * 0.02, y - 0.06, 1.63), 0.075, palette["steel_dark"], static))
    add(base.cube(f"{prefix}_gorget", (x, y, 2.33), (0.12, 0.11, 0.05), palette["steel_dark"], static, bevel=0.03))
    add(lod_sphere(f"{prefix}_helm", (x, y, 2.52), 0.17, palette["steel"], static, scale=(0.95, 1.0, 1.15)))
    add(base.cube(f"{prefix}_visor", (x, y - 0.155, 2.50), (0.12, 0.02, 0.035), palette["steel_dark"], static, bevel=0.01))
    add(base.cube(f"{prefix}_crest", (x, y + 0.03, 2.74), (0.03, 0.14, 0.07), palette["gold"], static, bevel=0.02))
    add(lod_sphere(f"{prefix}_plume", (x, y + 0.10, 2.86), 0.10, palette["crimson" if index % 2 else "royal_blue"], static, scale=(0.6, 1.4, 1.0)))
    # Halberd in the right hand: shaft, axe blade, spike.
    hx = x + 0.44
    shaft_top = 3.35
    add(base.cylinder(f"{prefix}_halberd_shaft", (hx, y - 0.06, (0.52 + shaft_top) / 2.0), 0.025, shaft_top - 0.52,
                      palette["oak_dark"], static, vertices=10))
    add(base.cube(f"{prefix}_halberd_blade", (hx + 0.12, y - 0.06, shaft_top - 0.24), (0.12, 0.012, 0.15),
                  palette["steel"], static, bevel=0.02))
    add(base.cube(f"{prefix}_halberd_spike", (hx, y - 0.06, shaft_top + 0.14), (0.02, 0.012, 0.16),
                  palette["steel"], static, bevel=0.01))
    k = V3_ARMOR_SCALE
    for part in parts:
        part.location.x = x + (part.location.x - x) * k
        part.location.y = y + (part.location.y - y) * k
        part.location.z *= k
        part.scale = tuple(component * k for component in part.scale)
        placed(part, origin, yaw)


def build_armor_ring(static, palette):
    for index, (x, y) in enumerate(V3_ARMOR_POSITIONS):
        build_armor(index, x, y, static, palette)
    fuse_by_material("WR3_ARM_armor_", static, "WR3_ARM_armor_ring")


# --- wall trophies ----------------------------------------------------------------------

def heater_shield_mesh(name, width, height, depth, material, static):
    """Classic heater shield: flat top, curved sides meeting in a point."""
    profile = []
    steps = 10
    for i in range(steps + 1):
        t = i / steps
        # right edge from top corner down to the tip
        x = (width / 2.0) * math.cos(t * math.pi / 2.0) ** 0.8
        z = height / 2.0 - t * height * (0.35 + 0.65 * t)
        profile.append((x, z))
    outline = [(x, z) for x, z in profile] + [(-x, z) for x, z in reversed(profile[:-1])]
    verts = [(x, -depth / 2.0, z) for x, z in outline] + [(x, depth / 2.0, z) for x, z in outline]
    n = len(outline)
    faces = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(material)
    static.objects.link(obj)
    base.tag(obj)
    return obj


def build_trophy(index, center, yaw, field, charge, static, palette, *, scale=1.0):
    """Heraldic shield over two crossed swords, hung on a wall."""
    cx, cy, cz = center
    prefix = f"WR3_ARM_trophy_{index}"
    parts = []
    s = scale
    for side in (-1, 1):
        # Crossed swords: blade, crossguard, grip, pommel, angled ±38°.
        angle = math.radians(side * 38)
        blade = base.cube(f"{prefix}_blade_{side}", (cx, cy + 0.05, cz), (0.045 * s, 0.012, 0.95 * s),
                          palette["steel"], static, bevel=0.01)
        blade.rotation_euler.y = angle
        guard_off = Vector((math.sin(angle) * -0.98 * s, 0, math.cos(angle) * -0.98 * s))
        guard = base.cube(f"{prefix}_guard_{side}", (cx + guard_off.x, cy + 0.04, cz + guard_off.z),
                          (0.20 * s, 0.03, 0.03 * s), palette["gold"], static, bevel=0.012)
        guard.rotation_euler.y = angle
        grip_off = Vector((math.sin(angle) * -1.14 * s, 0, math.cos(angle) * -1.14 * s))
        grip = base.cube(f"{prefix}_grip_{side}", (cx + grip_off.x, cy + 0.04, cz + grip_off.z),
                         (0.03 * s, 0.03, 0.14 * s), palette["leather"], static, bevel=0.01)
        grip.rotation_euler.y = angle
        pommel_off = Vector((math.sin(angle) * -1.30 * s, 0, math.cos(angle) * -1.30 * s))
        pommel = lod_sphere(f"{prefix}_pommel_{side}", (cx + pommel_off.x, cy + 0.04, cz + pommel_off.z),
                            0.05 * s, palette["gold"], static)
        parts += [blade, guard, grip, pommel]
    shield = heater_shield_mesh(f"{prefix}_shield", 0.92 * s, 1.14 * s, 0.07, palette[field], static)
    shield.location = (cx, cy - 0.02, cz + 0.05 * s)
    rim = heater_shield_mesh(f"{prefix}_shield_rim", 1.02 * s, 1.24 * s, 0.05, palette["gold"], static)
    rim.location = (cx, cy + 0.01, cz + 0.05 * s)
    parts += [shield, rim]
    if charge == "chevron":
        for side in (-1, 1):
            bar = base.cube(f"{prefix}_chevron_{side}", (cx + side * 0.17 * s, cy - 0.065, cz - 0.02 * s),
                            (0.24 * s, 0.01, 0.055 * s), palette["gold"], static, bevel=0.008)
            bar.rotation_euler.y = math.radians(-side * 38)
            parts.append(bar)
    elif charge == "cross":
        parts.append(base.cube(f"{prefix}_cross_v", (cx, cy - 0.065, cz + 0.02 * s), (0.055 * s, 0.01, 0.42 * s),
                               palette["gold"], static, bevel=0.008))
        parts.append(base.cube(f"{prefix}_cross_h", (cx, cy - 0.065, cz + 0.18 * s), (0.34 * s, 0.01, 0.055 * s),
                               palette["gold"], static, bevel=0.008))
    else:  # fess band and a boss
        parts.append(base.cube(f"{prefix}_fess", (cx, cy - 0.065, cz + 0.12 * s), (0.42 * s, 0.01, 0.075 * s),
                               palette["gold"], static, bevel=0.008))
        parts.append(lod_sphere(f"{prefix}_boss", (cx, cy - 0.07, cz - 0.10 * s), 0.07 * s, palette["gold"], static,
                                scale=(1, 0.45, 1)))
    for part in parts:
        placed(part, (cx, cy), yaw)


# `placed` turns local -y (the display face) by yaw: +pi/2 faces +x (left wall),
# -pi/2 faces -x (right wall).
V3_TROPHY_TURN = math.radians(22)


def build_wall_trophies(static, palette):
    back = V3_HALL_BACK_Y - 0.10
    hx = V3_HALL_HALF_X - 0.10
    trophies = (
        # back wall: flanking the hearth and the windows
        ((-5.0, back, 2.85), 0.0, "royal_blue", "chevron"),
        ((5.0, back, 2.85), 0.0, "crimson", "cross"),
        # side walls, between pilasters; hung on angled brackets turned a little
        # toward the player so the play camera sees their faces, not their edges
        ((-hx + 0.30, 3.80, 2.90), math.pi / 2 - V3_TROPHY_TURN, "crimson", "fess"),
        ((-hx + 0.30, 0.60, 2.90), math.pi / 2 - V3_TROPHY_TURN, "forest", "chevron"),
        ((-hx + 0.30, -2.60, 2.90), math.pi / 2 - V3_TROPHY_TURN, "royal_blue", "cross"),
        ((hx - 0.30, 3.80, 2.90), -math.pi / 2 + V3_TROPHY_TURN, "royal_blue", "fess"),
        ((hx - 0.30, 0.60, 2.90), -math.pi / 2 + V3_TROPHY_TURN, "crimson", "chevron"),
        ((hx - 0.30, -2.60, 2.90), -math.pi / 2 + V3_TROPHY_TURN, "forest", "cross"),
    )
    for index, (center, yaw, field, charge) in enumerate(trophies):
        build_trophy(index, center, yaw, field, charge, static, palette, scale=1.30)
    # The great crest on the hearth hood (its face is ~0.93 m proud of the wall).
    build_trophy(len(trophies), (0.0, V3_HALL_BACK_Y - 0.98, 3.10), 0.0, "crimson", "chevron", static, palette,
                 scale=0.95)
    fuse_by_material("WR3_ARM_trophy_", static, "WR3_ARM_trophies")


def build_banners(static, palette):
    """Long heraldic banners between the back windows and trophies."""
    back = V3_HALL_BACK_Y - 0.12
    for index, (x, field) in enumerate(((-6.6, "crimson"), (-3.3, "royal_blue"), (3.3, "royal_blue"), (6.6, "crimson"))):
        top = V3_WALL_TOP_Z - 0.75
        base.cylinder(f"WR3_ARM_banner_rod_{index}", (x, back - 0.30, top), 0.03, 1.05,
                      palette["iron"], static, vertices=10).rotation_euler.y = math.pi / 2
        base.cube(f"WR3_ARM_banner_{index}", (x, back - 0.32, top - 1.15), (0.44, 0.02, 1.10),
                  palette[field], static, bevel=0.01)
        for tail in (-1, 1):
            point = base.cube(f"WR3_ARM_banner_tail_{index}_{tail}", (x + tail * 0.22, back - 0.32, top - 2.28),
                              (0.22, 0.02, 0.22), palette[field], static, bevel=0.01)
            point.rotation_euler.y = math.radians(45)
        base.cube(f"WR3_ARM_banner_band_{index}", (x, back - 0.345, top - 0.55), (0.44, 0.008, 0.06),
                  palette["gold_thread"], static, bevel=0.005)
        lod_sphere(f"WR3_ARM_banner_emblem_{index}", (x, back - 0.35, top - 1.20), 0.16,
                   palette["gold_thread"], static, scale=(1.0, 0.15, 1.2))
    fuse_by_material("WR3_ARM_banner_", static, "WR3_ARM_banners")


# --- hearth, windows, torches -----------------------------------------------------------

def build_hearth(static, palette):
    """One great stone hearth centred on the back wall; runtime-animated flames."""
    back = V3_HALL_BACK_Y
    x, y = 0.0, back - 0.55
    base.cube("WR3_ARM_hearth_body", (x, y + 0.10, 1.45), (1.55, 0.50, 1.45), palette["stone"], static, bevel=0.08)
    base.cube("WR3_ARM_hearth_opening", (x, y - 0.38, 1.05), (0.95, 0.10, 0.80), palette["charcoal"], static, bevel=0.06)
    base.cube("WR3_ARM_hearth_mantel", (x, y - 0.20, 2.35), (1.80, 0.45, 0.14), palette["oak_dark"], static, bevel=0.05)
    base.cube("WR3_ARM_hearth_hood", (x, y + 0.02, 3.05), (1.30, 0.38, 0.62), palette["stone"], static, bevel=0.10)
    for side in (-1, 1):
        base.cube(f"WR3_ARM_hearth_jamb_{side}", (x + side * 1.18, y - 0.40, 1.10), (0.22, 0.18, 1.10),
                  palette["stone"], static, bevel=0.06)
        base.cube(f"WR3_ARM_hearth_firedog_{side}", (x + side * 0.55, y - 0.52, 0.35), (0.05, 0.20, 0.18),
                  palette["iron"], static, bevel=0.02)
    fire_center = Vector((x, y - 0.55, 0.78))
    body = base.sphere(V3_FLAME_NAMES[0], fire_center, 0.36, palette["fire"], static, scale=(1.55, 0.22, 0.75))
    body["war_room_runtime_dynamic"] = "v3-fire"
    for index, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.34, 0.02, 0.34, 1.10, -0.14),
        (0.00, 0.20, 0.30, 1.55, 0.10),
        (0.32, -0.01, 0.30, 1.02, 0.20),
    )):
        tongue = base.sphere(V3_FLAME_NAMES[index + 1], fire_center + Vector((dx, -0.03, dz)), 0.25,
                             palette["fire_core"] if index == 1 else palette["fire"], static, scale=(sx, 0.18, sz))
        tongue.rotation_euler.y = tilt
        tongue["war_room_runtime_dynamic"] = "v3-fire"
    for log_x in (-0.40, 0.0, 0.40):
        log = base.cylinder(f"WR3_ARM_hearth_log_{log_x:+.2f}", (x + log_x, y - 0.52, 0.42), 0.10, 1.0,
                            palette["oak_dark"], static, vertices=12)
        log.rotation_euler.y = math.pi / 2
    base.light("WR3_LIGHT_hearth", "POINT", (x, y - 1.20, 1.30), 520.0, (1.0, 0.30, 0.06), static, radius=1.8)
    base.anchor("WR_ANCHOR_fireplace_practical", (x, y - 0.90, 1.45), static)


def build_windows(static, palette):
    """Two tall lancet windows with moonlit glass on the back wall."""
    back = V3_HALL_BACK_Y
    for index, x in enumerate((-2.25, 2.25)):
        base.cube(f"WR3_ARM_window_reveal_{index}", (x, back - 0.05, 3.00), (0.62, 0.10, 1.42),
                  palette["stone"], static, bevel=0.06)
        base.cube(f"WR3_ARM_window_glass_{index}", (x, back - 0.16, 2.95), (0.44, 0.02, 1.20),
                  palette["glass"], static, bevel=0.01)
        lod_sphere(f"WR3_ARM_window_arch_{index}", (x, back - 0.16, 4.15), 0.44, palette["glass"], static,
                   scale=(1.0, 0.05, 0.62))
        base.cube(f"WR3_ARM_window_mullion_{index}", (x, back - 0.19, 3.05), (0.035, 0.03, 1.30),
                  palette["iron"], static, bevel=0.01)
        for bar in (-0.5, 0.2, 0.9):
            base.cube(f"WR3_ARM_window_bar_{index}_{bar:+.1f}", (x, back - 0.19, 2.95 + bar), (0.44, 0.03, 0.025),
                      palette["iron"], static, bevel=0.008)
        base.cube(f"WR3_ARM_window_sill_{index}", (x, back - 0.22, 1.72), (0.70, 0.16, 0.07),
                  palette["flag"], static, bevel=0.03)
    moon = base.light("WR3_LIGHT_window", "AREA", (0, back - 1.6, 3.6), 380.0, (0.18, 0.42, 1.0), static, size=4.5)
    base.look_at(moon, (0, 0.5, 1.1))
    base.anchor("WR_ANCHOR_window_moonlight", (0, back - 1.4, 3.6), static)


def build_torches(static, palette):
    """Iron wall torches with warm emissive flames (these carry warmth at runtime)."""
    back = V3_HALL_BACK_Y - 0.12
    hx = V3_HALL_HALF_X - 0.12
    spots = [((-3.9, back), 0.0), ((3.9, back), 0.0)]
    for y in (5.40, 2.20, -1.00, -4.20):
        spots += [((-hx, y), math.pi / 2), ((hx, y), -math.pi / 2)]
    irons, glows = [], []
    for index, ((x, y), yaw) in enumerate(spots):
        z = 2.75
        parts = [
            base.cube(f"WR3_ARM_torch_plate_{index}", (x, y, z), (0.10, 0.03, 0.18), palette["iron"], static, bevel=0.02),
            base.cube(f"WR3_ARM_torch_arm_{index}", (x, y - 0.14, z - 0.05), (0.025, 0.14, 0.025), palette["iron"], static, bevel=0.01),
            base.cylinder(f"WR3_ARM_torch_cup_{index}", (x, y - 0.28, z + 0.05), 0.075, 0.16, palette["iron"], static, vertices=10),
        ]
        glow = lod_sphere(f"WR3_ARM_torch_flame_{index}", (x, y - 0.28, z + 0.24), 0.09, palette["fire_core"], static,
                          scale=(0.9, 0.9, 1.7))
        for part in parts + [glow]:
            placed(part, (x, y), yaw)
        irons += parts
        glows.append(glow)
    for index, ((x, y), yaw) in enumerate(spots):
        # Warm pools under each torch (preview lights; runtime uses the anchors).
        face = (math.sin(yaw) * 0.6, -math.cos(yaw) * 0.6)
        pool = base.light(f"WR3_LIGHT_torch_{index}", "POINT", (x + face[0], y + face[1], 3.0), 70.0,
                          (1.0, 0.46, 0.14), static, radius=0.25)
        pool.data.use_shadow = False  # ten shadowed points overflow EEVEE's shadow pool
    join_into(irons, "WR3_ARM_torch_irons")
    join_into(glows, "WR3_ARM_torch_flames")
    base.anchor("WR_ANCHOR_chandelier_practical", (0, V3_HALL_BACK_Y - 1.2, 3.2), static)


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "v3-armory-hall"
    scene["war_room_visual_canon"] = V3_CANON
    scene.view_settings.exposure = 0.35

    key = base.light("WR3_LIGHT_key", "AREA", (-4.8, -3.8, 8.3), 470.0, (1.0, 0.64, 0.36), static, size=6.1)
    base.look_at(key, (0, 0.5, 1.0))
    fill = base.light("WR3_LIGHT_fill", "AREA", (6.6, -2.6, 6.6), 420.0, (0.18, 0.40, 1.00), static, size=6.0)
    base.look_at(fill, (0.4, 0.6, 1.5))
    top = base.light("WR3_LIGHT_top", "AREA", (0, 1.4, 8.7), 300.0, (0.95, 0.72, 0.46), static, size=5.2)
    base.look_at(top, (0, 0.4, 0.8))
    for side in (-1, 1):
        wall = base.light(f"WR3_LIGHT_wall_wash_{side}", "AREA", (side * 5.0, 1.0, 5.5), 150.0,
                          (1.0, 0.55, 0.25), static, size=4.0)
        base.look_at(wall, (side * 8.4, 1.0, 3.0))


def apply_v3_camera():
    scene = bpy.context.scene
    cam = bpy.data.objects.get("WR_CAMERA_hero")
    if cam is None or cam.type != "CAMERA":
        raise RuntimeError("War Room v3 hero camera missing")
    vertical_fov = math.radians(V3_CAMERA_FOV_DEG)
    distance = (V3_CAMERA_HALF_SPAN / math.tan(vertical_fov / 2.0)) * V3_CAMERA_PADDING
    target = Vector(V3_CAMERA_TARGET)
    direction = Vector(V3_CAMERA_DIRECTION).normalized()
    cam.location = target + direction * distance
    cam.data.sensor_width = 36.0
    sensor_height = cam.data.sensor_width / (base.PREVIEW_SIZE[0] / base.PREVIEW_SIZE[1])
    cam.data.lens = sensor_height / (2.0 * math.tan(vertical_fov / 2.0))
    base.look_at(cam, target)
    cam["war_room_camera_profile"] = "v3-runtime-shared-play-pitch-v1"
    cam["runtime_vertical_fov_deg"] = V3_CAMERA_FOV_DEG
    cam["runtime_distance"] = round(distance, 5)
    cam["war_room_visual_canon"] = V3_CANON
    scene.camera = cam


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
    build_hall(static, palette)
    build_night_backdrop(static, palette)
    build_dais_and_board(static, palette)
    build_hearth(static, palette)
    build_windows(static, palette)
    build_armor_ring(static, palette)
    build_wall_trophies(static, palette)
    build_banners(static, palette)
    build_torches(static, palette)
    build_lighting(static)
    scale_preview_board()
    apply_v3_camera()
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
        "WR3_ARM_floor",
        "WR3_ARM_wall_back",
        "WR3_ARM_dais_rug",
        "WR3_ARM_board_plinth",
        "WR3_ARM_hearth_body",
        "WR3_ARM_window_glass_0",
        "WR3_ARM_torch_flames",
        *V3_FLAME_NAMES,
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"War Room v3 contract objects missing: {missing}")
    for prefix, minimum in (("WR3_ARM_armor_ring_", 3), ("WR3_ARM_trophies_", 3), ("WR3_ARM_banners_", 2)):
        count = sum(1 for name in names if name.startswith(prefix))
        if count < minimum:
            raise RuntimeError(f"War Room v3 armory set incomplete: {prefix}* = {count}")
    forbidden_prefixes = (
        "WR_ARCH_", "WR_TABLE_", "WR_FIREPLACE_", "WR_DESK_", "WR_CREST_",
        "WR_WINDOW_", "WR_CANON_", "WR3_OBS_", "WR_ANCHOR_right_fireplace_practical",
    )
    forbidden = sorted(name for name in names if name.startswith(forbidden_prefixes))
    if forbidden:
        raise RuntimeError(f"War Room v3 inherited foreign visual geometry: {forbidden[:12]}")
    if sum(1 for name in names if name == "WR_ANCHOR_fireplace_practical") != 1:
        raise RuntimeError("War Room v3 must contain exactly one fireplace practical")
    # No armour may stand between the play camera and the near ranks.
    near_rank = -V3_BOARD_HALF
    for x, y in V3_ARMOR_POSITIONS:
        if y < near_rank + 1.2 and abs(x) < V3_BOARD_HALF + 2.0:
            raise RuntimeError(f"War Room v3 armour at ({x}, {y}) would occlude the near ranks")


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
        *V3_FLAME_NAMES,
    }
    missing = sorted(required_nodes - node_names)
    if missing:
        raise RuntimeError(f"War Room v3 runtime nodes missing: {missing}")
    if "WR_ANCHOR_right_fireplace_practical" in node_names:
        raise RuntimeError("War Room v3 runtime contains a secondary-hearth anchor")

    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_materials = {
        "WR3_MAT_castle_stone",
        "WR3_MAT_flagstone",
        "WR3_MAT_dark_oak",
        "WR3_MAT_plate_steel",
        "WR3_MAT_gilded_trim",
        "WR3_MAT_crimson_cloth",
        "WR3_MAT_royal_blue_cloth",
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
        if "KHR_materials_sheen" in materials[name].get("extensions", {}):
            raise RuntimeError(f"War Room v3 material exports sheen (washes out at runtime): {name}")


def export_shell_v3(path, batching=None):
    sanitized_links, runtime_textures, factors = base.sanitize_runtime_materials()
    scene = bpy.context.scene
    scene["war_room_runtime_material_links_removed"] = sanitized_links
    scene["war_room_runtime_texture_count"] = runtime_textures
    if batching is None:
        batching = base.collapse_runtime_static_shell()
    source_meshes, batched_meshes, merged_away = batching
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
    base.RUNTIME_MIN_STATIC_SOURCES = 60
    base.RUNTIME_MIN_MERGED = 20
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
    preview_batching = base.collapse_runtime_static_shell()
    print(
        f"War Room v3 preview batching: {preview_batching[0]} -> "
        f"{preview_batching[1]} meshes ({preview_batching[2]} merged)"
    )
    base.render(preview)
    export_shell_v3(glb, preview_batching)
    print(f"War Room v3 OK · {CONTRACT} · objects={len(bpy.context.scene.objects)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
