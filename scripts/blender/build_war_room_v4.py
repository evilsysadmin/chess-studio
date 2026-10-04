#!/usr/bin/env python3
"""Build the independent War Room v4 "Celestial Observatory" shell.

V3 keeps only the live-board anchor and canonical camera from the v2 generator.
Its authored room is rebuilt from an empty static collection: a curved tower
apse, circular command table, celestial window, single cast-iron stove,
restrained brass telescope, premium reading nook, celestial globe console and grounded tower entry
replace v2's rectangular hall.
"""
from __future__ import annotations

import json
import math
import struct
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
# Review camera = the runtime's shared desktop play camera (Board3DScene
# fitBoardCamera, wide 16:9, immersive): 22° lens, WAR_ROOM_PLAY_PITCH
# (9.2, 9.55) ≈ 43.9° pitch, target (0, 2.2, 0.16) in three.js. The preview
# therefore judges exactly what the player sees; the room is proportioned so
# the whole circular observatory reads around the board from that angle.
V4_CAMERA_FOV_DEG = 22.0
V4_CAMERA_HALF_SPAN = 5.38
# padding 1.07 · immersive 0.91 · shared-pitch distance 1.115
V4_CAMERA_PADDING = 1.07 * 0.91 * 1.115
V4_CAMERA_TARGET = (0.0, -0.16, 2.20)
V4_CAMERA_DIRECTION = (0.0, -9.55, 9.2)
V4_WALL_TOP_Z = 4.50
V4_OCULUS_CENTER = (0.0, 7.56, 2.62)
V4_OCULUS_RADIUS = 1.70
V4_OCULUS_ASPECT = 1.22
V4_WALL_RADIUS = 8.72
V4_WALL_CENTER_Y = -0.72
V4_WALL_START_DEG = -112.0
V4_WALL_END_DEG = 112.0
V4_WALL_SEGMENT_COUNT = 19
# Snap the entry to an authored wall bay so the door plane is truly tangent to
# the same circular shell instead of looking like a freestanding prop.
V4_ENTRY_THETA_DEG = -76.0
V4_ENTRY_DOOR_Z = 1.90

# Hans' tower door: the teal leaf is its own runtime node, hinged on the jamb
# nearer the player so it swings into the room away from his path to the
# hearth (Blender Z yaw == three.js Y yaw). A dark void behind it reads as the
# stair landing once it opens.
V4_HANS_DOOR_LEAF = "WR_HANS_door_leaf"
V4_HANS_DOOR_OPEN_YAW = -1.45
V4_HANS_DOOR_HALF = 0.88
# The left armour guards the tower door from the player's side of it: in front
# of the hearth it would stand on Hans' work spot and hide him from the camera.
V4_HANS_LEFT_ARMOR_Y = -0.75

# Where Hans works (WarRoomHansStage.js). The hearth anchor sits on the left of
# the fire mouth: the board dais covers the floor in front of its right half.
V4_HANS_ANCHOR_PREFIX = "WR_ANCHOR_hans_"
V4_HANS_ANCHORS = (
    ("WR_ANCHOR_hans_hearth", (-6.15, 3.95, 0.0)),
    ("WR_ANCHOR_hans_door", (-7.82, 1.23, 0.0)),
    ("WR_ANCHOR_hans_basket", (-7.00, 3.55, 0.0)),
    ("WR_ANCHOR_hans_tools", (-6.00, 3.60, 0.0)),
    ("WR_ANCHOR_hans_corridor_0", (-7.45, 1.95, 0.0)),
    ("WR_ANCHOR_hans_corridor_1", (-7.42, 2.75, 0.0)),
    ("WR_ANCHOR_hans_corridor_2", (-7.15, 3.20, 0.0)),
)

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


# No KHR_materials_sheen on v4 materials: Blender exports the sheen colour
# as full white regardless of weight, which washes dark leather and fabric
# out at runtime (the runtime adds its own leather/fabric micro-surface).
def build_v4_palette():
    return {
        "stone": base.material(
            "WR4_MAT_warm_travertine", (0.33, 0.205, 0.105, 1),
            rough=0.77, coat=0.014, texture="stone", scale=4.3, bump=0.068, weather=True,
        ),
        "stone_light": base.material(
            "WR4_MAT_pale_travertine", (0.62, 0.47, 0.30, 1),
            rough=0.30, coat=0.34, texture="stone", scale=3.6, bump=0.030, weather=True,
        ),
        "slate": base.material(
            "WR4_MAT_radial_slate", (0.030, 0.070, 0.078, 1),
            rough=0.78, coat=0.014, texture="stone", scale=5.0, bump=0.052, weather=True,
        ),
        "green_marble": base.material(
            "WR4_MAT_green_marble", (0.012, 0.090, 0.072, 1),
            rough=0.26, coat=0.40, texture="stone", scale=3.5, bump=0.024, weather=True,
        ),
        "rug": base.material(
            "WR4_MAT_room_rug", (0.004, 0.070, 0.046, 1),
            rough=0.82, coat=0.02, texture="leather", scale=60, bump=0.055,
        ),
        "rug_red": base.material(
            "WR4_MAT_entry_rug", (0.22, 0.020, 0.014, 1),
            rough=0.74, coat=0.03, texture="leather", scale=52, bump=0.050,
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
            "WR4_MAT_sunlit_brass", (0.80, 0.46, 0.11, 1),
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
            rough=0.39, coat=0.24, texture="leather", scale=54, bump=0.044,
        ),
        "green_leather": base.material(
            "WR4_MAT_chart_green_leather", (0.007, 0.105, 0.050, 1),
            rough=0.37, coat=0.28, texture="leather", scale=56, bump=0.045,
        ),
        "night": base.material(
            "WR4_MAT_celestial_blue", (0.002, 0.018, 0.120, 1),
            rough=0.18, coat=0.52, emission=(0.006, 0.055, 0.25, 1), emission_strength=0.65,
        ),
        "aurora": base.material(
            "WR4_MAT_aurora_glass", (0.010, 0.235, 0.175, 1),
            rough=0.20, coat=0.52, emission=(0.015, 0.22, 0.14, 1), emission_strength=0.80,
        ),
        "rug_gold": base.material(
            "WR4_MAT_rug_gold", (0.52, 0.28, 0.055, 1),
            rough=0.62, texture="leather", scale=60, bump=0.020,
        ),
        "navy_leather": base.material(
            "WR4_MAT_navy_leather", (0.012, 0.022, 0.060, 1),
            rough=0.32, coat=0.30, texture="leather", scale=56, bump=0.045,
        ),
        "steel": base.material(
            "WR4_MAT_polished_steel", (0.70, 0.72, 0.76, 1),
            metal=0.78, rough=0.32, coat=0.22, texture="metal", scale=30, bump=0.008,
        ),
        "plant": base.material(
            "WR4_MAT_palm_leaf", (0.030, 0.150, 0.040, 1),
            rough=0.55, coat=0.12, texture="leather", scale=40, bump=0.015,
        ),
        "banner_blue": base.material(
            "WR4_MAT_heraldic_blue", (0.010, 0.030, 0.105, 1),
            rough=0.72, texture="leather", scale=48, bump=0.020,
        ),
        "night_sky": base.material(
            "WR4_MAT_night_sky", (0.004, 0.012, 0.060, 1),
            rough=0.9, emission=(0.010, 0.030, 0.150, 1), emission_strength=0.55,
        ),
        "night_ridge": base.material(
            "WR4_MAT_night_ridge", (0.006, 0.014, 0.050, 1),
            rough=0.9, emission=(0.018, 0.045, 0.160, 1), emission_strength=0.55,
        ),
        "night_town": base.material(
            "WR4_MAT_night_town", (0.004, 0.008, 0.030, 1),
            rough=0.9, emission=(0.008, 0.018, 0.070, 1), emission_strength=0.25,
        ),
        "night_ground": base.material(
            "WR4_MAT_night_ground", (0.006, 0.020, 0.030, 1), rough=0.95,
            emission=(0.004, 0.014, 0.040, 1), emission_strength=0.25,
        ),
        "night_pine": base.material(
            "WR4_MAT_night_pine", (0.004, 0.016, 0.040, 1), rough=0.95,
            emission=(0.006, 0.020, 0.075, 1), emission_strength=0.30,
        ),
        "ivory": bpy.data.materials["WR_MAT_ivory"],
        "iron": bpy.data.materials["WR_MAT_hearth_iron"],
        "charcoal": bpy.data.materials["WR_MAT_charcoal"],
        "fire": bpy.data.materials["WR_MAT_fire"],
        "fire_core": bpy.data.materials["WR_MAT_fire_core"],
    }


def lod_sphere(name, loc, radius, material, owner, *, scale=(1, 1, 1)):
    """Runtime-budget sphere for small ornaments (bulbs, finials, studs, stars).

    base.sphere builds a flat-shaded 32x16 UV sphere (482 verts, ~4x more once
    split for flat normals in the GLB) even for 5 cm bulbs that cover a few
    pixels. A smooth-shaded icosphere sized by radius reads identically at play
    distance for a fraction of the vertices.
    """
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
            # Golden: calm ivory marble around the dais, then an outer ring of
            # deep green diamonds that frames the room without fighting the board.
            green_inlay = (x * x + (y + 0.18) ** 2 > 6.1 * 6.1) and (row + col) % 2 == 0
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

    # Brass ring separating the ivory field from the green diamond band.
    base.torus("WR4_OBS_floor_ring_inlay", (0, -0.18, 0.050), 6.12, 0.030,
               palette["brass_dark"], static)

    # Canonical 2026-09-29 composition: long crimson heraldic runners flank the
    # dais left and right, gold-bordered, pointing at the player.
    for side in (-1, 1):
        x = side * 6.52
        base.cube(f"WR4_OBS_side_runner_border_{side}", (x, -1.85, 0.070), (0.86, 5.30, 0.022),
                  palette["rug_gold"], static, bevel=0.04)
        base.cube(f"WR4_OBS_side_runner_{side}", (x, -1.85, 0.098), (0.74, 5.18, 0.016),
                  palette["rug_red"], static, bevel=0.03)
        for stripe in (-1, 1):
            base.cube(f"WR4_OBS_side_runner_stripe_{side}_{stripe}", (x + stripe * 0.56, -1.85, 0.118),
                      (0.028, 4.96, 0.006), palette["rug_gold"], static, bevel=0.004)
        for index, dy in enumerate((-5.6, -3.3, -1.0, 1.3)):
            motif = base.cube(f"WR4_OBS_side_runner_motif_{side}_{index}", (x, dy, 0.118),
                              (0.22, 0.22, 0.006), palette["rug_gold"], static, bevel=0.004)
            motif.rotation_euler.z = math.radians(45)
    # Front heraldic rug at the player's edge.
    base.cube("WR4_OBS_heraldic_runner_border", (0, -6.35, 0.070), (2.60, 1.05, 0.022),
              palette["rug_gold"], static, bevel=0.06)
    base.cube("WR4_OBS_heraldic_runner", (0, -6.35, 0.098), (2.48, 0.93, 0.016),
              palette["rug_red"], static, bevel=0.05)
    _heraldic_lion_flat("WR4_OBS_heraldic_runner_lion", (0, -6.35, 0.118), 1.2, palette["rug_gold"], static)

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
            f"WR4_OBS_apse_lower_{index}", (x, y, 1.30),
            (half_length, 0.20, 1.30), palette["walnut_dark"], static, bevel=0.055,
        )
        lower.rotation_euler.z = tangent
        upper = base.cube(
            f"WR4_OBS_apse_upper_{index}", (x, y, (2.60 + V4_WALL_TOP_Z) / 2.0),
            (half_length, 0.18, (V4_WALL_TOP_Z - 2.60) / 2.0), palette["walnut"], static, bevel=0.075,
        )
        upper.rotation_euler.z = tangent
        # Golden observatory: framed walnut panels add architectural depth
        # without stealing silhouette from the board or lunar oculus.
        panel = base.cube(
            f"WR4_OBS_apse_panel_{index}", (x, y - 0.17, (2.70 + V4_WALL_TOP_Z) / 2.0 - 0.05),
            (half_length * 0.76, 0.065, (V4_WALL_TOP_Z - 2.70) / 2.0 - 0.12), palette["walnut"], static, bevel=0.045,
        )
        panel.rotation_euler.z = tangent
        rail = base.cube(
            f"WR4_OBS_apse_brass_rail_{index}", (x, y - 0.235, 2.62),
            (half_length * 0.80, 0.022, 0.030), palette["brass_dark"], static, bevel=0.012,
        )
        rail.rotation_euler.z = tangent
        joints.append((theta - step / 2.0, index))
    joints.append((end, segment_count))

    for theta, index in joints:
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        base.cylinder(
            f"WR4_OBS_apse_pilaster_{index}", (x, y - 0.10, V4_WALL_TOP_Z / 2.0), 0.19, V4_WALL_TOP_Z,
            palette["walnut_dark"], static, vertices=32,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_{index}", (x, y, (V4_WALL_TOP_Z + 0.22) / 2.0), 0.105, V4_WALL_TOP_Z + 0.22,
            palette["walnut_dark"], static, vertices=32,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_foot_{index}", (x, y, 0.30), 0.23, 0.30,
            palette["brass_dark"], static, vertices=40,
        )
        base.cylinder(
            f"WR4_OBS_apse_rib_cap_{index}", (x, y, V4_WALL_TOP_Z + 0.26), 0.16, 0.16,
            palette["brass"], static, vertices=36,
        )
        # Canonical crown: every pilaster ends in a polished brass finial.
        lod_sphere(
            f"WR4_OBS_apse_finial_{index}", (x, y, V4_WALL_TOP_Z + 0.55), 0.21,
            palette["brass"], static, scale=(1.0, 1.0, 1.15),
        )
        base.cylinder(
            f"WR4_OBS_apse_finial_spire_{index}", (x, y, V4_WALL_TOP_Z + 0.86), 0.035, 0.26,
            palette["brass"], static, vertices=16,
        )

    # Brass crown rail tying the open-sky parapet together, only along the
    # authored arc so nothing crosses the open front of the room.
    for index in range(segment_count):
        theta = start + (index + 0.5) * step
        x = radius * math.sin(theta)
        y = center_y + radius * math.cos(theta)
        rail = base.cube(
            f"WR4_OBS_apse_crown_rail_{index}", (x, y - 0.02, V4_WALL_TOP_Z + 0.06),
            (half_length, 0.24, 0.07), palette["brass_dark"], static, bevel=0.03,
        )
        rail.rotation_euler.z = math.atan2(-math.sin(theta), math.cos(theta))


def wall_face_y(x, inset=0.30):
    """Y of the inner face of the circular shell at lateral position x."""
    return V4_WALL_CENTER_Y + math.sqrt(max(0.0, V4_WALL_RADIUS ** 2 - x * x)) - inset


def _oculus_ring(name, radius, minor, y, material, static):
    cx, _cy, cz = V4_OCULUS_CENTER
    ring = base.torus(name, (cx, y, cz), radius, minor, material, static,
                      rotation=(math.pi / 2, 0, 0))
    ring.scale = (V4_OCULUS_ASPECT, 1.0, 1.0)
    return ring


def _oculus_band(name, cx, y, cz, a, b, *, top, bottom, material, static, samples=48):
    """Flat silhouette between two profiles (in units of the ellipse half-height),
    clipped to the oculus ellipse so nothing spills over the wall."""
    verts, faces = [], []
    for index in range(samples + 1):
        u = -1.0 + 2.0 * index / samples
        half = math.sqrt(max(0.0, 1.0 - u * u))
        lo = max(bottom(u), -half)
        hi = min(max(top(u), lo), half)
        # Local coordinates: the object origin sits at the oculus centre so
        # runtime batching groups it with the rest of the window.
        verts.append((u * a, 0.0, hi * b))
        verts.append((u * a, 0.0, lo * b))
    for index in range(samples):
        t0, b0, t1, b1 = 2 * index, 2 * index + 1, 2 * index + 2, 2 * index + 3
        faces.append((t0, b0, b1, t1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj.location = (cx, y, cz)
    obj.data.materials.append(material)
    static.objects.link(obj)
    base.tag(obj)
    return obj


def _heraldic_lion(name, center, scale, material, static, *, flat=False):
    """Stylised rampant lion built from a few primitives: at hero distance it
    must read as a gold heraldic beast, not as a literal sculpture."""
    cx, cy, cz = center
    s = scale
    parts = [
        ("body", (0.00, 0.00), (0.20, 0.30), -18),
        ("chest", (0.07, 0.24), (0.17, 0.17), 0),
        ("head", (0.13, 0.46), (0.13, 0.12), 0),
        ("mane", (0.08, 0.40), (0.18, 0.17), 0),
        ("fore_paw", (0.30, 0.34), (0.16, 0.05), 38),
        ("fore_paw_low", (0.29, 0.12), (0.15, 0.05), 12),
        ("hind_leg", (-0.02, -0.34), (0.07, 0.19), -12),
        ("hind_leg_back", (-0.19, -0.30), (0.06, 0.17), 22),
        ("tail", (-0.25, 0.10), (0.04, 0.24), -28),
        ("tail_tuft", (-0.31, 0.33), (0.07, 0.07), 0),
    ]
    for part, (dx, dz), (hx, hz), tilt in parts:
        if flat:
            # Woven into a rug: same silhouette lying on the floor, facing the player.
            piece = base.cube(
                f"{name}_{part}", (cx + dx * s, cy + dz * s, cz),
                (hx * s, hz * s, 0.006), material, static, bevel=0.004,
            )
            piece.rotation_euler.z = math.radians(-tilt)
            continue
        piece = base.cube(
            f"{name}_{part}", (cx + dx * s, cy, cz + dz * s),
            (hx * s, 0.025, hz * s), material, static, bevel=min(hx, hz) * s * 0.8,
        )
        piece.rotation_euler.y = math.radians(tilt)


def _heraldic_lion_flat(name, center, scale, material, static):
    _heraldic_lion(name, center, scale, material, static, flat=True)


def build_celestial_window(static, palette):
    """Elliptical lunar oculus: moon, one bright star, a lit hill town at night."""
    cx, cy, cz = V4_OCULUS_CENTER
    r = V4_OCULUS_RADIUS
    glass = base.cylinder(
        "WR4_OBS_celestial_window", (cx, cy, cz), r, 0.085,
        palette["night"], static, vertices=96,
    )
    glass.rotation_euler.x = math.pi / 2
    glass.scale = (V4_OCULUS_ASPECT, 1.0, 1.0)
    _oculus_ring("WR4_OBS_celestial_window_outer", r + 0.24, 0.13, cy - 0.07, palette["brass"], static)
    _oculus_ring("WR4_OBS_celestial_window_inner", r + 0.06, 0.075, cy - 0.12, palette["walnut_dark"], static)
    _oculus_ring("WR4_OBS_celestial_window_reveal", r + 0.46, 0.20, cy + 0.02, palette["walnut_dark"], static)
    _oculus_ring("WR4_OBS_celestial_window_halo", r + 0.38, 0.045, cy - 0.10, palette["brass_dark"], static)

    k = r / 2.62
    crescent_center = Vector((cx - 0.55 * k * V4_OCULUS_ASPECT, cy - 0.255, cz + 0.50 * r))
    crescent = base.cylinder(
        "WR4_OBS_window_crescent", crescent_center, 0.40, 0.040,
        palette["ivory"], static, vertices=64,
    )
    crescent.rotation_euler.x = math.pi / 2
    occluder = base.cylinder(
        "WR4_OBS_window_crescent_cutout",
        crescent_center + Vector((0.15, -0.028, 0.05)),
        0.37, 0.046, palette["night"], static, vertices=64,
    )
    occluder.rotation_euler.x = math.pi / 2
    lod_sphere("WR4_OBS_window_bright_star", (cx + 0.28, cy - 0.26, cz + 0.50 * r),
                0.075, palette["ivory"], static, scale=(1.0, 0.24, 1.0))

    stars = (
        (-1.55, 1.10, 0.022), (-1.15, 0.92, 0.028), (-0.20, 1.30, 0.020),
        (0.52, 1.22, 0.024), (1.08, 1.00, 0.026), (1.52, 0.72, 0.020),
        (-1.72, 0.42, 0.018), (0.82, 0.48, 0.020), (1.42, 0.20, 0.024),
        (-0.72, 0.30, 0.018), (0.10, 0.62, 0.021), (-1.30, 0.05, 0.018),
    )
    for index, (dx, dz, radius) in enumerate(stars):
        lod_sphere(
            f"WR4_OBS_window_star_{index}", (cx + dx * k * V4_OCULUS_ASPECT, cy - 0.25, cz + dz * k),
            radius, palette["ivory"] if index % 4 else palette["brass"], static,
            scale=(1.0, 0.24, 1.0),
        )

    # Nightscape seen through the oculus: silhouettes clipped to the window's
    # ellipse (far range, near town hills, lake), flat against the glass.
    a, b = r * V4_OCULUS_ASPECT * 0.985, r * 0.985

    def far_range(u):
        return -0.04 + 0.16 * abs(math.sin(u * 2.6 + 0.4)) + 0.05 * math.sin(u * 7.1)

    def near_hills(u):
        return -0.16 + 0.07 * math.sin(u * 4.3 + 1.1) + 0.04 * math.sin(u * 11.0)

    _oculus_band("WR4_OBS_window_far_range", cx, cy - 0.205, cz, a, b,
                 top=far_range, bottom=lambda u: -1.0, material=palette["night_ridge"], static=static)
    _oculus_band("WR4_OBS_window_town_hills", cx, cy - 0.215, cz, a, b,
                 top=near_hills, bottom=lambda u: -1.0, material=palette["night_town"], static=static)
    _oculus_band("WR4_OBS_window_lake", cx, cy - 0.225, cz, a, b,
                 top=lambda u: -0.60 + 0.015 * math.sin(u * 9.0), bottom=lambda u: -1.0,
                 material=palette["night"], static=static)
    base.cube("WR4_OBS_window_lake_glint", (crescent_center.x, cy - 0.235, cz - 0.76 * b),
              (0.035, 0.004, 0.10), palette["ivory"], static, bevel=0.004)
    for index, (dx, dz, h) in enumerate((
        (-0.82, -0.28, 0.46), (-0.48, -0.36, 0.34), (-0.10, -0.20, 0.58),
        (0.30, -0.34, 0.40), (0.66, -0.26, 0.50), (1.00, -0.40, 0.30),
    )):
        spire = base.cube(
            f"WR4_OBS_window_spire_{index}",
            (cx + dx * k * V4_OCULUS_ASPECT, cy - 0.245, cz + dz * k),
            (0.07 * k, 0.012, h * k * 0.5), palette["night_town"], static, bevel=0.03 * k,
        )
    for index, (dx, dz) in enumerate((
        (-0.95, -0.62), (-0.70, -0.50), (-0.52, -0.70), (-0.30, -0.55), (-0.05, -0.66),
        (0.12, -0.46), (0.35, -0.64), (0.55, -0.52), (0.78, -0.68), (1.02, -0.58),
        (-0.18, -0.80), (0.62, -0.84), (-0.82, -0.40), (0.92, -0.42), (-0.40, -0.86),
        (0.20, -0.92), (0.44, -0.40), (-0.62, -0.30),
    )):
        lod_sphere(
            f"WR4_OBS_window_town_light_{index}",
            (cx + dx * k * V4_OCULUS_ASPECT, cy - 0.26, cz + dz * k),
            0.035, palette["fire_core"], static, scale=(1.0, 0.3, 1.0),
        )

    # Lion crest crowning the oculus.
    crest_z = cz + r + 0.55
    base.cube("WR4_OBS_oculus_crest_shield", (cx, cy - 0.30, crest_z), (0.42, 0.06, 0.48),
              palette["brass"], static, bevel=0.20)
    base.cube("WR4_OBS_oculus_crest_field", (cx, cy - 0.37, crest_z + 0.02), (0.33, 0.03, 0.38),
              palette["banner_blue"], static, bevel=0.16)
    _heraldic_lion("WR4_OBS_oculus_crest_lion", (cx, cy - 0.41, crest_z), 0.62, palette["brass"], static)
    for side in (-1, 1):
        wing = base.cube(f"WR4_OBS_oculus_crest_scroll_{side}", (cx + side * 0.78, cy - 0.28, crest_z - 0.22),
                         (0.42, 0.05, 0.07), palette["brass_dark"], static, bevel=0.035)
        wing.rotation_euler.y = math.radians(-side * 24)

    # Heraldic blue banners with a gold lion flank the oculus (replace the
    # earlier green drapery, which the golden does not have).
    for side in (-1, 1):
        x = side * (r * V4_OCULUS_ASPECT + 1.20)
        wy = wall_face_y(x)
        top = V4_WALL_TOP_Z - 0.18
        base.cylinder(f"WR4_OBS_banner_rod_{side}", (x, wy - 0.02, top), 0.035, 1.30,
                      palette["brass"], static, vertices=16).rotation_euler.y = math.pi / 2
        body_half = 1.00
        body = base.cube(f"WR4_OBS_banner_{side}", (x, wy - 0.04, top - body_half - 0.04),
                         (0.52, 0.03, body_half), palette["banner_blue"], static, bevel=0.02)
        for tail in (-1, 1):
            point = base.cube(f"WR4_OBS_banner_tail_{side}_{tail}",
                              (x + tail * 0.26, wy - 0.04, top - 2 * body_half - 0.16),
                              (0.26, 0.03, 0.26), palette["banner_blue"], static, bevel=0.01)
            point.rotation_euler.y = math.radians(45)
        base.cube(f"WR4_OBS_banner_trim_{side}", (x, wy - 0.075, top - 0.16), (0.52, 0.012, 0.05),
                  palette["brass"], static, bevel=0.01)
        _heraldic_lion(f"WR4_OBS_banner_lion_{side}", (x, wy - 0.085, top - 0.92), 0.95,
                       palette["brass"], static)

    window_light = base.light(
        "WR4_LIGHT_window", "AREA", (0, 5.80, cz + 0.6), 420.0,
        (0.16, 0.42, 1.0), static, size=4.6,
    )
    base.look_at(window_light, (0, 0.2, 1.1))
    base.anchor("WR_ANCHOR_window_moonlight", (0, 5.9, cz + 0.6), static)


def join_into(objects, name):
    """Fuse authored parts into one mesh (one runtime draw) under a stable name."""
    objects = [obj for obj in objects if obj is not None]
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


def build_night_backdrop(static, palette):
    """Open sky beyond the crown: deep blue dome, ridge line and pine silhouettes."""
    # Open (uncapped) sleeve: the review camera sits inside it, so caps would
    # blank the whole room.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=30.0, depth=26.0,
                                        end_fill_type="NOTHING", location=(0, -0.72, 12.0))
    sky = bpy.context.object
    sky.name = "WR4_OBS_sky_backdrop"
    sky.data.materials.append(palette["night_sky"])
    base.tag(sky)
    base.relink(sky, static)
    # From the steep play camera the ground beyond the open crown is visible:
    # a dark moonlit meadow closes the sleeve, dotted with pine silhouettes.
    bpy.ops.mesh.primitive_circle_add(vertices=96, radius=30.0, fill_type="NGON",
                                      location=(0, -0.72, -0.30))
    ground = bpy.context.object
    ground.name = "WR4_OBS_night_ground"
    ground.data.materials.append(palette["night_ground"])
    base.tag(ground)
    base.relink(ground, static)

    pines = []
    for index in range(72):
        # Deterministic golden-angle scatter in a ring outside the tower.
        theta = index * 2.399963
        radius = 10.6 + (index * 0.618034 % 1.0) * 14.0
        x = radius * math.sin(theta)
        y = -0.72 + radius * math.cos(theta)
        if y < -7.5 and abs(x) < 9.0:
            continue  # keep the player's side of the tower clear
        h = 2.2 + ((index * 7) % 5) * 0.45
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.55 + (index % 3) * 0.12, radius2=0.0,
                                        depth=h, location=(x, y, h / 2.0 - 0.3))
        pine = bpy.context.object
        pine.name = f"WR4_OBS_sky_pine_{index}"
        pine.data.materials.append(palette["night_pine"])
        base.tag(pine)
        base.relink(pine, static)
        pines.append(pine)
    join_into(pines, "WR4_OBS_sky_pines")


V4_FRAME_HALF = 5.30   # outer edge of the walnut board frame
V4_PLINTH_HALF = 5.62  # floor step under it


def build_round_command_table(static, palette):
    """Golden board dais: broad walnut frame, brass fillets, corner domes, warm bulbs."""
    fh, ph = V4_FRAME_HALF, V4_PLINTH_HALF
    base.cube("WR4_OBS_board_plinth", (0, 0, 0.20), (ph, ph, 0.20),
              palette["walnut_dark"], static, bevel=0.07)
    base.cube("WR4_OBS_board_plinth_band", (0, 0, 0.40), (ph + 0.03, ph + 0.03, 0.035),
              palette["brass_dark"], static, bevel=0.02)
    base.cube("WR4_OBS_board_cradle", (0, 0, 0.74), (fh, fh, 0.33),
              palette["walnut"], static, bevel=0.06)
    rim_center = (4.02 + fh) / 2.0
    rim_half = (fh - 4.02) / 2.0
    for side in (-1, 1):
        for axis, name in ((0, "x"), (1, "y")):
            loc = [0.0, 0.0, 1.10]
            half = [fh, fh, 0.075]
            loc[1 - axis] = side * rim_center
            half[1 - axis] = rim_half
            base.cube(f"WR4_OBS_board_rim_{name}_{side}", tuple(loc), tuple(half),
                      palette["walnut"], static, bevel=0.05)
            for label, offset, width in (("inner", 4.04, 0.025), ("mid", fh - 0.42, 0.018)):
                band = [0.0, 0.0, 1.175]
                band_half = [offset + width, offset + width, 0.020]
                band[1 - axis] = side * offset
                band_half[1 - axis] = width
                base.cube(f"WR4_OBS_board_brass_{label}_{name}_{side}", tuple(band), tuple(band_half),
                          palette["brass"], static, bevel=0.010)
            outer = [0.0, 0.0, 1.10]
            outer_half = [fh + 0.02, fh + 0.02, 0.06]
            outer[1 - axis] = side * (fh + 0.01)
            outer_half[1 - axis] = 0.035
            base.cube(f"WR4_OBS_board_edge_{name}_{side}", tuple(outer), tuple(outer_half),
                      palette["brass"], static, bevel=0.015)
            # Warm bulbs set into the rim, as in the golden.
            for index in range(11):
                t = -5.0 + index * 1.0
                bulb = [0.0, 0.0, 1.19]
                bulb[axis] = t
                bulb[1 - axis] = side * (fh - 0.20)
                lod_sphere(f"WR4_OBS_board_bulb_{name}_{side}_{index}", tuple(bulb), 0.050,
                            palette["fire_core"], static)
    for sx in (-1, 1):
        for sy in (-1, 1):
            c = fh - 0.22
            base.cylinder(f"WR4_OBS_board_corner_post_{sx}_{sy}", (sx * c, sy * c, 1.22),
                          0.24, 0.14, palette["brass_dark"], static, vertices=32)
            lod_sphere(f"WR4_OBS_board_corner_dome_{sx}_{sy}", (sx * c, sy * c, 1.34),
                        0.28, palette["brass"], static, scale=(1.0, 1.0, 0.82))
            lod_sphere(f"WR4_OBS_board_corner_bulb_{sx}_{sy}", (sx * c, sy * c, 1.60),
                        0.075, palette["fire_core"], static)
            base.light(f"WR4_LIGHT_board_corner_{sx}_{sy}", "POINT", (sx * c, sy * c, 1.85), 55.0,
                       (1.0, 0.52, 0.20), static, radius=0.35)


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
            lod_sphere(f"WR4_OBS_oculus_desk_pull_{side}_{row}",
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
    base.cube("WR4_OBS_library_crown", (x, y - 0.08, 4.40), (1.36, 0.42, 0.13),
              palette["walnut"], static, bevel=0.06)
    base.cube("WR4_OBS_library_crown_brass", (x, y - 0.52, 4.33), (1.18, 0.025, 0.035),
              palette["brass"], static, bevel=0.015)


def build_armor_pair(static, palette):
    """Two restrained ceremonial suits framing the room without stealing board focus."""
    for side in (-1, 1):
        x, y = side * 6.55, (V4_HANS_LEFT_ARMOR_Y if side < 0 else 2.85)
        base.cylinder(f"WR4_OBS_armor_base_{side}", (x, y, 0.22), 0.48, 0.16,
                      palette["walnut_dark"], static, vertices=36)
        base.cube(f"WR4_OBS_armor_torso_{side}", (x, y, 1.32), (0.38, 0.25, 0.44),
                  palette["steel"], static, bevel=0.12)
        base.cube(f"WR4_OBS_armor_waist_{side}", (x, y, 0.93), (0.30, 0.22, 0.16),
                  palette["charcoal"], static, bevel=0.07)
        for leg in (-1, 1):
            base.cube(f"WR4_OBS_armor_leg_{side}_{leg}", (x + leg * 0.16, y, 0.57),
                      (0.10, 0.11, 0.24), palette["steel"], static, bevel=0.05)
        for shoulder in (-1, 1):
            lod_sphere(f"WR4_OBS_armor_pauldron_{side}_{shoulder}",
                        (x + shoulder * 0.43, y, 1.55), 0.20,
                        palette["steel"], static, scale=(1.25, 0.75, 0.70))
        lod_sphere(f"WR4_OBS_armor_helmet_{side}", (x, y, 2.00), 0.24,
                    palette["steel"], static, scale=(0.95, 1.0, 1.15))
        base.cube(f"WR4_OBS_armor_plume_{side}", (x, y + 0.05, 2.30), (0.04, 0.16, 0.10),
                  palette["rug_red"], static, bevel=0.035)
        base.cube(f"WR4_OBS_armor_visor_{side}", (x, y - 0.23, 1.98), (0.20, 0.025, 0.04),
                  palette["charcoal"], static, bevel=0.012)
        shaft_x = x - side * 0.48
        base.cylinder(f"WR4_OBS_armor_halberd_{side}", (shaft_x, y, 1.65), 0.025, 2.75,
                      palette["brass_dark"], static, vertices=16)


def build_observatory_telescope(static, palette):
    """A restrained premium telescope: legible, but secondary to the board and oculus."""
    hub = Vector((4.82, 4.46, 1.05))
    lod_sphere("WR4_OBS_telescope_mount", hub, 0.16, palette["brass_dark"], static,
                scale=(1.08, 1.08, 0.90))
    base.cylinder("WR4_OBS_telescope_mount_ring", hub, 0.25, 0.060,
                  palette["copper"], static, vertices=48)

    tripod_feet = ((4.34, 3.96, 0.14), (5.30, 4.02, 0.14), (4.92, 4.86, 0.14))
    for index, foot in enumerate(tripod_feet):
        cylinder_between(f"WR4_OBS_telescope_tripod_{index}", hub, foot, 0.048,
                         palette["rug_red"], static, vertices=24)
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
        lod_sphere(f"WR4_OBS_telescope_yoke_cap_{side}", point, 0.085,
                    palette["copper"], static)

    # Golden: a larger instrument between the desk and the library, tube
    # raised toward the oculus. Scale the authored parts rigidly about the hub.
    new_hub = Vector((3.95, 4.95, 0.0))
    factor = 1.55
    for obj in static.objects:
        if not obj.name.startswith("WR4_OBS_telescope_"):
            continue
        offset = obj.location - Vector((hub.x, hub.y, 0.0))
        obj.location = new_hub + offset * factor
        obj.scale = tuple(component * factor for component in obj.scale)


def build_lounge_corner(static, palette):
    """Compact club chair and side table from the canonical mock."""
    x, y = 7.05, 1.55
    chair_yaw = math.radians(-83)

    # Classic club-chair silhouette: padded cuboids read better at game camera
    # distance than the previous bulbous sphere-based back and arms.
    base.cube(
        "WR4_OBS_chair_seat", (x, y, 0.58), (0.76, 0.60, 0.16),
        palette["walnut_dark"], static, bevel=0.18,
    )
    back = base.cube(
        "WR4_OBS_chair_back", (x, y + 0.50, 1.34), (0.76, 0.19, 0.74),
        palette["navy_leather"], static, bevel=0.32,
    )
    back.rotation_euler.x = math.radians(-7)
    back_pad = base.cube(
        "WR4_OBS_chair_back_pad", (x, y + 0.29, 1.34), (0.57, 0.11, 0.52),
        palette["navy_leather"], static, bevel=0.22,
    )
    back_pad.rotation_euler.x = math.radians(-7)

    for side in (-1, 1):
        base.cube(
            f"WR4_OBS_chair_wing_{side}", (x + side * 0.62, y + 0.40, 1.35),
            (0.12, 0.22, 0.54), palette["navy_leather"], static, bevel=0.16,
        )
        base.cube(
            f"WR4_OBS_chair_arm_{side}", (x + side * 0.77, y - 0.03, 0.91),
            (0.16, 0.53, 0.17), palette["navy_leather"], static, bevel=0.16,
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
            lod_sphere(
                f"WR4_OBS_chair_stud_{side}_{stud_index}",
                (x + side * 0.94, y + stud_y, 0.93),
                0.026, palette["brass"], static,
            )

    base.cube(
        "WR4_OBS_chair_cushion", (x, y - 0.07, 0.82), (0.61, 0.49, 0.13),
        palette["navy_leather"], static, bevel=0.22,
    )
    for side in (-1, 1):
        base.cube(
            f"WR4_OBS_chair_inner_arm_{side}", (x + side * 0.60, y - 0.02, 0.96),
            (0.055, 0.43, 0.13), palette["navy_leather"], static, bevel=0.10,
        )
    # A restrained brass foot rail and buttoning make the lounge read as
    # bespoke observatory furniture at the game camera distance.
    base.cube(
        "WR4_OBS_chair_front_rail", (x, y - 0.49, 0.43), (0.58, 0.055, 0.055),
        palette["brass_dark"], static, bevel=0.025,
    )
    for row, z in enumerate((1.18, 1.50)):
        for col, button_x in enumerate((-0.30, 0.0, 0.30)):
            lod_sphere(
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
        palette["rug_red"], static, bevel=0.15,
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

    # Round crimson rug with a gold ring grounds the lounge corner.
    base.cylinder("WR4_OBS_lounge_rug_gold", (6.95, 1.35, 0.068), 1.42, 0.02,
                  palette["rug_gold"], static, vertices=64)
    base.cylinder("WR4_OBS_lounge_rug", (6.95, 1.35, 0.090), 1.32, 0.02,
                  palette["rug_red"], static, vertices=64)
    base.torus("WR4_OBS_lounge_rug_ring", (6.95, 1.35, 0.105), 1.05, 0.022,
               palette["rug_gold"], static)

    tx, ty = 6.10, 0.45
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
        lod_sphere(
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
        lod_sphere(
            f"WR4_OBS_globe_star_{star}", (x + dx, y - dy, center[2] + dz),
            0.016, palette["brass"], static,
        )


def build_potted_plants(static, palette):
    """Brass-potted palms: the golden's small touches of green."""
    for index, (x, y, size) in enumerate(((-7.25, -2.85, 1.0), (-3.55, 5.70, 1.15))):
        base.cylinder(f"WR4_OBS_plant_pot_{index}", (x, y, 0.36 * size), 0.34 * size, 0.62 * size,
                      palette["brass"], static, vertices=32)
        base.torus(f"WR4_OBS_plant_pot_rim_{index}", (x, y, 0.68 * size), 0.34 * size, 0.04 * size,
                   palette["brass_dark"], static)
        for leaf in range(9):
            angle = leaf * (2 * math.pi / 9) + index * 0.3
            lean = math.radians(38 + (leaf % 3) * 12)
            length = (0.62 + (leaf % 2) * 0.18) * size
            blade = base.cube(
                f"WR4_OBS_plant_leaf_{index}_{leaf}",
                (x + math.cos(angle) * 0.30 * size, y + math.sin(angle) * 0.30 * size, 0.95 * size),
                (0.09 * size, length / 2.0, 0.012), palette["plant"], static, bevel=0.02 * size,
            )
            blade.rotation_euler = (lean, 0.0, angle - math.pi / 2)


def build_wall_paintings(static, palette):
    """Gilt-framed night castle paintings on the side walls."""
    for side in (-1, 1):
        theta = math.radians(side * 64)
        x = V4_WALL_RADIUS * math.sin(theta)
        y = V4_WALL_CENTER_Y + V4_WALL_RADIUS * math.cos(theta)
        radial = Vector((math.sin(theta), math.cos(theta), 0.0))
        c = Vector((x, y, 3.30)) - radial * 0.30
        yaw = math.atan2(-math.sin(theta), math.cos(theta))
        frame = base.cube(f"WR4_OBS_painting_frame_{side}", c, (0.78, 0.06, 0.62),
                          palette["brass"], static, bevel=0.05)
        frame.rotation_euler.z = yaw
        canvas = base.cube(f"WR4_OBS_painting_canvas_{side}", c - radial * 0.05, (0.66, 0.02, 0.50),
                           palette["night"], static, bevel=0.01)
        canvas.rotation_euler.z = yaw
        hill = base.cube(f"WR4_OBS_painting_castle_{side}", c - radial * 0.08 + Vector((0, 0, -0.22)),
                         (0.50, 0.012, 0.16), palette["night_ridge"], static, bevel=0.06)
        hill.rotation_euler.z = yaw
        for t, (dx, h) in enumerate(((-0.18, 0.30), (0.0, 0.42), (0.18, 0.26))):
            tower = base.cube(f"WR4_OBS_painting_tower_{side}_{t}",
                              c - radial * 0.09 + Vector((math.cos(yaw) * dx, math.sin(yaw) * dx, -0.08 + h / 2.0)),
                              (0.045, 0.012, h / 2.0), palette["night_town"], static, bevel=0.01)
            tower.rotation_euler.z = yaw


def build_wall_lanterns(static, palette):
    """Warm wall lanterns replace the suspended armillary and keep the ceiling open."""
    for side, x in (("left", -4.55), ("right", 4.55)):
        y, z = wall_face_y(x, inset=0.22), 3.35
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
            f"WR4_LIGHT_wall_lantern_{side}", "POINT", (x, y - 0.50, z), 190.0,
            (1.0, 0.44, 0.12), static, radius=1.05,
        )
        lamp["war_room_runtime_dynamic"] = "v4-lantern"
    base.anchor("WR_ANCHOR_chandelier_practical", (0, 6.85, 3.35), static)


def build_pilaster_sconces(static, palette):
    """Golden: a warm sconce on most pilasters rings the room with light.

    Emissive glass travels to the runtime inside the GLB (Blender lights do
    not), so this is what carries the golden's warmth into the game. Parts are
    fused per material to keep runtime batching inside its budget.
    """
    radius = V4_WALL_RADIUS
    start = math.radians(V4_WALL_START_DEG)
    end = math.radians(V4_WALL_END_DEG)
    step = (end - start) / V4_WALL_SEGMENT_COUNT
    door = math.radians(V4_ENTRY_THETA_DEG)
    plates, glows = [], []
    for index in range(1, V4_WALL_SEGMENT_COUNT):
        theta = start + index * step
        if abs(theta) < math.radians(34) or abs(theta - door) < math.radians(9):
            continue  # oculus, banners and the tower door keep their bays
        if index % 2:
            continue
        radial = Vector((math.sin(theta), math.cos(theta), 0.0))
        c = Vector((radius * radial.x, V4_WALL_CENTER_Y + radius * radial.y, 3.05)) - radial * 0.36
        yaw = math.atan2(-math.sin(theta), math.cos(theta))
        plate = base.cube(f"WR4_OBS_sconce_plate_{index}", c + radial * 0.06, (0.11, 0.03, 0.22),
                          palette["brass"], static, bevel=0.02)
        plate.rotation_euler.z = yaw
        arm = base.cube(f"WR4_OBS_sconce_arm_{index}", c - Vector((0, 0, 0.16)), (0.03, 0.10, 0.03),
                        palette["brass"], static, bevel=0.01)
        arm.rotation_euler.z = yaw
        cup = base.cylinder(f"WR4_OBS_sconce_cup_{index}", c - radial * 0.08 - Vector((0, 0, 0.10)),
                            0.09, 0.08, palette["brass"], static, vertices=16)
        plates += [plate, arm, cup]
        glows.append(lod_sphere(f"WR4_OBS_sconce_glow_{index}", c - radial * 0.08 + Vector((0, 0, 0.04)),
                                0.085, palette["fire_core"], static, scale=(1.0, 1.0, 1.35)))
    if plates:
        join_into(plates, "WR4_OBS_sconce_brass")
        join_into(glows, "WR4_OBS_sconce_glow")


def build_desk_candles(static, palette):
    """Candelabra on the oculus desk, as in the golden."""
    x, y, top = -0.15, 5.40, 1.43
    parts, flames = [], []
    parts.append(base.cube("WR4_OBS_candelabra_base", (x, y, top + 0.03), (0.42, 0.10, 0.03),
                           palette["brass"], static, bevel=0.015))
    for index, dx in enumerate((-0.32, -0.16, 0.0, 0.16, 0.32)):
        h = 0.26 if index != 2 else 0.34
        parts.append(base.cylinder(f"WR4_OBS_candle_{index}", (x + dx, y, top + 0.06 + h / 2.0),
                                   0.035, h, palette["ivory"], static, vertices=12))
        flames.append(lod_sphere(f"WR4_OBS_candle_flame_{index}", (x + dx, y, top + 0.10 + h),
                                 0.04, palette["fire_core"], static, scale=(0.8, 0.8, 1.6)))
    join_into(parts, "WR4_OBS_candelabra")
    join_into(flames, "WR4_OBS_candle_flames")


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
        "WR4_OBS_entry_door_slab", (center.x, center.y, door_z),
        (0.88, 0.11, 1.80), palette["teal"], static, bevel=0.14,
    )
    door.rotation_euler.z = angle
    validate_v4_entry_door(door)
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
    porthole = cylinder_between(
        "WR4_OBS_entry_porthole", glass_start, glass_end, 0.34,
        palette["night"], static, vertices=56,
    )
    ring = base.torus(
        "WR4_OBS_entry_porthole_ring", glass_start, 0.39, 0.055,
        palette["brass"], static,
    )
    ring.rotation_euler = radial.to_track_quat("Z", "Y").to_euler()

    # Pull on the free edge, away from the hinge.
    handle_center = front + tangent * 0.48 + Vector((0, 0, -0.30))
    hub = lod_sphere("WR4_OBS_entry_handle_hub", handle_center, 0.105,
                     palette["brass_dark"], static)
    handle = cylinder_between(
        "WR4_OBS_entry_handle", handle_center, handle_center - tangent * 0.34,
        0.045, palette["brass"], static, vertices=28,
    )
    build_hans_door(static, palette, (door, inset, porthole, ring, hub, handle),
                    center, tangent, radial)

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


def validate_v4_entry_door(door):
    """The leaf is authored tangent to the shell and seated on its threshold."""
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


def v4_hans_door_hinge(center, tangent, radial):
    """Hinge on the player-side jamb, on the leaf's room face."""
    hinge = center - tangent * V4_HANS_DOOR_HALF - radial * 0.11
    return Vector((hinge.x, hinge.y, 0.0))


def build_hans_door(static, palette, parts, center, tangent, radial):
    """Turn the tower door into a hinged leaf with a dark landing behind it."""
    angle = math.atan2(tangent.y, tangent.x)
    void = base.cube(
        "WR4_OBS_entry_void", (center.x - radial.x * 0.035, center.y - radial.y * 0.035, V4_ENTRY_DOOR_Z),
        (0.86, 0.012, 1.76), palette["charcoal"], static, bevel=0.0,
    )
    void.rotation_euler.z = angle
    leaf = join_into(list(parts), V4_HANS_DOOR_LEAF)
    hinge = v4_hans_door_hinge(center, tangent, radial)
    cursor = bpy.context.scene.cursor
    previous_cursor = cursor.location.copy()
    cursor.location = hinge
    bpy.ops.object.select_all(action="DESELECT")
    leaf.select_set(True)
    bpy.context.view_layer.objects.active = leaf
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    bpy.ops.object.origin_set(type="ORIGIN_CURSOR")
    leaf.select_set(False)
    cursor.location = previous_cursor
    leaf["war_room_runtime_dynamic"] = "v4-hans-door"
    leaf["war_room_hans_door_open_yaw"] = V4_HANS_DOOR_OPEN_YAW
    for name, loc in V4_HANS_ANCHORS:
        base.anchor(name, loc, static)


def validate_v4_hans_stage():
    """Hans' leaf swings into the room clear of his walk; his anchors clear the decor."""
    objects = bpy.context.scene.objects
    leaf = objects[V4_HANS_DOOR_LEAF]
    if leaf.get("war_room_runtime_dynamic") != "v4-hans-door":
        raise RuntimeError("War Room v4 Hans door leaf must stay a dynamic runtime node")
    if any(abs(value) > 1e-6 for value in leaf.rotation_euler):
        raise RuntimeError("War Room v4 Hans door leaf must export closed with no rotation")
    theta = math.radians(V4_ENTRY_THETA_DEG)
    radial = Vector((math.sin(theta), math.cos(theta), 0.0))
    tangent = Vector((math.cos(theta), -math.sin(theta), 0.0))
    wall = Vector((V4_WALL_RADIUS * radial.x, V4_WALL_CENTER_Y + V4_WALL_RADIUS * radial.y, 0.0))
    hinge = v4_hans_door_hinge(wall - radial * 0.205, tangent, radial)
    if (Vector((leaf.location.x, leaf.location.y, leaf.location.z)) - hinge).length > 1e-3:
        raise RuntimeError(f"War Room v4 Hans door origin is not on its hinge: {tuple(leaf.location)}")
    yaw = V4_HANS_DOOR_OPEN_YAW
    c, s = math.cos(yaw), math.sin(yaw)
    open_dir = Vector((tangent.x * c - tangent.y * s, tangent.x * s + tangent.y * c, 0.0))
    if open_dir.dot(-radial) < 0.95:
        raise RuntimeError(f"War Room v4 Hans door does not open into the room: {tuple(open_dir)}")
    anchors = dict(V4_HANS_ANCHORS)
    # Every walk anchor stays off the board dais and clear of the armour bases.
    dais = V4_PLINTH_HALF + 0.20
    armors = ((-6.55, V4_HANS_LEFT_ARMOR_Y), (6.55, 2.85))
    for name, (x, y, _z) in V4_HANS_ANCHORS:
        if name == "WR_ANCHOR_hans_hearth":
            continue
        if abs(x) < dais and abs(y) < dais:
            raise RuntimeError(f"War Room v4 Hans anchor {name} stands on the board dais")
        for ax, ay in armors:
            if math.hypot(x - ax, y - ay) < 0.48 + 0.30:
                raise RuntimeError(f"War Room v4 Hans anchor {name} walks into the armour at ({ax}, {ay})")
        wall_distance = V4_WALL_RADIUS - math.hypot(x, y - V4_WALL_CENTER_Y)
        if wall_distance < 0.45:
            raise RuntimeError(f"War Room v4 Hans anchor {name} is inside the wall: {wall_distance:.2f}")
    # The open leaf must clear the armour guarding the door.
    hinge2 = Vector((hinge.x, hinge.y))
    tip = hinge2 + Vector((open_dir.x, open_dir.y)) * (2 * V4_HANS_DOOR_HALF)
    armor = Vector((-6.55, V4_HANS_LEFT_ARMOR_Y))
    t = max(0.0, min(1.0, (armor - hinge2).dot(tip - hinge2) / (tip - hinge2).length_squared))
    if (hinge2 + (tip - hinge2) * t - armor).length < 0.48 + 0.15:
        raise RuntimeError("War Room v4 Hans door swings into the door armour")
    work_y = anchors["WR_ANCHOR_hans_hearth"][1] - 0.72
    # The armour (x -6.55) shares Hans' work lane; it must neither stand on his
    # spot nor right in front of it, between him and the play camera.
    if V4_HANS_LEFT_ARMOR_Y - 0.48 < work_y + 0.25 and V4_HANS_LEFT_ARMOR_Y + 0.48 > work_y - 1.6:
        raise RuntimeError("War Room v4 left armour blocks or hides Hans' hearth work spot")


def patch_v4_hans_door_extras(path):
    """Carry the door's open yaw on its glTF node (three.js userData)."""
    raw = Path(path).read_bytes()
    chunks = []
    offset = 12
    patched = 0
    while offset + 8 <= len(raw):
        chunk_length, chunk_type = struct.unpack_from("<II", raw, offset)
        offset += 8
        chunk = raw[offset:offset + chunk_length]
        offset += chunk_length
        if chunk_type == 0x4E4F534A:
            data = json.loads(chunk.decode("utf-8").rstrip("\x00 \t\r\n"))
            for node in data.get("nodes", []):
                if node.get("name") == V4_HANS_DOOR_LEAF:
                    node.setdefault("extras", {})["war_room_hans_door_open_yaw"] = V4_HANS_DOOR_OPEN_YAW
                    patched += 1
            chunk = json.dumps(data, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
            chunk += b" " * ((4 - len(chunk) % 4) % 4)
        chunks.append((chunk_type, chunk))
    if patched != 1:
        raise RuntimeError(f"War Room v4 Hans door node patched {patched} times")
    total = 12 + sum(8 + len(chunk) for _chunk_type, chunk in chunks)
    out = bytearray(struct.pack("<4sII", b"glTF", 2, total))
    for chunk_type, chunk in chunks:
        out.extend(struct.pack("<II", len(chunk), chunk_type))
        out.extend(chunk)
    Path(path).write_bytes(out)


def build_lighting(static):
    scene = bpy.context.scene
    scene["war_room_variant"] = "v4-celestial-observatory"
    scene["war_room_visual_canon"] = V4_CANON
    scene.view_settings.exposure = 0.45

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
    cam["war_room_camera_profile"] = "v4-runtime-shared-play-pitch-v1"
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


def mirror_preview_sides():
    """Preview-only: seat White on the player's (camera) side, as in the golden.
    Reflect across the board's x axis; the runtime board is unaffected."""
    moved = 0
    for obj in bpy.context.scene.objects:
        if not obj.name.startswith(("WR_PREVIEW_white_", "WR_PREVIEW_black_")):
            continue
        if obj.get("war_room_role") != base.ROLE_PREVIEW:
            raise RuntimeError(f"War Room v4 refuses to mirror non-preview object {obj.name}")
        obj.location.y = -obj.location.y
        obj.rotation_euler.x = -obj.rotation_euler.x
        obj.rotation_euler.z = -obj.rotation_euler.z
        moved += 1
    if moved < 32:
        raise RuntimeError(f"War Room v4 preview mirror touched too few pieces: {moved}")


def fuse_warm_glows(static):
    """One runtime draw for every static warm emissive (rim bulbs, town lights,
    lanterns, sconces, candles). They are tiny, so per-cell culling buys nothing,
    and fusing them keeps runtime batching inside its 150-mesh budget. The
    animated fireplace flames are runtime-dynamic and stay separate."""
    glows = [
        obj for obj in static.objects
        if obj.type == "MESH"
        and not obj.get("war_room_runtime_dynamic")
        and len(obj.data.materials) == 1
        and obj.data.materials[0] is not None
        and obj.data.materials[0].name == "WR_MAT_fire_core"
    ]
    if len(glows) < 20:
        raise RuntimeError(f"War Room v4 warm glow census suspiciously small: {len(glows)}")
    join_into(glows, "WR4_OBS_warm_glows")


def apply_v4_identity():
    static = bpy.data.collections.get("WR_STATIC_SHELL")
    if static is None:
        raise RuntimeError("War Room v4 static shell missing")
    clear_inherited_room(static)
    palette = build_v4_palette()
    build_curved_observatory(static, palette)
    build_celestial_window(static, palette)
    build_night_backdrop(static, palette)
    build_round_command_table(static, palette)
    build_white_fireplace(static, palette)
    build_oculus_desk(static, palette)
    build_library_wall(static, palette)
    build_armor_pair(static, palette)
    build_observatory_telescope(static, palette)
    build_lounge_corner(static, palette)
    build_tower_entry(static, palette)
    build_wall_lanterns(static, palette)
    build_pilaster_sconces(static, palette)
    build_desk_candles(static, palette)
    build_potted_plants(static, palette)
    build_wall_paintings(static, palette)
    build_lighting(static)
    fuse_warm_glows(static)
    mirror_preview_sides()
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
        "WR4_OBS_side_runner_-1",
        "WR4_OBS_side_runner_1",
        "WR4_OBS_board_plinth",
        "WR4_OBS_board_corner_dome_1_1",
        "WR4_OBS_oculus_crest_shield",
        "WR4_OBS_banner_-1",
        "WR4_OBS_banner_1",
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
        V4_HANS_DOOR_LEAF,
        "WR4_OBS_entry_void",
        *(name for name, _loc in V4_HANS_ANCHORS),
        "WR4_OBS_entry_rug",
        "WR4_OBS_warm_glows",
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
        "WR4_OBS_compass_", "WR4_OBS_window_drape_", "WR4_OBS_table_drum",
        "WR4_OBS_table_leather_top",
    )
    forbidden = sorted(name for name in names if name.startswith(forbidden_prefixes))
    if forbidden:
        raise RuntimeError(f"War Room v4 inherited v2 visual geometry: {forbidden[:12]}")
    if sum(1 for name in names if name == "WR_ANCHOR_fireplace_practical") != 1:
        raise RuntimeError("War Room v4 must contain exactly one fireplace practical")

    end_rib = bpy.data.objects.get(f"WR4_OBS_apse_rib_{V4_WALL_SEGMENT_COUNT}")
    if end_rib is None:
        raise RuntimeError("War Room v4 shell validation objects missing")
    if V4_WALL_END_DEG < 108 or V4_WALL_START_DEG > -108:
        raise RuntimeError("War Room v4 side shell no longer encloses the lateral room")
    validate_v4_hans_stage()


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
    hans_missing = sorted({V4_HANS_DOOR_LEAF, *(name for name, _loc in V4_HANS_ANCHORS)} - node_names)
    if hans_missing:
        raise RuntimeError(f"War Room v4 runtime lost Hans' stage: {hans_missing}")
    leaf_node = next(row for row in data["nodes"] if row.get("name") == V4_HANS_DOOR_LEAF)
    if leaf_node.get("extras", {}).get("war_room_hans_door_open_yaw") != V4_HANS_DOOR_OPEN_YAW:
        raise RuntimeError("War Room v4 runtime Hans door lost its open yaw")
    if "mesh" not in leaf_node or any(abs(float(v)) > 1e-5 for v in leaf_node.get("rotation", [0, 0, 0, 1])[:3]):
        raise RuntimeError("War Room v4 runtime Hans door must be a closed, unrotated mesh node")

    materials = {row.get("name"): row for row in data.get("materials", [])}
    required_materials = {
        "WR4_MAT_warm_travertine",
        "WR4_MAT_radial_slate",
        "WR4_MAT_green_marble",
        "WR4_MAT_entry_rug",
        "WR4_MAT_rug_gold",
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
        is_runtime_anchor = obj.type == "EMPTY" and (
            obj.name in runtime_anchors or obj.name.startswith(V4_HANS_ANCHOR_PREFIX)
        )
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
    patch_v4_hans_door_extras(path)
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
