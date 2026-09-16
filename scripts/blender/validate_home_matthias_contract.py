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
    CANONICAL_REFERENCE_SHA256,
    CAP_TOP_MIN_REAR_OFFSET,
    CAP_TOP_MIN_VERTICAL_SEPARATION,
    CAP_TOP_TO_CROWN_WIDTH,
    CAP_TO_HEAD_WIDTH,
    CAP_VISOR_TO_HEAD_WIDTH,
    CHEST_CREST_HEIGHT_TO_HEAD_WIDTH,
    CHEST_CREST_WIDTH_TO_HEAD_WIDTH,
    DARK_BODY_MAX_LUMA,
    EYE_TO_HEAD_WIDTH,
    EYE_VERTICALITY,
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


def world_bounds(obj):
    corners = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    xs = [corner.x for corner in corners]
    ys = [corner.y for corner in corners]
    zs = [corner.z for corner in corners]
    return (
        (min(xs), max(xs)),
        (min(ys), max(ys)),
        (min(zs), max(zs)),
    )


def world_z_bounds(obj):
    return world_bounds(obj)[2]


def world_center(obj):
    bounds = world_bounds(obj)
    return Vector(tuple((axis[0] + axis[1]) * .5 for axis in bounds))


def world_width(obj):
    x = world_bounds(obj)[0]
    return x[1] - x[0]


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


def world_y_rotation_degrees(obj):
    return math.degrees(obj.matrix_world.to_euler('XYZ').y)


def main():
    scene = bpy.context.scene
    rig = bpy.data.objects.get("MatthiasRig")
    assert rig is not None, "missing MatthiasRig"

    actions = {action.name for action in bpy.data.actions}
    missing_actions = REQUIRED_ACTIONS - actions
    assert not missing_actions, f"missing actions: {sorted(missing_actions)}"

    assert rig.get("canonical_identity") == CANONICAL_IDENTITY, rig.get("canonical_identity")
    assert rig.get("canonical_reference") == CANONICAL_REFERENCE, rig.get("canonical_reference")
    assert rig.get("canonical_reference_sha256") == CANONICAL_REFERENCE_SHA256, (
        rig.get("canonical_reference_sha256"),
        CANONICAL_REFERENCE_SHA256,
    )

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
    visor = objects["Classic cap visor"]
    crest = objects["Classic chest cross brass"]

    head_width = world_width(head)
    base_width = world_width(base)
    head_height = world_z_bounds(head)[1] - world_z_bounds(head)[0]
    cap_width = world_width(cap)
    body_bottom, _ = world_z_bounds(base)
    _, cap_top_z = world_z_bounds(cap_top_obj)
    total_height = cap_top_z - body_bottom

    assert_range("head/base width", head_width / base_width, HEAD_TO_BASE_WIDTH)
    assert_range("head/total height", head_height / total_height, HEAD_TO_BODY_HEIGHT)
    assert_range("cap/head width", cap_width / head_width, CAP_TO_HEAD_WIDTH)
    assert_range("total height/base width", total_height / base_width, BODY_HEIGHT_TO_BASE_WIDTH)
    assert_range("cap visor/head width", world_width(visor) / head_width, CAP_VISOR_TO_HEAD_WIDTH)

    assert_range(
        "cap top/crown width",
        world_width(cap_top_obj) / cap_width,
        CAP_TOP_TO_CROWN_WIDTH,
    )
    cap_center = world_center(cap)
    cap_top_center = world_center(cap_top_obj)
    assert cap_top_center.y - cap_center.y >= CAP_TOP_MIN_REAR_OFFSET, (
        cap_center.y,
        cap_top_center.y,
    )
    assert cap_top_center.z - cap_center.z >= CAP_TOP_MIN_VERTICAL_SEPARATION, (
        cap_center.z,
        cap_top_center.z,
    )

    assert_range(
        "chest cross height/head width",
        (world_z_bounds(crest)[1] - world_z_bounds(crest)[0]) / head_width,
        CHEST_CREST_HEIGHT_TO_HEAD_WIDTH,
    )
    assert_range(
        "chest cross width/head width",
        world_width(crest) / head_width,
        CHEST_CREST_WIDTH_TO_HEAD_WIDTH,
    )

    flare = ring_radius_ratio(body)
    assert flare >= 1.45, f"pawn body insufficiently flared: {flare:.3f}"

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
        # This guard targets broad ivory/light panels, not legitimate metallic
        # service trim. Use the material contract rather than a brittle list of
        # gold object names so future badges/cords do not become false positives.
        if metallic(obj) >= BRASS_MIN_METALLIC:
            continue
        _, z1 = world_z_bounds(obj)
        if z1 >= 1.35 or world_width(obj) <= 0.18:
            continue
        if base_luma(obj) > 0.35:
            light_body_offenders.append(obj.name)
    assert not light_body_offenders, f"large light body panels/skirts forbidden: {light_body_offenders}"

    for name in ("Upper arm.L", "Upper arm.R", "Forearm.L", "Forearm.R", "Hand.L", "Hand.R"):
        obj = objects[name]
        assert obj.matrix_world.translation.y >= REST_ARM_MIN_Y, (
            f"{name}: visible in Idle at y={obj.matrix_world.translation.y:.3f}"
        )

    left_brow = world_y_rotation_degrees(objects["Brow.L"])
    right_brow = world_y_rotation_degrees(objects["Brow.R"])
    assert MIN_BROW_TILT_DEGREES <= abs(left_brow) <= MAX_BROW_TILT_DEGREES, left_brow
    assert MIN_BROW_TILT_DEGREES <= abs(right_brow) <= MAX_BROW_TILT_DEGREES, right_brow
    assert left_brow * right_brow < 0, (left_brow, right_brow)

    left_mouth = world_y_rotation_degrees(objects["Mouth.L"])
    right_mouth = world_y_rotation_degrees(objects["Mouth.R"])
    assert left_mouth < -8 and right_mouth > 8, (left_mouth, right_mouth)

    for name in ("Eye.L", "Eye.R"):
        eye = objects[name]
        eye_width = world_width(eye)
        ratio = eye_width / head_width
        assert_range(f"{name} width/head", ratio, EYE_TO_HEAD_WIDTH)
        eye_height = world_z_bounds(eye)[1] - world_z_bounds(eye)[0]
        verticality = eye_height / max(eye_width, 1e-6)
        assert_range(f"{name} verticality", verticality, EYE_VERTICALITY)

    print(
        "Home Matthias HARD canonical contract OK | "
        f"reference={CANONICAL_REFERENCE_SHA256[:12]} "
        f"flare={flare:.3f} head/base={head_width/base_width:.3f} "
        f"height/base={total_height/base_width:.3f}"
    )


if __name__ == "__main__":
    main()
