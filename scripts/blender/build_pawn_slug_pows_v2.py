#!/usr/bin/env python3
"""Build Pawn Slug POW v2 as a genuine Blender-authored Z-up source.

The exported GLB keeps the runtime node contract:
  <pose>__<group>__<part>
where pose is bound/kneeling/caged and group is body/chains/cage.

The source is authored in Blender-native Z-up coordinates. The glTF exporter
performs the normal Y-up conversion for Three.js.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector

POSES = ("bound", "kneeling", "caged")
PALETTE = {
    "uniform": (0.20, 0.25, 0.20, 1.0),
    "uniform_dark": (0.095, 0.125, 0.105, 1.0),
    "cloth_light": (0.29, 0.33, 0.26, 1.0),
    "webbing": (0.29, 0.235, 0.165, 1.0),
    "leather": (0.095, 0.068, 0.050, 1.0),
    "skin": (0.58, 0.39, 0.29, 1.0),
    "skin_light": (0.72, 0.51, 0.39, 1.0),
    "hair": (0.055, 0.045, 0.038, 1.0),
    "steel": (0.18, 0.21, 0.23, 1.0),
    "steel_edge": (0.34, 0.38, 0.40, 1.0),
    "brass": (0.50, 0.35, 0.12, 1.0),
    "red": (0.37, 0.07, 0.055, 1.0),
    "eye": (0.018, 0.016, 0.014, 1.0),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, *, metallic=0.03, roughness=0.82):
    mat = bpy.data.materials.new(f"pow_v2_{name}")
    mat.diffuse_color = PALETTE[name]
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


def build_materials():
    mats = {name: material(name) for name in PALETTE}
    for name in ("steel", "steel_edge"):
        mats[name].metallic = 0.78
        mats[name].roughness = 0.34
    mats["brass"].metallic = 0.66
    mats["brass"].roughness = 0.30
    mats["eye"].roughness = 0.38
    mats["skin"].roughness = 0.92
    mats["skin_light"].roughness = 0.88
    return mats


def part_name(pose, group, label):
    return f"{pose}__{group}__{label}"


def finish(obj, pose, group, label, mat, *, smooth=False, bevel=0.0):
    obj.name = part_name(pose, group, label)
    if getattr(obj, "data", None) is not None:
        obj.data.name = f"{obj.name}_mesh"
        if hasattr(obj.data, "materials"):
            obj.data.materials.append(mat)
        if smooth and hasattr(obj.data, "polygons"):
            for polygon in obj.data.polygons:
                polygon.use_smooth = True
    if bevel > 0:
        modifier = obj.modifiers.new("soft_edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj


def rounded_box(pose, group, label, size, mat, location=(0, 0, 0), rotation=(0, 0, 0), bevel=0.035):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, pose, group, label, mat, bevel=bevel)


def sphere(pose, group, label, radius, mat, location=(0, 0, 0), scale=(1, 1, 1), segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, pose, group, label, mat, smooth=True)


def cylinder(pose, group, label, radius, depth, mat, location=(0, 0, 0), rotation=(0, 0, 0), vertices=16, bevel=0.018):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, pose, group, label, mat, smooth=True, bevel=bevel)


def torus(pose, group, label, major_radius, minor_radius, mat, location=(0, 0, 0), rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=12,
        minor_segments=6,
        location=location,
        rotation=rotation,
        major_radius=major_radius,
        minor_radius=minor_radius,
    )
    return finish(bpy.context.object, pose, group, label, mat, smooth=True)


def capsule_between(pose, group, label, start, end, radius, mat):
    start_v = Vector(start)
    end_v = Vector(end)
    delta = end_v - start_v
    length = max(delta.length, 0.001)
    midpoint = (start_v + end_v) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=length, location=midpoint)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    finish(obj, pose, group, f"{label}_shaft", mat, smooth=True, bevel=min(radius * 0.28, 0.022))
    sphere(pose, group, f"{label}_joint_a", radius * 1.02, mat, start, segments=14, rings=8)
    sphere(pose, group, f"{label}_joint_b", radius * 1.02, mat, end, segments=14, rings=8)
    return obj


def add_face(pose, m, head_center):
    x, y, z = head_center
    sphere(pose, "body", "head", 0.205, m["skin"], (x, y, z), (0.92, 0.90, 1.04))
    sphere(pose, "body", "nose", 0.047, m["skin_light"], (x, y - 0.188, z - 0.005), (0.72, 1.0, 1.10), 14, 8)
    for side, sx in (("left", -0.067), ("right", 0.067)):
        sphere(pose, "body", f"{side}_eye", 0.020, m["eye"], (x + sx, y - 0.185, z + 0.048), (1.25, 0.52, 0.70), 12, 6)
        rounded_box(
            pose, "body", f"{side}_brow", (0.085, 0.018, 0.020), m["hair"],
            (x + sx, y - 0.194, z + 0.095),
            (0.0, 0.0, -0.10 if side == "left" else 0.10),
            bevel=0.008,
        )
        sphere(pose, "body", f"{side}_ear", 0.046, m["skin"], (x + (-0.19 if side == "left" else 0.19), y, z), (0.55, 0.42, 1.05), 12, 6)
    rounded_box(pose, "body", "stubble", (0.19, 0.020, 0.085), m["hair"], (x, y - 0.188, z - 0.108), bevel=0.018)
    rounded_box(pose, "body", "mouth", (0.095, 0.016, 0.012), m["hair"], (x, y - 0.204, z - 0.080), bevel=0.005)

    rounded_box(pose, "body", "field_cap", (0.37, 0.34, 0.105), m["uniform_dark"], (x, y + 0.01, z + 0.195), (0, 0.04, -0.035), bevel=0.045)
    rounded_box(pose, "body", "field_cap_brim", (0.29, 0.18, 0.038), m["uniform_dark"], (x + 0.015, y - 0.17, z + 0.168), (0.08, 0.0, -0.035), bevel=0.020)


def add_torso(pose, m, pelvis_z, *, crouched):
    chest_z = pelvis_z + 0.56
    sphere(pose, "body", "jacket_mass", 0.34, m["uniform"], (0, 0, chest_z), (0.88, 0.60, 1.06), 20, 12)
    rounded_box(pose, "body", "vest", (0.48, 0.18, 0.40), m["uniform_dark"], (0, -0.145, chest_z - 0.02), bevel=0.050)
    rounded_box(pose, "body", "waist", (0.43, 0.28, 0.16), m["uniform"], (0, 0, pelvis_z + 0.24), bevel=0.055)
    rounded_box(pose, "body", "belt", (0.48, 0.31, 0.055), m["webbing"], (0, -0.005, pelvis_z + 0.18), bevel=0.018)
    rounded_box(pose, "body", "buckle", (0.075, 0.030, 0.065), m["brass"], (0, -0.176, pelvis_z + 0.18), bevel=0.010)
    for side, angle in (("left", -0.42), ("right", 0.42)):
        rounded_box(
            pose, "body", f"{side}_chest_strap", (0.055, 0.028, 0.55), m["webbing"],
            ((-0.11 if side == "left" else 0.11), -0.245, chest_z + 0.01),
            (0.0, angle * 0.20, angle),
            bevel=0.012,
        )
    rounded_box(pose, "body", "left_pouch", (0.15, 0.10, 0.17), m["webbing"], (-0.16, -0.245, pelvis_z + 0.30), bevel=0.025)
    rounded_box(pose, "body", "right_pouch", (0.15, 0.10, 0.17), m["webbing"], (0.16, -0.245, pelvis_z + 0.30), bevel=0.025)
    rounded_box(pose, "body", "rank_patch", (0.070, 0.018, 0.085), m["red"], (-0.22, -0.252, chest_z + 0.12), bevel=0.010)
    cylinder(pose, "body", "neck", 0.085, 0.13, m["skin"], (0, 0, chest_z + 0.39), vertices=14)
    head = (0, -0.012, chest_z + 0.60)
    add_face(pose, m, head)
    rounded_box(pose, "body", "dog_tag_a", (0.042, 0.014, 0.064), m["steel_edge"], (-0.022, -0.255, chest_z + 0.11), (0, 0, 0.12), bevel=0.008)
    rounded_box(pose, "body", "dog_tag_b", (0.042, 0.014, 0.064), m["steel"], (0.024, -0.255, chest_z + 0.08), (0, 0, -0.10), bevel=0.008)
    return chest_z


def add_arms(pose, m, chest_z, pelvis_z):
    shoulder_z = chest_z + 0.15
    if pose == "caged":
        elbows = [(-0.31, -0.10, chest_z - 0.03), (0.31, -0.10, chest_z - 0.03)]
        hands = [(-0.25, -0.43, chest_z + 0.08), (0.25, -0.43, chest_z + 0.08)]
    elif pose == "kneeling":
        elbows = [(-0.34, -0.015, chest_z - 0.18), (0.34, -0.015, chest_z - 0.18)]
        hands = [(-0.095, -0.25, pelvis_z + 0.34), (0.095, -0.25, pelvis_z + 0.34)]
    else:
        elbows = [(-0.35, -0.005, chest_z - 0.17), (0.35, -0.005, chest_z - 0.17)]
        hands = [(-0.095, -0.25, pelvis_z + 0.33), (0.095, -0.25, pelvis_z + 0.33)]

    shoulders = [(-0.29, 0, shoulder_z), (0.29, 0, shoulder_z)]
    for side, shoulder, elbow, hand in zip(("left", "right"), shoulders, elbows, hands):
        capsule_between(pose, "body", f"{side}_upper_arm", shoulder, elbow, 0.065, m["uniform"])
        capsule_between(pose, "body", f"{side}_forearm", elbow, hand, 0.057, m["uniform"])
        sphere(pose, "body", f"{side}_hand", 0.072, m["skin_light"], hand, (0.92, 0.82, 1.08), 14, 8)
    return hands


def add_legs(pose, m, pelvis_z):
    if pose in ("kneeling", "caged"):
        hips = [(-0.15, 0.0, pelvis_z + 0.07), (0.15, 0.0, pelvis_z + 0.07)]
        knees = [(-0.31, -0.11, 0.31), (0.31, -0.11, 0.31)]
        ankles = [(-0.37, 0.18, 0.12), (0.37, 0.18, 0.12)]
        for side, hip, knee, ankle in zip(("left", "right"), hips, knees, ankles):
            capsule_between(pose, "body", f"{side}_thigh", hip, knee, 0.085, m["uniform_dark"])
            capsule_between(pose, "body", f"{side}_shin", knee, ankle, 0.075, m["uniform_dark"])
            rounded_box(
                pose, "body", f"{side}_boot", (0.20, 0.35, 0.14), m["leather"],
                (ankle[0], ankle[1] - 0.06, 0.075),
                (0.0, 0.0, -0.08 if side == "left" else 0.08),
                bevel=0.035,
            )
    else:
        hips = [(-0.15, 0, pelvis_z + 0.06), (0.15, 0, pelvis_z + 0.06)]
        knees = [(-0.16, 0.01, 0.40), (0.16, 0.01, 0.40)]
        ankles = [(-0.17, 0.015, 0.14), (0.17, 0.015, 0.14)]
        for side, hip, knee, ankle in zip(("left", "right"), hips, knees, ankles):
            capsule_between(pose, "body", f"{side}_thigh", hip, knee, 0.088, m["uniform_dark"])
            capsule_between(pose, "body", f"{side}_shin", knee, ankle, 0.078, m["uniform_dark"])
            rounded_box(pose, "body", f"{side}_boot", (0.20, 0.34, 0.14), m["leather"], (ankle[0], -0.07, 0.075), bevel=0.035)


def add_restraints(pose, m, hands):
    if pose == "caged":
        return
    for side, hand in zip(("left", "right"), hands):
        torus(
            pose, "chains", f"{side}_cuff", 0.075, 0.014, m["steel_edge"],
            (hand[0], hand[1], hand[2]),
            (math.pi / 2, 0, 0),
        )
    left = Vector(hands[0])
    right = Vector(hands[1])
    for index in range(5):
        t = index / 4.0
        p = left.lerp(right, t)
        p.y -= 0.035
        p.z -= 0.035 + 0.030 * math.sin(t * math.pi)
        torus(
            pose, "chains", f"wrist_link_{index}", 0.038, 0.010, m["steel"],
            p,
            (math.pi / 2, (math.pi / 2 if index % 2 else 0), 0),
        )
    anchor = Vector((-0.42, 0.09, 1.54 if pose == "bound" else 1.34))
    for index in range(6):
        p = anchor + Vector((0.055 * index, -0.01 * index, -0.105 * index))
        torus(
            pose, "chains", f"wall_link_{index}", 0.050, 0.012, m["steel"],
            p,
            (0, math.pi / 2 if index % 2 else 0, 0),
        )


def add_cage(pose, m):
    if pose != "caged":
        return
    floor_z = 0.035
    roof_z = 2.13
    half_x = 0.72
    front_y = -0.52
    back_y = 0.46
    rounded_box(pose, "cage", "floor", (1.54, 1.08, 0.08), m["steel"], (0, -0.03, floor_z), bevel=0.025)
    for y in (front_y, back_y):
        rounded_box(pose, "cage", f"roof_beam_y_{'front' if y < 0 else 'back'}", (1.54, 0.07, 0.07), m["steel_edge"], (0, y, roof_z), bevel=0.020)
    for x in (-half_x, half_x):
        rounded_box(pose, "cage", f"roof_beam_x_{'left' if x < 0 else 'right'}", (0.07, 1.05, 0.07), m["steel_edge"], (x, -0.03, roof_z), bevel=0.020)
    for xi, x in enumerate((-half_x, half_x)):
        for yi, y in enumerate((front_y, back_y)):
            cylinder(pose, "cage", f"corner_post_{xi}_{yi}", 0.038, 2.08, m["steel_edge"], (x, y, 1.08), vertices=12, bevel=0.012)
    for index, x in enumerate((-0.54, -0.36, -0.18, 0.0, 0.18, 0.36, 0.54)):
        cylinder(pose, "cage", f"front_bar_{index}", 0.022, 1.96, m["steel"], (x, front_y, 1.06), vertices=10, bevel=0.006)
    for side, x in (("left", -half_x), ("right", half_x)):
        for index, y in enumerate((-0.30, -0.05, 0.20)):
            cylinder(pose, "cage", f"{side}_bar_{index}", 0.020, 1.96, m["steel"], (x, y, 1.06), vertices=10, bevel=0.006)
    rounded_box(pose, "cage", "lock_body", (0.16, 0.055, 0.20), m["brass"], (0.39, front_y - 0.035, 1.02), bevel=0.025)
    torus(pose, "cage", "lock_shackle", 0.060, 0.014, m["steel_edge"], (0.39, front_y - 0.055, 1.16), (math.pi / 2, 0, 0))


def build_prisoner(pose, m):
    crouched = pose in ("kneeling", "caged")
    pelvis_z = 0.55 if crouched else 0.74
    chest_z = add_torso(pose, m, pelvis_z, crouched=crouched)
    hands = add_arms(pose, m, chest_z, pelvis_z)
    add_legs(pose, m, pelvis_z)
    add_restraints(pose, m, hands)
    add_cage(pose, m)


def export_runtime(out):
    blend_path = out / "pawn_slug_pow_squad_v2.blend"
    glb_path = out / "pawn_slug_pow_squad_v2.glb"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path), compress=True)

    props = bpy.ops.export_scene.gltf.get_rna_type().properties.keys()
    kwargs = {
        "filepath": str(glb_path),
        "export_format": "GLB",
        "export_animations": False,
        "export_yup": True,
        "export_cameras": False,
        "export_lights": False,
    }
    if "export_apply" in props:
        kwargs["export_apply"] = True
    bpy.ops.export_scene.gltf(**kwargs)
    print("Wrote", blend_path)
    print("Wrote", glb_path)


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_preview():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.45
    scene.world.color = (0.018, 0.022, 0.026)

    bpy.ops.object.camera_add(location=(3.20, -6.4, 2.72))
    camera = bpy.context.object
    camera.name = "preview_camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.72
    look_at(camera, (0, -0.02, 1.05))
    scene.camera = camera

    def sun(name, rotation, energy, color):
        bpy.ops.object.light_add(type="SUN", location=(0, 0, 4))
        light = bpy.context.object
        light.name = name
        light.rotation_euler = rotation
        light.data.energy = energy
        light.data.color = color
        light.data.angle = math.radians(7)
        return light

    sun("preview_key", (math.radians(35), 0, math.radians(-35)), 2.2, (1.0, 0.82, 0.66))
    sun("preview_fill", (math.radians(62), 0, math.radians(145)), 1.0, (0.58, 0.72, 1.0))
    sun("preview_rim", (math.radians(25), 0, math.radians(180)), 1.25, (0.70, 0.82, 1.0))

    preview_mat = bpy.data.materials.new("preview_floor_mat")
    preview_mat.diffuse_color = (0.045, 0.050, 0.056, 1.0)
    preview_mat.roughness = 0.96
    bpy.ops.mesh.primitive_plane_add(size=5, location=(0, 0, 0))
    plane = bpy.context.object
    plane.name = "preview_floor"
    plane.data.materials.append(preview_mat)
    return scene


def render_previews(out):
    scene = setup_preview()
    authored = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and any(obj.name.startswith(f"{pose}__") for pose in POSES)
    ]
    for pose in POSES:
        for obj in authored:
            obj.hide_render = not obj.name.startswith(f"{pose}__")
        scene.render.filepath = str(out / f"pow_{pose}_v2.png")
        bpy.ops.render.render(write_still=True)
        print("Wrote", scene.render.filepath)
    for obj in authored:
        obj.hide_render = False


def main():
    args = parse_args()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    mats = build_materials()
    for pose in POSES:
        build_prisoner(pose, mats)
    export_runtime(out)
    render_previews(out)


if __name__ == "__main__":
    main()
