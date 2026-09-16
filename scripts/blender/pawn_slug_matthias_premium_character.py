"""Premium Matthias combat body and per-frame pose construction.

This source keeps Matthias unmistakably a chess pawn first and a platform-action
soldier second.  The silhouette is deliberately chunky and readable at 96 px:
shorter legs, a wider pawn bell, a small neck ring and a simplified stern face.
Fine facial anatomy and finger detail are intentionally avoided because they turn
into noisy, human-looking blobs after sprite downsampling.
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


def build_frame(origin, action, frame, count, weapon, m):
    p = pose(action, frame, count)
    base = root(f"matthias_premium_v4_{weapon}_{action}_{frame:02d}", origin)
    base["canonical_identity"] = "stern-no-moustache-pawn"
    base["matthias_asset_version"] = "pawn-slug-blender-pawn-v4"

    crouch = p["crouch"]
    body_z = p["bob"] - crouch
    lean_dx = p["lean"] * 0.58

    # Compact legs keep locomotion readable without turning the pawn into a
    # human body in a long coat.  The legs emerge from the pawn base and never
    # dominate the silhouette.
    hip_z = 0.68 + body_z
    leg_data = (
        ("rear", 0.15, p["step"] + 0.04, p["lift_a"], 0.070),
        ("front", -0.09, -p["step"] - 0.03, p["lift_b"], -0.075),
    )
    for side, hip_x, swing, lift, depth in leg_data:
        knee_x = hip_x + swing * 0.19
        knee_z = 0.43 + lift * 0.46 + body_z * 0.12
        foot_x = hip_x + swing * 0.38
        foot_z = 0.10 + lift + p["jump"] * 0.05
        tapered_segment(
            f"{side}_thigh",
            origin,
            (hip_x, hip_z),
            (knee_x, knee_z),
            0.100,
            0.082,
            m["navy"],
            base,
            y=depth,
        )
        sphere(f"{side}_knee", xz(origin, knee_x, knee_z, depth - 0.012), (0.145, 0.135, 0.135), m["armor"], base, seg=24)
        tapered_segment(
            f"{side}_shin",
            origin,
            (knee_x, knee_z),
            (foot_x, foot_z + 0.11),
            0.082,
            0.062,
            m["cloth"],
            base,
            y=depth - 0.016,
        )
        boot_poly = (
            (foot_x - 0.145, foot_z - 0.060),
            (foot_x + 0.115, foot_z - 0.060),
            (foot_x + 0.135, foot_z + 0.060),
            (foot_x + 0.010, foot_z + 0.115),
            (foot_x - 0.135, foot_z + 0.095),
        )
        prism_xz(f"{side}_boot", origin, boot_poly, 0.22, m["leather"], base, y=depth - 0.030, bevel=0.020)
        box(f"{side}_sole", xz(origin, foot_x - 0.01, foot_z - 0.062, depth - 0.045), (0.30, 0.23, 0.032), m["dark"], parent=base, bevel=0.008)

    # Strong pawn silhouette: broad lower bell, visible waist and a narrow neck.
    # This is the shape that must survive the 96px gameplay proof.
    shell_profile = (
        (0.62 + body_z, 0.235),
        (0.67 + body_z, 0.355),
        (0.75 + body_z, 0.445),
        (0.88 + body_z, 0.430),
        (1.02 + body_z, 0.365),
        (1.18 + body_z, 0.305),
        (1.34 + body_z, 0.255),
        (1.44 + body_z, 0.215),
    )
    body_x = 0.10 + lean_dx
    lathed_shell("pawn_uniform_shell", origin, body_x, shell_profile, m["navy"], base, depth_scale=0.70)
    cyl("pawn_base_brass", xz(origin, body_x, 0.73 + body_z, 0.0), 0.420, 0.035, m["brass"], parent=base, verts=64, bevel=0.007)
    cyl("pawn_waist_band", xz(origin, body_x, 1.36 + body_z, -0.005), 0.240, 0.030, m["brass"], parent=base, verts=56, bevel=0.006)

    # Canonical Home Matthias uses a dark neck plinth with a brass edge beneath
    # the ivory head.  Preserve that hierarchy here: it reads as a chess pawn
    # without the oversized white "tyre" that the previous combat render grew.
    cyl("neck_stem", xz(origin, body_x, 1.475 + body_z, -0.01), 0.145, 0.095, m["skin_hi"], parent=base, verts=56, bevel=0.012)
    cyl("neck_plinth", xz(origin, body_x, 1.515 + body_z, 0.0), 0.235, 0.070, m["navy"], parent=base, verts=64, bevel=0.012)
    cyl("collar_brass", xz(origin, body_x, 1.555 + body_z, -0.010), 0.242, 0.020, m["brass"], parent=base, verts=64, bevel=0.004)

    # Large readable uniform accents only; tiny decorations are visual noise after
    # downsampling and make the torso look busier and more human.
    prism_xz(
        "vest_plate",
        origin,
        ((-0.15 + lean_dx, 1.02 + body_z), (0.16 + lean_dx, 1.03 + body_z), (0.17 + lean_dx, 1.30 + body_z), (-0.12 + lean_dx, 1.31 + body_z)),
        0.065,
        m["armor"],
        base,
        y=-0.30,
        bevel=0.020,
    )
    box("chest_strap", xz(origin, 0.13 + lean_dx, 1.17 + body_z, -0.345), (0.050, 0.030, 0.42), m["leather"], rot=(0, -0.19, -0.08), parent=base, bevel=0.007)
    box("service_ribbon", xz(origin, -0.035 + lean_dx, 1.25 + body_z, -0.355), (0.13, 0.016, 0.045), m["brass"], parent=base, bevel=0.005)

    # Small shoulder caps frame the pawn instead of creating human shoulders.
    prism_xz(
        "pauldron_front",
        origin,
        ((-0.19 + lean_dx, 1.31 + body_z), (0.015 + lean_dx, 1.34 + body_z), (-0.005 + lean_dx, 1.43 + body_z), (-0.22 + lean_dx, 1.41 + body_z)),
        0.16,
        m["brass"],
        base,
        y=-0.10,
        bevel=0.015,
    )
    prism_xz(
        "pauldron_rear",
        origin,
        ((0.20 + lean_dx, 1.32 + body_z), (0.39 + lean_dx, 1.34 + body_z), (0.37 + lean_dx, 1.42 + body_z), (0.18 + lean_dx, 1.41 + body_z)),
        0.15,
        m["brass"],
        base,
        y=0.035,
        bevel=0.014,
    )

    # Canonical face language from Home Matthias, simplified for a 96px sprite.
    # The chess-pawn head is a true orb rather than a human-shaped egg.  Tiny
    # black eyes, hard brows and the split frown survive downsampling without
    # turning into emoji anatomy.
    head_x = body_x - 0.005
    head_z = body_z
    head_center_z = 1.845 + head_z
    sphere(
        "pawn_head",
        xz(origin, head_x, head_center_z, -0.010),
        (0.620, 0.570, 0.600),
        m["skin"],
        base,
        seg=64,
    )

    eye_specs = (
        ("front", head_x - 0.095, -0.302, 0.50),
        ("rear", head_x + 0.085, -0.292, -0.50),
    )
    for name, eye_x, eye_y, brow_angle in eye_specs:
        sphere(
            f"eye_{name}",
            xz(origin, eye_x, 1.885 + head_z, eye_y),
            (0.044, 0.018, 0.068),
            m["black"],
            base,
            seg=20,
        )
        box(
            f"brow_{name}",
            xz(origin, eye_x, 1.952 + head_z, eye_y - 0.012),
            (0.155, 0.020, 0.038),
            m["black"],
            rot=(0, brow_angle, 0),
            parent=base,
            bevel=0.004,
        )

    # Home Matthias' split downward mouth reads as a stern frown, never a
    # moustache or a human lip.  Keep it intentionally graphic.
    box(
        "mouth_front",
        xz(origin, head_x - 0.044, 1.765 + head_z, -0.303),
        (0.105, 0.016, 0.014),
        m["black"],
        rot=(0, -0.31, 0),
        parent=base,
        bevel=0.002,
    )
    box(
        "mouth_rear",
        xz(origin, head_x + 0.044, 1.765 + head_z, -0.303),
        (0.105, 0.016, 0.014),
        m["black"],
        rot=(0, 0.31, 0),
        parent=base,
        bevel=0.002,
    )

    # Compact peaked cap with the canonical oxblood/red band.  At sprite scale
    # this colour break is more useful than tiny badge ornament.
    sphere("cap_crown", xz(origin, head_x + 0.012, 2.135 + head_z, -0.025), (0.660, 0.520, 0.170), m["navy"], base, seg=44)
    sphere("cap_top", xz(origin, head_x + 0.025, 2.220 + head_z, -0.010), (0.700, 0.540, 0.200), m["navy"], base, seg=44)
    cyl("cap_band", xz(origin, head_x + 0.004, 2.090 + head_z, -0.030), 0.285, 0.060, m["red"], parent=base, verts=56, bevel=0.008)
    cyl("cap_brass_line", xz(origin, head_x + 0.004, 2.058 + head_z, -0.034), 0.290, 0.014, m["brass"], parent=base, verts=56, bevel=0.003)
    box("cap_visor", xz(origin, head_x - 0.105, 2.070 + head_z, -0.272), (0.330, 0.180, 0.038), m["leather"], rot=(0.08, 0, 0), parent=base, bevel=0.012)
    sphere("pawn_badge_head", xz(origin, head_x - 0.015, 2.120 + head_z, -0.247), (0.040, 0.020, 0.045), m["brass"], base, seg=18)

    # Lower, tighter weapon carriage leaves the face and pawn waist readable.
    weapon_z = 1.18 + body_z - crouch * 0.018
    rear_grip_x, support_x = add_weapon(weapon, origin, base, m, weapon_z)

    shoulder_rear = (0.31 + lean_dx, 1.36 + body_z)
    elbow_rear = (0.10 + lean_dx, 1.24 + body_z)
    shoulder_front = (-0.04 + lean_dx, 1.34 + body_z)
    elbow_front = (-0.20 + lean_dx, 1.18 + body_z)
    tapered_segment("rear_upper_arm", origin, shoulder_rear, elbow_rear, 0.090, 0.070, m["navy"], base, y=-0.15)
    tapered_segment("rear_forearm", origin, elbow_rear, (rear_grip_x, weapon_z - 0.018), 0.074, 0.055, m["cloth"], base, y=-0.305)
    tapered_segment("front_upper_arm", origin, shoulder_front, elbow_front, 0.088, 0.068, m["navy"], base, y=-0.18)
    tapered_segment("front_forearm", origin, elbow_front, (support_x, weapon_z - 0.012), 0.072, 0.053, m["cloth"], base, y=-0.345)

    # Compact hands: one clear palm per grip.  Individual fingers were removed
    # because at runtime they merged into two oversized ivory blobs.
    sphere("rear_hand", xz(origin, rear_grip_x, weapon_z - 0.018, -0.535), (0.095, 0.070, 0.090), m["skin"], base, seg=24)
    sphere("front_hand", xz(origin, support_x, weapon_z - 0.012, -0.550), (0.095, 0.070, 0.090), m["skin"], base, seg=24)
    sphere("rear_cuff", xz(origin, rear_grip_x + 0.050, weapon_z - 0.018, -0.405), (0.115, 0.095, 0.105), m["brass"], base, seg=22)
    sphere("front_cuff", xz(origin, support_x + 0.045, weapon_z - 0.012, -0.420), (0.115, 0.095, 0.105), m["brass"], base, seg=22)

    return base
