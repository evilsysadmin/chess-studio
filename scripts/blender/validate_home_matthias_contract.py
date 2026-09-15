#!/usr/bin/env python3
"""Fail CI when Home Matthias drifts away from the approved pawn-first canon."""
import math
import os
import sys

import bpy
from mathutils import Vector

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from home_matthias_contract import (  # noqa: E402
    BODY_HEIGHT_TO_BASE_WIDTH,
    BRASS_MIN_METALLIC,
    CANONICAL_IDENTITY,
    CANONICAL_REFERENCE,
    CAP_TOP_MIN_REAR_OFFSET,
    CAP_TOP_MIN_VERTICAL_SEPARATION,
    CAP_TOP_TO_CROWN_WIDTH,
    CAP_TO_HEAD_WIDTH,
    DARK_BODY_MAX_LUMA,
    FORBIDDEN_NAME_TOKENS,
    HEAD_TO_BASE_WIDTH,
    HEAD_TO_BODY_HEIGHT,
    IVORY_HEAD_MIN_LUMA,
    MAX_BROW_TILT_DEGREES,
    MIN_BROW_TILT_DEGREES,
    REQUIRED_ACTIONS,
    REQUIRED_OBJECTS,
    REST_ARM_MIN_Y,
)


def assert_range(label, value, allowed):
    lo, hi = allowed
    assert lo <= value <= hi, f"{label}: {value:.3f} not in [{lo:.3f}, {hi:.3f}]"


def material_bsdf(obj):
    assert obj.data.materials, f"{obj.name}: missing material"
    material = obj.data.materials[0]
    assert material.use_nodes, f"{obj.name}: material must use nodes"
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    assert bsdf is not None, f"{obj.name}: missing Principled BSDF"
    return bsdf


def base_luma(obj):
    color = material_bsdf(obj).inputs["Base Color"].default_value
    return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2]


def metallic(obj):
    return float(material_bsdf(obj).inputs["Metallic"].default_value)


def world_z_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    zs = [corner.z for corner in corners]
    return min(zs), max(zs)


def ring_radius_ratio(obj):
    levels = {}
    for vertex in obj.data.vertices:
        z = round(vertex.co.z, 4)
        radius = math.hypot(vertex.co.x, vertex.co.y)
        if radius > 1e-5:
            levels[z] = max(levels.get(z, 0.0), radius)
    ordered = sorted(levels.items())
    assert len(ordered) >= 4, f"{obj.name}: pawn profile has too few rings"
    bottom_radius = ordered[0][1]
    top_radius = ordered[-1][1]
    assert top_radius > 0
    return bottom_radius / top_radius


def main():
    scene = bpy.context.scene
    rig = bpy.data.objects.get("MatthiasRig")
    assert rig is not None, "missing MatthiasRig"

    actions = {action.name for action in bpy.data.actions}
    missing_actions = REQUIRED_ACTIONS - actions
    assert not missing_actions, f"missing actions: {sorted(missing_actions)}"

    assert rig.get("canonical_identity") == CANONICAL_IDENTITY, rig.get("canonical_identity")
    assert rig.get("canonical_reference") == CANONICAL_REFERENCE, rig.get("canonical_reference")

    objects = {obj.name: obj for obj in bpy.data.objects}
    missing_objects = REQUIRED_OBJECTS - set(objects)
    assert not missing_objects, f"missing objects: {sorted(missing_objects)}"

    lowered_names = {name.lower() for name in objects}
    offenders = sorted(
        name for name in lowered_names
        if any(token in name for token in FORBIDDEN_NAME_TOKENS)
    )
    assert not offenders, f"forbidden Matthias anatomy/decor returned: {offenders}"

    if rig.animation_data is None:
        rig.animation_data_create()
    rig.animation_data.action = bpy.data.actions["Idle"]
    scene.frame_set(1)
    bpy.context.view_layer.update()

    head = objects["Head"]
    base = objects["Classic plinth lower"]
    cap = objects["Classic cap crown"]
    cap_top_obj = objects["Classic cap top"]
    body = objects["Classic lower pawn"]
    tunic = objects["Classic navy tunic"]

    head_width = head.dimensions.x
    base_width = base.dimensions.x
    head_height = head.dimensions.z
    cap_width = cap.dimensions.x
    body_bottom, _ = world_z_bounds(base)
    _, cap_top_z = world_z_bounds(cap_top_obj)
    total_height = cap_top_z - body_bottom

    assert_range("head/base width", head_width / base_width, HEAD_TO_BASE_WIDTH)
    assert_range("head/total height", head_height / total_height, HEAD_TO_BODY_HEIGHT)
    assert_range("cap/head width", cap_width / head_width, CAP_TO_HEAD_WIDTH)
    assert_range("total height/base width", total_height / base_width, BODY_HEIGHT_TO_BASE_WIDTH)

    # The peaked cap must have a wider rear-biased top mass above the crown.
    assert_range(
        "cap top/crown width",
        cap_top_obj.dimensions.x / cap.dimensions.x,
        CAP_TOP_TO_CROWN_WIDTH,
    )
    assert cap_top_obj.location.y - cap.location.y >= CAP_TOP_MIN_REAR_OFFSET, (
        cap.location.y,
        cap_top_obj.location.y,
    )
    assert cap_top_obj.location.z - cap.location.z >= CAP_TOP_MIN_VERTICAL_SEPARATION, (
        cap.location.z,
        cap_top_obj.location.z,
    )

    flare = ring_radius_ratio(body)
    assert flare >= 1.35, f"pawn body insufficiently flared: {flare:.3f}"

    assert base_luma(body) <= DARK_BODY_MAX_LUMA, base_luma(body)
    assert base_luma(tunic) <= DARK_BODY_MAX_LUMA, base_luma(tunic)
    assert base_luma(head) >= IVORY_HEAD_MIN_LUMA, base_luma(head)
    assert metallic(objects["Classic plinth brass edge"]) >= BRASS_MIN_METALLIC

    light_body_offenders = []
    for obj in bpy.data.objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        if obj.name.startswith("Routine") or obj.name.startswith("Hand."):
            continue
        z0, z1 = world_z_bounds(obj)
        if z1 >= 1.45 or obj.dimensions.x <= 0.18:
            continue
        if base_luma(obj) > 0.35:
            light_body_offenders.append(obj.name)
    assert not light_body_offenders, f"large light body panels/skirts forbidden: {light_body_offenders}"

    for name in ("Upper arm.L", "Upper arm.R", "Forearm.L", "Forearm.R", "Hand.L", "Hand.R"):
        obj = objects[name]
        assert obj.matrix_world.translation.y >= REST_ARM_MIN_Y, (
            f"{name}: visible in Idle at y={obj.matrix_world.translation.y:.3f}"
        )

    left_brow = math.degrees(objects["Brow.L"].rotation_euler.y)
    right_brow = math.degrees(objects["Brow.R"].rotation_euler.y)
    assert MIN_BROW_TILT_DEGREES <= abs(left_brow) <= MAX_BROW_TILT_DEGREES, left_brow
    assert MIN_BROW_TILT_DEGREES <= abs(right_brow) <= MAX_BROW_TILT_DEGREES, right_brow
    assert left_brow * right_brow < 0, (left_brow, right_brow)

    left_mouth = math.degrees(objects["Mouth.L"].rotation_euler.y)
    right_mouth = math.degrees(objects["Mouth.R"].rotation_euler.y)
    assert left_mouth < -4 and right_mouth > 4, (left_mouth, right_mouth)

    for name in ("Eye.L", "Eye.R"):
        ratio = objects[name].dimensions.x / head_width
        assert ratio <= 0.10, f"{name}: oversized eye ratio {ratio:.3f}"
        verticality = objects[name].dimensions.z / max(objects[name].dimensions.x, 1e-6)
        assert verticality >= 1.15, f"{name}: eye must remain stern/vertical, got {verticality:.3f}"

    print(
        "Home Matthias HARD canonical contract OK | "
        f"flare={flare:.3f} head/base={head_width/base_width:.3f} "
        f"height/base={total_height/base_width:.3f}"
    )


if __name__ == "__main__":
    main()
