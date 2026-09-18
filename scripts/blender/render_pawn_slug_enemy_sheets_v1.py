#!/usr/bin/env python3
"""Render canonical Blender-authored Pawn Slug enemy sprite sheets.

Four distinct military-chess enemy silhouettes are authored in Blender-native Z-up:
  pawn   -> light rifle infantry
  knight -> fast assault trooper with swept knight crest
  rook   -> broad heavy gunner with crenellated armour
  bishop -> tall field officer with mitre crest and brass command trim

Each type renders the real runtime action contract into transparent 2x source frames.
A lightweight compositor step in CI downsamples them into 96px runtime-style sheets.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

ACTIONS = {
    "idle": 12,
    "run": 16,
    "jump": 10,
    "crouch": 8,
    "hurt": 6,
    "climb": 12,
    "death": 14,
}
TYPES = ("pawn", "knight", "rook", "bishop")
PALETTE = {
    "cloth": (0.18, 0.24, 0.18, 1.0),
    "cloth_light": (0.28, 0.34, 0.23, 1.0),
    "cloth_dark": (0.075, 0.105, 0.075, 1.0),
    "webbing": (0.28, 0.22, 0.14, 1.0),
    "leather": (0.07, 0.045, 0.032, 1.0),
    "skin": (0.57, 0.39, 0.29, 1.0),
    "steel": (0.20, 0.23, 0.25, 1.0),
    "steel_light": (0.38, 0.43, 0.46, 1.0),
    "black": (0.025, 0.028, 0.030, 1.0),
    "wood": (0.25, 0.105, 0.045, 1.0),
    "brass": (0.47, 0.32, 0.09, 1.0),
    "red": (0.42, 0.055, 0.04, 1.0),
}


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--enemy-type", choices=TYPES)
    parser.add_argument("--smoke", action="store_true", help="Render representative runtime-resolution evidence only")
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(name, *, metallic=0.03, roughness=0.80):
    mat = bpy.data.materials.new(f"enemy_v1_{name}")
    mat.diffuse_color = PALETTE[name]
    mat.metallic = metallic
    mat.roughness = roughness
    return mat


def build_materials():
    mats = {name: material(name) for name in PALETTE}
    for name in ("steel", "steel_light"):
        mats[name].metallic = 0.78
        mats[name].roughness = 0.32
    mats["brass"].metallic = 0.62
    mats["brass"].roughness = 0.30
    mats["black"].roughness = 0.38
    return mats


def finish(obj, name, mat, *, smooth=False, bevel=0.0):
    obj.name = name
    if getattr(obj, "data", None) is not None:
        obj.data.name = f"{name}_mesh"
        if hasattr(obj.data, "materials"):
            obj.data.materials.append(mat)
        if smooth and hasattr(obj.data, "polygons"):
            for poly in obj.data.polygons:
                poly.use_smooth = True
    if bevel > 0:
        mod = obj.modifiers.new("soft_edges", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def box(name, size, mat, location=(0, 0, 0), rotation=(0, 0, 0), bevel=0.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel=bevel)


def sphere(name, radius, mat, location=(0, 0, 0), scale=(1, 1, 1), segments=18, rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=radius, location=location)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, smooth=True)


def cylinder(name, radius, depth, mat, location=(0, 0, 0), rotation=(0, 0, 0), vertices=14, bevel=0.012):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    return finish(bpy.context.object, name, mat, smooth=True, bevel=bevel)


def capsule(name, start, end, radius, mat):
    a = Vector(start)
    b = Vector(end)
    delta = b - a
    length = max(delta.length, 0.001)
    middle = (a + b) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(vertices=14, radius=radius, depth=length, location=middle)
    obj = bpy.context.object
    obj.rotation_euler = delta.to_track_quat("Z", "Y").to_euler()
    finish(obj, f"{name}_shaft", mat, smooth=True, bevel=min(0.018, radius * 0.25))
    sphere(f"{name}_joint_a", radius * 1.03, mat, a, segments=12, rings=7)
    sphere(f"{name}_joint_b", radius * 1.03, mat, b, segments=12, rings=7)


def action_pose(enemy_type, action, frame):
    count = ACTIONS[action]
    phase = frame / max(1, count - (0 if action in ("hurt", "death") else 1))
    cycle = phase * math.tau
    s = math.sin(cycle)
    c = math.cos(cycle)
    pose = {
        "root_x": 0.0, "root_z": 0.0, "lean": 0.0,
        "crouch": 0.0, "leg": 0.0, "arm": 0.0,
        "weapon_pitch": 0.0, "death": 0.0,
    }
    mass = {"pawn": 1.0, "knight": 1.18, "rook": 0.72, "bishop": 0.86}[enemy_type]
    if action == "idle":
        pose["root_z"] = (1 - c) * 0.006 * mass
        pose["lean"] = s * 0.012 * mass
        pose["arm"] = s * 0.025
    elif action == "run":
        pose["root_z"] = abs(s) * (0.085 if enemy_type == "knight" else 0.06 if enemy_type == "pawn" else 0.05 if enemy_type == "bishop" else 0.038)
        pose["root_x"] = s * (0.045 if enemy_type == "knight" else 0.026 if enemy_type == "pawn" else 0.020 if enemy_type == "bishop" else 0.015)
        pose["lean"] = -0.12 if enemy_type == "knight" else -0.07 if enemy_type == "pawn" else -0.05 if enemy_type == "bishop" else -0.035
        pose["leg"] = s * (0.88 if enemy_type == "knight" else 0.70 if enemy_type == "pawn" else 0.58 if enemy_type == "bishop" else 0.48)
        pose["arm"] = -s * 0.34
    elif action == "jump":
        arc = math.sin(min(1.0, phase) * math.pi)
        pose["root_z"] = 0.12 + arc * 0.22
        pose["lean"] = -0.08 + phase * 0.12
        pose["leg"] = 0.38 - phase * 0.60
        pose["weapon_pitch"] = -0.07 + phase * 0.10
    elif action == "crouch":
        settle = min(1.0, phase * 1.5)
        pose["crouch"] = 0.34 * settle
        pose["lean"] = -0.05
        pose["weapon_pitch"] = 0.05
    elif action == "hurt":
        snap = 1.0 - min(1.0, phase)
        pose["root_x"] = 0.14 * snap
        pose["lean"] = 0.20 * snap
        pose["weapon_pitch"] = -0.12 * snap
    elif action == "climb":
        pose["root_z"] = abs(s) * 0.055
        pose["leg"] = s * 0.58
        pose["arm"] = -s * 0.72
        pose["weapon_pitch"] = 0.14
    elif action == "death":
        fall = math.sin(min(1.0, phase) * math.pi * 0.5)
        pose["death"] = fall
        pose["root_x"] = -0.12 * fall
        pose["root_z"] = -0.24 * fall
        pose["lean"] = 0.88 * fall
        pose["weapon_pitch"] = -0.35 * fall
    return pose


def add_helmet(enemy_type, mats, head_z):
    if enemy_type == "pawn":
        cylinder("helmet", 0.205, 0.115, mats["cloth_dark"], (0.0, 0.0, head_z + 0.17), vertices=16)
        box("helmet_brim", (0.34, 0.18, 0.045), mats["cloth_dark"], (-0.025, -0.08, head_z + 0.14), bevel=0.018)
    elif enemy_type == "knight":
        box("helmet_core", (0.34, 0.32, 0.22), mats["steel"], (0, 0, head_z + 0.14), (0, 0.08, -0.03), bevel=0.06)
        box("knight_crest", (0.18, 0.10, 0.38), mats["steel_light"], (0.07, 0.06, head_z + 0.34), (0.14, -0.25, -0.35), bevel=0.04)
        box("knight_brow", (0.38, 0.18, 0.055), mats["steel_light"], (-0.02, -0.12, head_z + 0.12), bevel=0.018)
    elif enemy_type == "rook":
        box("rook_helmet", (0.46, 0.40, 0.25), mats["steel"], (0, 0, head_z + 0.13), bevel=0.045)
        for i, x in enumerate((-0.17, 0.0, 0.17)):
            box(f"rook_crenel_{i}", (0.11, 0.25, 0.11), mats["steel_light"], (x, 0.0, head_z + 0.30), bevel=0.02)
    else:
        box("bishop_helmet", (0.34, 0.32, 0.24), mats["steel"], (0, 0, head_z + 0.13), bevel=0.055)
        box("bishop_mitre", (0.20, 0.18, 0.42), mats["steel_light"], (0.02, 0.02, head_z + 0.38), (0.08, 0.0, -0.08), bevel=0.05)
        box("bishop_mitre_trim", (0.235, 0.205, 0.055), mats["brass"], (0.02, -0.01, head_z + 0.29), (0.08, 0.0, -0.08), bevel=0.018)


def add_weapon(enemy_type, mats, shoulder_z, pose):
    if enemy_type == "rook":
        length, thickness = 1.18, 0.12
        muzzle_x = -0.90
        stock_x = 0.28
    elif enemy_type == "bishop":
        length, thickness = 1.06, 0.095
        muzzle_x = -0.84
        stock_x = 0.24
    elif enemy_type == "knight":
        length, thickness = 0.92, 0.085
        muzzle_x = -0.75
        stock_x = 0.20
    else:
        length, thickness = 0.98, 0.075
        muzzle_x = -0.78
        stock_x = 0.22
    z = shoulder_z - 0.02
    pitch = pose["weapon_pitch"]
    box("weapon_receiver", (length * 0.54, thickness, thickness * 1.15), mats["black"], (-0.28, -0.28, z), (0, pitch, 0), bevel=0.018)
    cylinder("weapon_barrel", thickness * 0.22, length * 0.55, mats["steel_light"], (muzzle_x + 0.16, -0.28, z + 0.01), (0, math.pi / 2 + pitch, 0), vertices=10, bevel=0.004)
    box("weapon_stock", (0.34 if enemy_type != "rook" else 0.42, thickness * 1.3, thickness * 1.25), mats["wood" if enemy_type == "pawn" else "black"], (stock_x, -0.27, z - 0.01), (0, pitch, 0), bevel=0.025)
    box("weapon_mag", (0.12 if enemy_type != "rook" else 0.17, thickness * 1.12, 0.22), mats["black"], (-0.18, -0.27, z - 0.13), (0, 0.12, -0.08), bevel=0.018)
    if enemy_type == "rook":
        box("weapon_box_mag", (0.28, 0.14, 0.24), mats["black"], (-0.05, -0.26, z - 0.15), bevel=0.025)
        cylinder("weapon_muzzle", 0.055, 0.13, mats["steel_light"], (muzzle_x - 0.18, -0.28, z + 0.01), (0, math.pi / 2, 0), vertices=10)


def build_enemy(enemy_type, action, frame, mats):
    pose = action_pose(enemy_type, action, frame)
    heavy = enemy_type == "rook"
    fast = enemy_type == "knight"
    officer = enemy_type == "bishop"
    root_x = pose["root_x"]
    base_z = max(0.02, 0.04 + pose["root_z"])
    crouch = pose["crouch"]
    pelvis_z = base_z + (0.58 if heavy else 0.62) - crouch
    chest_z = pelvis_z + (0.52 if heavy else 0.55)
    shoulder_z = chest_z + 0.12
    head_z = chest_z + 0.55
    lean = pose["lean"]
    width = 0.38 if heavy else 0.31 if fast else 0.33 if officer else 0.29

    sphere("torso", width, mats["cloth"], (root_x, 0, chest_z), (1.02 if heavy else 0.90, 0.66, 1.02))
    box("vest", (0.63 if heavy else 0.48, 0.20, 0.42), mats["cloth_dark"], (root_x - 0.02, -0.19, chest_z), (0, 0, lean * 0.12), bevel=0.05)
    box("belt", (0.64 if heavy else 0.49, 0.30, 0.06), mats["webbing"], (root_x, 0, pelvis_z + 0.18), bevel=0.018)
    if heavy:
        for side, x in (("l", -0.35), ("r", 0.35)):
            box(f"shoulder_{side}", (0.28, 0.34, 0.20), mats["steel"], (root_x + x, -0.02, shoulder_z), (0, 0, -0.12 if side == "l" else 0.12), bevel=0.045)
        box("chest_plate", (0.62, 0.09, 0.35), mats["steel"], (root_x, -0.31, chest_z + 0.02), bevel=0.05)
    elif fast:
        box("knight_shoulder", (0.48, 0.28, 0.16), mats["steel"], (root_x + 0.02, -0.02, shoulder_z + 0.01), (0, 0, -0.08), bevel=0.05)
    elif officer:
        box("bishop_collar", (0.54, 0.24, 0.15), mats["brass"], (root_x, -0.08, shoulder_z + 0.02), bevel=0.045)
        box("bishop_chest_trim", (0.12, 0.035, 0.42), mats["brass"], (root_x + 0.12, -0.315, chest_z + 0.02), (0, 0, -0.22), bevel=0.018)

    cylinder("neck", 0.075 if not heavy else 0.09, 0.12, mats["skin"], (root_x, 0, chest_z + 0.36), vertices=12)
    sphere("head", 0.19 if not heavy else 0.205, mats["skin"], (root_x, -0.01, head_z), (0.94, 0.88, 1.03))
    sphere("nose", 0.038, mats["skin"], (root_x - 0.04, -0.17, head_z - 0.005), (0.72, 1.0, 1.0), 12, 6)
    add_helmet(enemy_type, mats, head_z)

    stride = pose["leg"]
    leg_spread = 0.17 if heavy else 0.15
    hip_l = (root_x - leg_spread, 0.0, pelvis_z + 0.05)
    hip_r = (root_x + leg_spread, 0.0, pelvis_z + 0.05)
    knee_l = (root_x - leg_spread - stride * 0.16, -0.02, base_z + 0.34)
    knee_r = (root_x + leg_spread + stride * 0.16, 0.02, base_z + 0.34)
    ankle_l = (root_x - leg_spread + stride * 0.13, 0.03, base_z + 0.10)
    ankle_r = (root_x + leg_spread - stride * 0.13, -0.03, base_z + 0.10)
    leg_r = 0.085 if heavy else 0.072
    for side, hip, knee, ankle in (("left", hip_l, knee_l, ankle_l), ("right", hip_r, knee_r, ankle_r)):
        capsule(f"{side}_thigh", hip, knee, leg_r, mats["cloth_dark"])
        capsule(f"{side}_shin", knee, ankle, leg_r * 0.88, mats["cloth_dark"])
        box(f"{side}_boot", (0.22 if heavy else 0.19, 0.32, 0.13), mats["leather"], (ankle[0], -0.07, base_z + 0.055), bevel=0.028)

    arm_swing = pose["arm"]
    shoulder_l = (root_x - (0.34 if heavy else 0.29), 0, shoulder_z)
    shoulder_r = (root_x + (0.34 if heavy else 0.29), 0, shoulder_z)
    hand_l = (root_x - 0.30 + arm_swing * 0.08, -0.30, shoulder_z - 0.11 + arm_swing * 0.04)
    hand_r = (root_x + 0.02 - arm_swing * 0.05, -0.31, shoulder_z - 0.04 - arm_swing * 0.03)
    elbow_l = ((shoulder_l[0] + hand_l[0]) * 0.5 - 0.05, -0.10, shoulder_z - 0.10)
    elbow_r = ((shoulder_r[0] + hand_r[0]) * 0.5 + 0.03, -0.11, shoulder_z - 0.10)
    arm_r = 0.068 if heavy else 0.057
    for side, shoulder, elbow, hand in (("left", shoulder_l, elbow_l, hand_l), ("right", shoulder_r, elbow_r, hand_r)):
        capsule(f"{side}_upper_arm", shoulder, elbow, arm_r, mats["cloth"])
        capsule(f"{side}_forearm", elbow, hand, arm_r * 0.90, mats["cloth"])
        sphere(f"{side}_hand", arm_r * 1.05, mats["skin"], hand, (0.9, 0.82, 1.05), 12, 6)

    add_weapon(enemy_type, mats, shoulder_z, pose)

    if enemy_type == "pawn":
        sphere("pawn_badge", 0.055, mats["brass"], (root_x + 0.17, -0.305, chest_z + 0.12), (1, 0.35, 1), 12, 6)
    elif enemy_type == "knight":
        box("knight_badge", (0.10, 0.025, 0.14), mats["red"], (root_x + 0.18, -0.315, chest_z + 0.12), (0, 0, -0.22), bevel=0.02)
    elif enemy_type == "rook":
        box("rook_badge", (0.15, 0.025, 0.14), mats["brass"], (root_x + 0.18, -0.365, chest_z + 0.12), bevel=0.018)
    else:
        box("bishop_badge", (0.11, 0.025, 0.20), mats["brass"], (root_x + 0.18, -0.325, chest_z + 0.13), (0, 0, -0.28), bevel=0.018)

    if pose["death"] > 0:
        angle = pose["lean"]
        pivot = Vector((root_x, 0, base_z + 0.12))
        for obj in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
            rel = obj.location - pivot
            rot = Matrix.Rotation(angle, 4, "Y") @ rel
            obj.location = pivot + rot
            obj.rotation_euler.y += angle


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_scene(smoke=False):
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    render_size = 96 if smoke else 192
    scene.render.resolution_x = render_size
    scene.render.resolution_y = render_size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass
    scene.view_settings.exposure = 0.50
    scene.world.color = (0.012, 0.015, 0.018)

    bpy.ops.object.camera_add(location=(3.35, -7.4, 2.70))
    camera = bpy.context.object
    camera.name = "enemy_sheet_camera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 3.25
    look_at(camera, (0, -0.03, 1.08))
    scene.camera = camera

    def sun(name, rotation, energy, color):
        bpy.ops.object.light_add(type="SUN", location=(0, 0, 4))
        light = bpy.context.object
        light.name = name
        light.rotation_euler = rotation
        light.data.energy = energy
        light.data.color = color
        light.data.angle = math.radians(7)

    sun("key", (math.radians(38), 0, math.radians(-42)), 2.15, (1.0, 0.82, 0.65))
    sun("fill", (math.radians(58), 0, math.radians(140)), 0.95, (0.60, 0.73, 1.0))
    sun("rim", (math.radians(24), 0, math.radians(185)), 1.20, (0.72, 0.84, 1.0))
    return scene


def clear_authored():
    keep = {"enemy_sheet_camera", "key", "fill", "rim"}
    for obj in list(bpy.context.scene.objects):
        if obj.name in keep:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)


def save_preview_blend(out, mats, types):
    clear_authored()
    offsets = {"pawn": -2.10, "knight": -0.70, "rook": 0.70, "bishop": 2.10}
    if len(types) == 1:
        offsets = {types[0]: 0.0}
    for enemy_type in types:
        before = set(bpy.context.scene.objects)
        build_enemy(enemy_type, "idle", 0, mats)
        for obj in set(bpy.context.scene.objects) - before:
            if obj.type == "MESH":
                obj.location.x += offsets[enemy_type]
                obj.name = f"{enemy_type}__{obj.name}"
    path = out / "pawn_slug_enemy_cast_v1.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(path), compress=True)
    print("Wrote", path)


def selected_frames(action, count, smoke):
    if not smoke:
        return list(range(count))
    # Smoke evidence samples the authored start, middle and end pose. This
    # catches clipping/silhouette regressions and proves motion without paying
    # for the full production atlas on every PR.
    return sorted({0, count // 2, count - 1})


def render_frames(out, mats, types, smoke=False):
    scene = bpy.context.scene
    rendered_frames = {action: selected_frames(action, count, smoke) for action, count in ACTIONS.items()}
    for enemy_type in types:
        for action, count in ACTIONS.items():
            target = out / "frames" / enemy_type / action
            target.mkdir(parents=True, exist_ok=True)
            for frame in rendered_frames[action]:
                clear_authored()
                build_enemy(enemy_type, action, frame, mats)
                scene.render.filepath = str(target / f"{frame:02d}.png")
                bpy.ops.render.render(write_still=True)
    manifest = {
        "version": "blender-enemy-v1",
        "blender": bpy.app.version_string,
        "sourceFacing": "left",
        "mode": "smoke" if smoke else "full",
        "frameSize": [scene.render.resolution_x, scene.render.resolution_y],
        "frameSize2x": [192, 192],
        "runtimeCell": [96, 96],
        "renderedFrames": rendered_frames,
        "columns": 16,
        "types": list(types),
        "actions": ACTIONS,
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


def main():
    args = parse_args()
    out = Path(args.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    types = (args.enemy_type,) if args.enemy_type else TYPES
    clear_scene()
    mats = build_materials()
    setup_scene(args.smoke)
    save_preview_blend(out, mats, types)
    render_frames(out, mats, types, smoke=args.smoke)
    print("Pawn Slug enemy Blender sheets source complete:", out)


if __name__ == "__main__":
    main()