#!/usr/bin/env python3
"""Build the independent War Room v3 "Celestial Observatory" shell.

V3 keeps only the live-board anchor and canonical camera from the v2 generator.
Its authored room is rebuilt from an empty static collection: a curved tower
apse, circular command table, celestial window, single cast-iron stove,
brass telescope, tower entry and suspended armillary replace v2's rectangular
hall.
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


def ellipse_tube(name, center, radii, tilt, depth, material, owner, *, segments=56):
    """Build a smooth, closed orbital line in the vertical window plane."""
    cx, cy, cz = center
    rx, rz = radii
    points = []
    for index in range(segments):
        angle = index * math.tau / segments
        px = math.cos(angle) * rx
        pz = math.sin(angle) * rz
        x = px * math.cos(tilt) - pz * math.sin(tilt)
        z = px * math.sin(tilt) + pz * math.cos(tilt)
        points.append((cx + x, cy, cz + z))
    curve = bpy.data.curves.new(name + "_curve", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, coordinates in zip(spline.points, points):
        point.co = (*coordinates, 1.0)
    spline.use_cyclic_u = True
    obj = bpy.data.objects.new(name, curve)
    curve.materials.append(material)
    owner.objects.link(obj)
    base.tag(obj, base.ROLE_STATIC)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target="MESH")
    obj.select_set(False)
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
    # The original wheel-like spokes and central orb made the oculus feel like
    # machinery. Asymmetric orbital sweeps, a flat crescent and one restrained
    # constellation make it read as a navigational night chart instead.
    for index, (radii, tilt, depth, material) in enumerate((
        ((1.68, 0.72), math.radians(18), 0.025, palette["brass"]),
        ((1.42, 0.95), math.radians(-31), 0.020, palette["copper"]),
        ((1.12, 0.48), math.radians(57), 0.016, palette["brass_dark"]),
    )):
        ellipse_tube(f"WR3_OBS_window_orbit_{index}", (cx, cy - 0.18, cz),
                     radii, tilt, depth, material, static)

    crescent_center = Vector((-0.72, cy - 0.255, cz + 0.52))
    crescent = base.cylinder("WR3_OBS_window_crescent", crescent_center, 0.38, 0.040,
                             palette["ivory"], static, vertices=64)
    crescent.rotation_euler.x = math.pi / 2
    occluder = base.cylinder("WR3_OBS_window_crescent_cutout",
                             crescent_center + Vector((0.18, -0.028, 0.06)),
                             0.36, 0.046, palette["night"], static, vertices=64)
    occluder.rotation_euler.x = math.pi / 2

    constellation = (
        (-0.14, 0.95, 0.050), (0.30, 0.70, 0.036), (0.72, 0.88, 0.044),
        (1.10, 0.38, 0.032), (0.72, -0.05, 0.036), (1.20, -0.42, 0.030),
        (0.24, -0.58, 0.030),
    )
    for index, (dx, dz, radius) in enumerate(constellation):
        base.sphere(f"WR3_OBS_window_star_{index}", (cx + dx, cy - 0.25, cz + dz),
                    radius, palette["brass"], static, scale=(1.0, 0.25, 1.0))
    for index, (start_index, end_index) in enumerate(((0, 1), (1, 2), (1, 4), (2, 3), (4, 5), (4, 6))):
        start = constellation[start_index]
        end = constellation[end_index]
        cylinder_between(
            f"WR3_OBS_window_constellation_{index}",
            (cx + start[0], cy - 0.225, cz + start[1]),
            (cx + end[0], cy - 0.225, cz + end[1]),
            0.010, palette["brass_dark"], static, vertices=12,
        )

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

    # Aim the door/fire at the tactical centre rather than merely canting the
    # flame silhouette: from the stove this is a visible ~56-degree turn.
    face_angle = math.atan2(-x, y)
    face = Vector((math.sin(face_angle), -math.cos(face_angle), 0.0))
    tangent = Vector((math.cos(face_angle), math.sin(face_angle), 0.0))
    door_center = Vector((x, y, 1.58)) + face * 0.86
    door = cylinder_between("WR3_OBS_stove_door", door_center - face * 0.05,
                            door_center + face * 0.05, 0.62,
                            palette["charcoal"], static, vertices=64)
    base.torus("WR3_OBS_stove_door_ring", Vector((x, y, 1.58)) + face * 0.93,
               0.63, 0.055, palette["brass"], static,
               rotation=(math.pi / 2, 0, face_angle))
    fire_center = Vector((x, y, 1.45)) + face * 0.995 + tangent * 0.05
    flame_body = base.sphere("WR3_OBS_stove_flame_body", fire_center,
                             0.27, palette["fire"], static, scale=(1.48, 0.22, 0.48))
    flame_body.rotation_euler = (0, math.radians(9), face_angle)
    flame_body["war_room_runtime_dynamic"] = "v3-fire"
    for index, (dx, dz, sx, sz, tilt) in enumerate((
        (-0.12, 0.02, 0.48, 1.02, 0.05),
        (0.08, 0.13, 0.42, 1.22, 0.20),
        (0.30, -0.01, 0.36, 0.82, 0.34),
    )):
        tongue_center = Vector((x, y, 1.52 + dz)) + face * 1.01 + tangent * dx
        tongue = base.sphere(f"WR3_OBS_stove_flame_{index}",
                             tongue_center,
                             0.22, palette["fire"] if index != 1 else palette["fire_core"],
                             static, scale=(sx, 0.20, sz))
        tongue.rotation_euler = (0, tilt, face_angle)
        tongue["war_room_runtime_dynamic"] = "v3-fire"
    base.cylinder("WR3_OBS_stove_flue", (x, y, 4.33), 0.23, 3.62,
                  palette["iron"], static, vertices=48)
    base.torus("WR3_OBS_stove_flue_collar", (x, y, 2.63), 0.31, 0.048,
               palette["brass_dark"], static)
    base.cylinder("WR3_OBS_stove_flue_cap", (x, y, 6.18), 0.39, 0.10,
                  palette["copper"], static, vertices=48)
    base.light("WR3_LIGHT_stove", "POINT", Vector((x, y, 1.72)) + face * 1.25, 245.0,
               (1.0, 0.25, 0.035), static, radius=1.45)
    base.anchor("WR_ANCHOR_fireplace_practical", Vector((x, y, 1.76)) + face * 1.05, static)


def build_observatory_telescope(static, palette):
    """A single legible instrument replaces the former desk-and-scroll clutter."""
    hub = Vector((4.82, 4.26, 1.48))
    base.sphere("WR3_OBS_telescope_mount", hub, 0.28, palette["brass_dark"], static,
                scale=(1.12, 1.12, 0.92))
    base.cylinder("WR3_OBS_telescope_mount_ring", hub, 0.43, 0.10,
                  palette["copper"], static, vertices=48)

    tripod_feet = ((3.96, 3.42, 0.16), (5.83, 3.52, 0.16), (5.02, 5.12, 0.16))
    for index, foot in enumerate(tripod_feet):
        cylinder_between(f"WR3_OBS_telescope_tripod_{index}", hub, foot, 0.085,
                         palette["brass_dark"], static, vertices=28)
        base.cylinder(f"WR3_OBS_telescope_foot_{index}", foot, 0.19, 0.075,
                      palette["walnut_dark"], static, vertices=36)

    axis_start = Vector((4.02, 3.92, 2.18))
    axis_end = Vector((5.78, 5.18, 3.36))
    axis = (axis_end - axis_start).normalized()
    cylinder_between("WR3_OBS_telescope_tube", axis_start, axis_end, 0.245,
                     palette["brass"], static, vertices=56)
    cylinder_between("WR3_OBS_telescope_patina", axis_start + axis * 0.40,
                     axis_end - axis * 0.43, 0.262, palette["teal"], static, vertices=56)
    cylinder_between("WR3_OBS_telescope_front_collar", axis_end - axis * 0.18,
                     axis_end + axis * 0.08, 0.315, palette["copper"], static, vertices=56)
    cylinder_between("WR3_OBS_telescope_lens", axis_end + axis * 0.081,
                     axis_end + axis * 0.105, 0.255, palette["night"], static, vertices=56)
    cylinder_between("WR3_OBS_telescope_eyepiece", axis_start - axis * 0.34,
                     axis_start + axis * 0.02, 0.115, palette["brass_dark"], static, vertices=40)
    cylinder_between("WR3_OBS_telescope_focus_ring", axis_start - axis * 0.05,
                     axis_start + axis * 0.08, 0.285, palette["copper"], static, vertices=48)

    yoke_left = hub + Vector((-0.44, 0.0, 0.35))
    yoke_right = hub + Vector((0.44, 0.0, 0.35))
    cylinder_between("WR3_OBS_telescope_yoke", yoke_left, yoke_right, 0.10,
                     palette["brass"], static, vertices=32)
    for side, point in (("left", yoke_left), ("right", yoke_right)):
        base.sphere(f"WR3_OBS_telescope_yoke_cap_{side}", point, 0.16,
                    palette["copper"], static)


def build_tower_entry(static, palette):
    """A sealed observatory door makes the room read as an inhabitable place."""
    theta = math.radians(68)
    radial = Vector((math.sin(theta), math.cos(theta), 0.0))
    tangent = Vector((math.cos(theta), -math.sin(theta), 0.0))
    wall = Vector((8.72 * radial.x, -0.72 + 8.72 * radial.y, 0.0))
    center = wall - radial * 0.27
    angle = math.atan2(tangent.y, tangent.x)

    door = base.cube("WR3_OBS_entry_door", (center.x, center.y, 2.16),
                     (0.88, 0.11, 1.88), palette["teal"], static, bevel=0.14)
    door.rotation_euler.z = angle
    inset = base.cube("WR3_OBS_entry_door_inset", (center.x - radial.x * 0.12,
                                                    center.y - radial.y * 0.12, 2.16),
                      (0.68, 0.035, 1.62), palette["walnut_dark"], static, bevel=0.12)
    inset.rotation_euler.z = angle

    for side in (-1, 1):
        point = center + tangent * (side * 1.02)
        jamb = base.cube(f"WR3_OBS_entry_jamb_{side}", (point.x, point.y, 2.16),
                         (0.105, 0.20, 2.03), palette["copper"], static, bevel=0.055)
        jamb.rotation_euler.z = angle
    for name, z in (("lintel", 4.18), ("threshold", 0.14)):
        rail = base.cube(f"WR3_OBS_entry_{name}", (center.x, center.y, z),
                         (1.12, 0.20, 0.11), palette["copper"], static, bevel=0.055)
        rail.rotation_euler.z = angle

    front = Vector((center.x, center.y, 2.16)) - radial * 0.17
    glass_start = front - radial * 0.035 + Vector((0, 0, 0.78))
    glass_end = front + radial * 0.035 + Vector((0, 0, 0.78))
    cylinder_between("WR3_OBS_entry_porthole", glass_start, glass_end, 0.34,
                     palette["night"], static, vertices=56)
    ring = base.torus("WR3_OBS_entry_porthole_ring", glass_start, 0.39, 0.055,
                      palette["brass"], static)
    ring.rotation_euler = radial.to_track_quat("Z", "Y").to_euler()

    handle_center = front - tangent * 0.48 + Vector((0, 0, -0.30))
    base.sphere("WR3_OBS_entry_handle_hub", handle_center, 0.105,
                palette["brass_dark"], static)
    cylinder_between("WR3_OBS_entry_handle", handle_center,
                     handle_center + tangent * 0.34, 0.045,
                     palette["brass"], static, vertices=28)
    for side in (-1, 1):
        fastener = front + tangent * (side * 0.63) + Vector((0, 0, -1.38))
        base.sphere(f"WR3_OBS_entry_fastener_{side}", fastener, 0.050,
                    palette["brass"], static, scale=(1.0, 0.34, 1.0))


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
    scene["war_room_visual_canon"] = "celestial-observatory-2026-09-23-v3"
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
    build_observatory_telescope(static, palette)
    build_tower_entry(static, palette)
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
        "WR3_OBS_window_crescent",
        "WR3_OBS_window_orbit_0",
        "WR3_OBS_stove_body",
        "WR3_OBS_stove_flame_body",
        "WR3_OBS_telescope_tube",
        "WR3_OBS_entry_door",
        "WR3_OBS_armillary_ring_0",
    }
    missing = sorted(required - names)
    if missing:
        raise RuntimeError(f"War Room v3 contract objects missing: {missing}")
    forbidden_prefixes = (
        "WR_ARCH_", "WR_TABLE_", "WR_FIREPLACE_", "WR_DESK_", "WR_CREST_",
        "WR_WINDOW_", "WR_CANON_", "WR3_OBS_drafting_", "WR3_OBS_map_",
        "WR_ANCHOR_right_fireplace_practical", "WR3_OBS_window_spoke_",
        "WR3_OBS_window_moon", "WR3_OBS_aurora_",
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
        "WR3_OBS_stove_flame_body",
        "WR3_OBS_stove_flame_0",
        "WR3_OBS_stove_flame_1",
        "WR3_OBS_stove_flame_2",
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
