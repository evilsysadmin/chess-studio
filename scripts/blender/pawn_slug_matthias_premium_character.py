"""Premium v3 Matthias combat body and per-frame pose construction.

This source deliberately treats Matthias as an anthropomorphic chess pawn first
and a platform-action soldier second.  The combat silhouette keeps the canonical
ivory pawn head and bell body, then adds articulated limbs, a compact tactical
uniform and physically readable weapon grips.
"""
from __future__ import annotations

import math

import bpy
from mathutils import Vector

from pawn_slug_matthias_premium_common import (
    box,
    cyl,
    cyl_segment,
    finish,
    parent_keep_world,
    pose,
    root,
    sphere,
    xz,
)
from pawn_slug_matthias_premium_weapons import add_weapon


def lathed_shell(name, origin, center_x, profile, mat, parent, *, depth_scale=0.72, segments=64):
    """Create a smooth authored shell from an explicit screen-plane profile."""
    vertices = []
    faces = []
    for z, radius in profile:
        for index in range(segments):
            angle = math.tau * index / segments
            vertices.append(
                (
                    origin[0] + center_x + math.cos(angle) * radius,
                    math.sin(angle) * radius * depth_scale,
                    origin[2] + z,
                )
            )

    for ring in range(len(profile) - 1):
        start = ring * segments
        next_start = (ring + 1) * segments
        for index in range(segments):
            nxt = (index + 1) % segments
            faces.append((start + index, start + nxt, next_start + nxt, next_start + index))

    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, mat, smooth=True, bevel_width=0.010)
    return parent_keep_world(obj, parent)


def tapered_segment(name, origin, a, b, radius_a, radius_b, mat, parent, *, y=-0.08, verts=32):
    """Tapered organic limb segment between two screen-plane joints."""
    start = Vector(xz(origin, a[0], a[1], y))
    end = Vector(xz(origin, b[0], b[1], y))
    direction = end - start
    length = max(0.02, direction.length)
    midpoint = (start + end) * 0.5
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=radius_a,
        radius2=radius_b,
        depth=length,
        location=midpoint,
    )
    obj = bpy.context.object
    obj.name = name
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = direction.to_track_quat("Z", "Y")
    obj.rotation_mode = "XYZ"
    finish(obj, mat, smooth=True, bevel_width=min(0.014, min(radius_a, radius_b) * 0.22))
    return parent_keep_world(obj, parent)


def prism_xz(name, origin, polygon, depth, mat, parent, *, y=0.0, bevel=0.018):
    """Extrude an authored X/Z polygon through depth for boots and armour plates."""
    half = depth * 0.5
    vertices = []
    for py in (-half, half):
        vertices.extend((origin[0] + x, y + py, origin[2] + z) for x, z in polygon)
    count = len(polygon)
    faces = [tuple(range(count)), tuple(range(count, count * 2))[::-1]]
    for i in range(count):
        nxt = (i + 1) % count
        faces.append((i, nxt, count + nxt, count + i))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, mat, smooth=False, bevel_width=bevel)
    return parent_keep_world(obj, parent)


def finger_cluster(prefix, origin, grip_x, grip_z, mat, parent, *, front=False):
    """Chunky fingers that visibly wrap the grip at sprite resolution."""
    y = -0.555 if front else -0.535
    direction = -1 if front else 1
    for idx, dz in enumerate((-0.035, 0.0, 0.035)):
        cyl_segment(
            f"{prefix}_finger_{idx}",
            origin,
            (grip_x - 0.035 * direction, grip_z + dz),
            (grip_x + 0.055 * direction, grip_z + dz - 0.008),
            0.022,
            mat,
            parent,
            y=y,
            verts=18,
        )


def build_frame(origin, action, frame, count, weapon, m):
    p = pose(action, frame, count)
    base = root(f"matthias_premium_v3_{weapon}_{action}_{frame:02d}", origin)
    base["canonical_identity"] = "stern-no-moustache-pawn"
    base["matthias_asset_version"] = "pawn-slug-blender-pawn-v3"

    crouch = p["crouch"]
    body_z = p["bob"] - crouch
    lean_dx = p["lean"] * 0.72

    # Legs: deliberately tapered and offset so idle already reads as a stance,
    # not as two drainpipes under a toy torso.
    hip_z = 0.78 + body_z
    leg_data = (
        ("rear", 0.18, p["step"] + 0.05, p["lift_a"], 0.075),
        ("front", -0.10, -p["step"] - 0.04, p["lift_b"], -0.090),
    )
    for side, hip_x, swing, lift, depth in leg_data:
        knee_x = hip_x + swing * 0.23
        knee_z = 0.49 + lift * 0.54 + body_z * 0.14
        foot_x = hip_x + swing * 0.47
        foot_z = 0.10 + lift + p["jump"] * 0.05
        tapered_segment(
            f"{side}_thigh",
            origin,
            (hip_x, hip_z),
            (knee_x, knee_z),
            0.115,
            0.095,
            m["navy"],
            base,
            y=depth,
        )
        sphere(f"{side}_knee", xz(origin, knee_x, knee_z, depth - 0.015), (0.19, 0.17, 0.17), m["armor"], base, seg=28)
        tapered_segment(
            f"{side}_shin",
            origin,
            (knee_x, knee_z),
            (foot_x, foot_z + 0.13),
            0.092,
            0.070,
            m["cloth"],
            base,
            y=depth - 0.018,
        )
        boot_poly = (
            (foot_x - 0.19, foot_z - 0.075),
            (foot_x + 0.14, foot_z - 0.075),
            (foot_x + 0.16, foot_z + 0.075),
            (foot_x + 0.02, foot_z + 0.14),
            (foot_x - 0.16, foot_z + 0.11),
        )
        prism_xz(f"{side}_boot", origin, boot_poly, 0.26, m["leather"], base, y=depth - 0.035, bevel=0.025)
        box(f"{side}_sole", xz(origin, foot_x - 0.02, foot_z - 0.078, depth - 0.05), (0.39, 0.27, 0.040), m["dark"], parent=base, bevel=0.010)

    # Bell body: stronger pawn base, narrower waist, compact shoulder line.
    shell_profile = (
        (0.71 + body_z, 0.22),
        (0.78 + body_z, 0.34),
        (0.90 + body_z, 0.42),
        (1.05 + body_z, 0.39),
        (1.22 + body_z, 0.34),
        (1.39 + body_z, 0.30),
        (1.53 + body_z, 0.255),
        (1.60 + body_z, 0.235),
    )
    lathed_shell("pawn_uniform_shell", origin, 0.13 + lean_dx, shell_profile, m["navy"], base, depth_scale=0.68)
    cyl("lower_brass_ring", xz(origin, 0.13 + lean_dx, 0.88 + body_z, 0.0), 0.385, 0.032, m["brass"], parent=base, verts=64, bevel=0.007)
    cyl("neck_ivory", xz(origin, 0.13 + lean_dx, 1.59 + body_z, -0.01), 0.238, 0.080, m["skin_hi"], parent=base, verts=64, bevel=0.014)
    cyl("high_collar", xz(origin, 0.13 + lean_dx, 1.615 + body_z, -0.01), 0.252, 0.125, m["cloth"], parent=base, verts=64, bevel=0.010)
    cyl("collar_brass", xz(origin, 0.13 + lean_dx, 1.675 + body_z, -0.01), 0.258, 0.020, m["brass"], parent=base, verts=64, bevel=0.005)

    # Large authored shapes, not tiny decorations that disappear after baking.
    prism_xz(
        "vest_plate",
        origin,
        ((-0.17 + lean_dx, 1.11 + body_z), (0.18 + lean_dx, 1.12 + body_z), (0.20 + lean_dx, 1.43 + body_z), (-0.13 + lean_dx, 1.45 + body_z)),
        0.075,
        m["armor"],
        base,
        y=-0.31,
        bevel=0.025,
    )
    box("chest_strap", xz(origin, 0.16 + lean_dx, 1.28 + body_z, -0.355), (0.055, 0.035, 0.52), m["leather"], rot=(0, -0.22, -0.10), parent=base, bevel=0.008)
    box("campaign_ribbon", xz(origin, -0.055 + lean_dx, 1.37 + body_z, -0.365), (0.14, 0.018, 0.052), m["red"], parent=base, bevel=0.006)
    box("service_ribbon", xz(origin, 0.095 + lean_dx, 1.37 + body_z, -0.365), (0.11, 0.018, 0.052), m["brass"], parent=base, bevel=0.006)

    # Shoulder armour is faceted and follows the body instead of reading as balls.
    prism_xz(
        "pauldron_front",
        origin,
        ((-0.22 + lean_dx, 1.43 + body_z), (0.04 + lean_dx, 1.48 + body_z), (0.01 + lean_dx, 1.59 + body_z), (-0.27 + lean_dx, 1.56 + body_z)),
        0.20,
        m["brass"],
        base,
        y=-0.11,
        bevel=0.018,
    )
    prism_xz(
        "pauldron_rear",
        origin,
        ((0.24 + lean_dx, 1.45 + body_z), (0.48 + lean_dx, 1.48 + body_z), (0.45 + lean_dx, 1.58 + body_z), (0.21 + lean_dx, 1.57 + body_z)),
        0.18,
        m["brass"],
        base,
        y=0.045,
        bevel=0.016,
    )

    # Pawn head: shaped shell instead of a featureless egg.  The lower radius
    # tucks into the collar; the brow band broadens the face where expression lives.
    head_x = 0.13 + lean_dx
    head_z = body_z
    head_profile = (
        (1.69 + head_z, 0.205),
        (1.76 + head_z, 0.285),
        (1.89 + head_z, 0.335),
        (2.04 + head_z, 0.345),
        (2.15 + head_z, 0.315),
        (2.23 + head_z, 0.245),
        (2.27 + head_z, 0.155),
    )
    lathed_shell("pawn_head", origin, head_x, head_profile, m["skin"], base, depth_scale=0.82, segments=72)

    # Subtle face planes and lids stop the face reading as two stickers on a ball.
    sphere("brow_plane", xz(origin, head_x - 0.015, 2.055 + head_z, -0.310), (0.49, 0.055, 0.16), m["skin_hi"], base, seg=40)
    sphere("nose", xz(origin, head_x - 0.10, 1.955 + head_z, -0.402), (0.075, 0.060, 0.095), m["skin_hi"], base, seg=30)

    eye_specs = (
        ("front", head_x - 0.145, -0.387, 0.42),
        ("rear", head_x + 0.075, -0.362, -0.34),
    )
    for name, eye_x, eye_y, brow_angle in eye_specs:
        sphere(f"eye_{name}", xz(origin, eye_x, 2.055 + head_z, eye_y), (0.098, 0.040, 0.058), m["white"], base, seg=30)
        sphere(f"iris_{name}", xz(origin, eye_x - 0.012, 2.049 + head_z, eye_y - 0.026), (0.039, 0.017, 0.038), m["iris"], base, seg=22)
        sphere(f"pupil_{name}", xz(origin, eye_x - 0.020, 2.048 + head_z, eye_y - 0.036), (0.015, 0.008, 0.017), m["black"], base, seg=18)
        box(
            f"upper_lid_{name}",
            xz(origin, eye_x, 2.084 + head_z, eye_y - 0.035),
            (0.120 if name == "front" else 0.105, 0.020, 0.030),
            m["skin"],
            rot=(0, brow_angle * 0.45, 0),
            parent=base,
            bevel=0.007,
        )
        box(
            f"brow_{name}",
            xz(origin, eye_x, 2.112 + head_z, eye_y - 0.045),
            (0.145 if name == "front" else 0.125, 0.024, 0.036),
            m["black"],
            rot=(0, brow_angle, 0),
            parent=base,
            bevel=0.007,
        )

    # A short frown and lower-lip plane are readable without making him human.
    box("stern_mouth", xz(origin, head_x - 0.075, 1.865 + head_z, -0.415), (0.130, 0.013, 0.016), m["black"], rot=(0, 0.0, 0), parent=base, bevel=0.004)
    box("lower_lip_plane", xz(origin, head_x - 0.073, 1.845 + head_z, -0.401), (0.13, 0.025, 0.020), m["skin_hi"], parent=base, bevel=0.006)

    # Cap: flatter and slightly smaller so it frames the pawn rather than replacing it.
    sphere("cap_crown", xz(origin, head_x + 0.02, 2.29 + head_z, -0.055), (0.49, 0.43, 0.15), m["navy"], base, seg=48)
    cyl("cap_band", xz(origin, head_x + 0.01, 2.245 + head_z, -0.055), 0.235, 0.067, m["cloth"], parent=base, verts=56, bevel=0.010)
    box("cap_visor", xz(origin, head_x - 0.14, 2.215 + head_z, -0.325), (0.31, 0.17, 0.042), m["leather"], rot=(0.10, 0, 0), parent=base, bevel=0.016)
    sphere("pawn_badge_head", xz(origin, head_x - 0.025, 2.268 + head_z, -0.292), (0.067, 0.030, 0.067), m["brass"], base, seg=22)
    box("pawn_badge_base", xz(origin, head_x - 0.025, 2.220 + head_z, -0.292), (0.115, 0.028, 0.034), m["brass"], parent=base, bevel=0.005)

    # Drop the gun slightly so the face and chest remain readable at gameplay scale.
    weapon_z = 1.34 + body_z - crouch * 0.020
    rear_grip_x, support_x = add_weapon(weapon, origin, base, m, weapon_z)

    # Tapered arms create shoulder/elbow/wrist hierarchy instead of four tubes.
    shoulder_rear = (0.38 + lean_dx, 1.52 + body_z)
    elbow_rear = (0.12 + lean_dx, 1.39 + body_z)
    shoulder_front = (-0.07 + lean_dx, 1.48 + body_z)
    elbow_front = (-0.28 + lean_dx, 1.29 + body_z)
    tapered_segment("rear_upper_arm", origin, shoulder_rear, elbow_rear, 0.115, 0.090, m["navy"], base, y=-0.16)
    tapered_segment("rear_forearm", origin, elbow_rear, (rear_grip_x, weapon_z - 0.025), 0.095, 0.072, m["cloth"], base, y=-0.315)
    tapered_segment("front_upper_arm", origin, shoulder_front, elbow_front, 0.115, 0.088, m["navy"], base, y=-0.20)
    tapered_segment("front_forearm", origin, elbow_front, (support_x, weapon_z - 0.020), 0.094, 0.070, m["cloth"], base, y=-0.36)

    # Hands sit in front of the weapon and show a palm + fingers wrapping the grips.
    sphere("rear_hand", xz(origin, rear_grip_x, weapon_z - 0.025, -0.545), (0.145, 0.095, 0.140), m["skin"], base, seg=28)
    sphere("front_hand", xz(origin, support_x, weapon_z - 0.020, -0.565), (0.145, 0.095, 0.140), m["skin"], base, seg=28)
    finger_cluster("rear", origin, rear_grip_x, weapon_z - 0.025, m["skin_hi"], base, front=False)
    finger_cluster("front", origin, support_x, weapon_z - 0.020, m["skin_hi"], base, front=True)
    sphere("rear_cuff", xz(origin, rear_grip_x + 0.065, weapon_z - 0.025, -0.405), (0.16, 0.12, 0.145), m["brass"], base, seg=24)
    sphere("front_cuff", xz(origin, support_x + 0.055, weapon_z - 0.020, -0.425), (0.16, 0.12, 0.145), m["brass"], base, seg=24)

    return base
