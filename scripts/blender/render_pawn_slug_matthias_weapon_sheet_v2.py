#!/usr/bin/env python3
"""Standalone Blender renderer for readable Pawn Slug Matthias weapon atlases."""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

import bpy
from mathutils import Vector

COLS = 16
ROWS = 5
CELL = 4.0
CELL_PX = 96
WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
ACTIONS = (("idle", 10), ("walk", 10), ("run", 16), ("crouch", 10), ("jump", 9))


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-art")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    argv = os.sys.argv[os.sys.argv.index("--") + 1 :] if "--" in os.sys.argv else []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def material(name, rgba, metallic=0.0, roughness=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return m


def parent_keep_world(obj, parent):
    if parent is None:
        return obj
    matrix = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = matrix
    return obj


def root(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def bevel(obj, width=0.04):
    mod = obj.modifiers.new(name="soft_edges", type="BEVEL")
    mod.width = width
    mod.segments = 2
    return obj


def add_box(name, loc, dims, mat, rot=(0.0, 0.0, 0.0), parent=None, bevel_width=0.035):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    if bevel_width:
        bevel(obj, min(bevel_width, min(dims) * 0.2))
    return parent_keep_world(obj, parent)


def add_sphere(name, loc, dims, mat, parent=None, segments=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, radius=1.0, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = (dims[0] / 2.0, dims[1] / 2.0, dims[2] / 2.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if mat:
        obj.data.materials.append(mat)
    return parent_keep_world(obj, parent)


def add_cyl(name, loc, radius, depth, mat, rot=(0.0, 0.0, 0.0), parent=None, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    if mat:
        obj.data.materials.append(mat)
    return parent_keep_world(obj, parent)


def xz(origin, x, z, y=0.0):
    return (origin[0] + x, y, origin[2] + z)


def segment(name, origin, a, b, thickness, depth, mat, parent, y=-0.1):
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    length = max(0.03, math.hypot(dx, dz))
    angle = math.atan2(dz, dx)
    center = ((ax + bx) / 2.0, (az + bz) / 2.0)
    return add_box(
        name,
        xz(origin, center[0], center[1], y),
        (length, depth, thickness),
        mat,
        rot=(0.0, -angle, 0.0),
        parent=parent,
        bevel_width=0.03,
    )


def pose(action, frame, count):
    t = (frame / max(1, count)) * math.tau
    s = math.sin(t)
    if action == "idle":
        return dict(bob=0.02 * math.sin(t), lean=0.0, leg_a=0.03, leg_b=-0.03, lift_a=0.0, lift_b=0.0, crouch=0.0, jump=0.0)
    if action == "walk":
        return dict(bob=0.03 * abs(s), lean=-0.025, leg_a=0.28 * s, leg_b=-0.28 * s, lift_a=0.10 * max(0, s), lift_b=0.10 * max(0, -s), crouch=0.0, jump=0.0)
    if action == "run":
        return dict(bob=0.05 * abs(s), lean=-0.08, leg_a=0.52 * s, leg_b=-0.52 * s, lift_a=0.17 * max(0, s), lift_b=0.17 * max(0, -s), crouch=0.0, jump=0.0)
    if action == "crouch":
        blend = min(1.0, frame / max(1, count - 1) * 1.25)
        return dict(bob=0.0, lean=-0.04, leg_a=0.06, leg_b=-0.06, lift_a=0.0, lift_b=0.0, crouch=0.33 * blend, jump=0.0)
    phase = frame / max(1, count - 1)
    jump = math.sin(phase * math.pi) * 0.34
    tuck = math.sin(phase * math.pi) * 0.22
    return dict(bob=jump, lean=-0.04, leg_a=-0.10 + tuck, leg_b=0.12 - tuck, lift_a=0.10 + tuck, lift_b=0.10 + tuck, crouch=0.0, jump=jump)


def mats():
    return {
        "skin": material("skin", (0.48, 0.28, 0.17, 1.0), 0.0, 0.62),
        "uniform": material("uniform", (0.028, 0.045, 0.075, 1.0), 0.02, 0.48),
        "uniform2": material("uniform2", (0.065, 0.10, 0.16, 1.0), 0.05, 0.42),
        "armor": material("armor", (0.11, 0.17, 0.23, 1.0), 0.25, 0.30),
        "helmet": material("helmet", (0.028, 0.035, 0.046, 1.0), 0.32, 0.24),
        "boot": material("boot", (0.018, 0.020, 0.024, 1.0), 0.18, 0.28),
        "badge": material("badge", (0.78, 0.70, 0.48, 1.0), 0.42, 0.24),
        "gunmetal": material("gunmetal", (0.20, 0.30, 0.42, 1.0), 0.75, 0.20),
        "polymer": material("polymer", (0.045, 0.060, 0.085, 1.0), 0.08, 0.40),
        "olive": material("olive", (0.16, 0.28, 0.11, 1.0), 0.24, 0.42),
        "dark": material("weapon_dark", (0.020, 0.028, 0.038, 1.0), 0.45, 0.28),
        "brass": material("brass", (0.58, 0.33, 0.08, 1.0), 0.70, 0.22),
    }


def add_weapon(weapon, origin, parent, m, z):
    y = -0.46
    if weapon == "pistol":
        add_box("pistol_slide", xz(origin, -0.47, z + 0.04, y), (0.62, 0.22, 0.16), m["gunmetal"], parent=parent, bevel_width=0.025)
        add_box("pistol_frame", xz(origin, -0.35, z - 0.10, y), (0.34, 0.20, 0.14), m["polymer"], parent=parent, bevel_width=0.02)
        add_box("pistol_grip", xz(origin, -0.18, z - 0.30, y), (0.17, 0.19, 0.38), m["polymer"], rot=(0, 0.18, 0), parent=parent, bevel_width=0.02)
        add_cyl("pistol_muzzle", xz(origin, -0.80, z + 0.04, y), 0.065, 0.13, m["dark"], rot=(0, math.pi / 2, 0), parent=parent)
        add_box("pistol_sight", xz(origin, -0.58, z + 0.16, y), (0.07, 0.05, 0.05), m["badge"], parent=parent, bevel_width=0.01)
        return (-0.22, -0.54)
    if weapon == "machinegun":
        add_box("smg_receiver", xz(origin, -0.45, z, y), (0.68, 0.24, 0.22), m["gunmetal"], parent=parent, bevel_width=0.03)
        add_box("smg_handguard", xz(origin, -0.77, z - 0.01, y), (0.34, 0.25, 0.22), m["polymer"], parent=parent, bevel_width=0.03)
        add_cyl("smg_barrel", xz(origin, -1.05, z + 0.02, y), 0.055, 0.46, m["dark"], rot=(0, math.pi / 2, 0), parent=parent)
        add_box("smg_mag", xz(origin, -0.40, z - 0.32, y), (0.15, 0.18, 0.44), m["dark"], rot=(0, 0.10, 0), parent=parent, bevel_width=0.02)
        add_box("smg_stock", xz(origin, 0.00, z + 0.02, y), (0.34, 0.16, 0.15), m["polymer"], parent=parent, bevel_width=0.025)
        add_box("smg_sight", xz(origin, -0.42, z + 0.18, y), (0.10, 0.08, 0.08), m["badge"], parent=parent, bevel_width=0.015)
        return (-0.20, -0.75)
    if weapon == "shotgun":
        add_box("shotgun_receiver", xz(origin, -0.38, z, y), (0.58, 0.24, 0.21), m["gunmetal"], parent=parent, bevel_width=0.03)
        add_cyl("shotgun_barrel", xz(origin, -1.03, z + 0.05, y), 0.050, 1.04, m["dark"], rot=(0, math.pi / 2, 0), parent=parent)
        add_cyl("shotgun_tube", xz(origin, -0.96, z - 0.07, y), 0.038, 0.80, m["gunmetal"], rot=(0, math.pi / 2, 0), parent=parent)
        add_cyl("shotgun_pump", xz(origin, -0.78, z - 0.01, y - 0.015), 0.095, 0.34, m["polymer"], rot=(0, math.pi / 2, 0), parent=parent)
        add_box("shotgun_stock", xz(origin, 0.02, z - 0.04, y), (0.40, 0.22, 0.20), m["polymer"], rot=(0, -0.04, 0), parent=parent, bevel_width=0.03)
        return (-0.18, -0.78)
    add_cyl("panzer_tube", xz(origin, -0.55, z + 0.04, y), 0.13, 1.35, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, vertices=14)
    add_cyl("panzer_rear", xz(origin, 0.14, z + 0.04, y), 0.18, 0.24, m["dark"], rot=(0, math.pi / 2, 0), parent=parent, vertices=14)
    add_cyl("panzer_warhead", xz(origin, -1.30, z + 0.04, y), 0.20, 0.36, m["olive"], rot=(0, math.pi / 2, 0), parent=parent, vertices=14)
    add_box("panzer_grip", xz(origin, -0.38, z - 0.28, y), (0.16, 0.20, 0.38), m["dark"], rot=(0, 0.10, 0), parent=parent, bevel_width=0.02)
    add_box("panzer_sight", xz(origin, -0.48, z + 0.22, y), (0.20, 0.10, 0.10), m["gunmetal"], parent=parent, bevel_width=0.02)
    return (-0.20, -0.80)


def build_frame(origin, action, frame, count, weapon, m):
    p = pose(action, frame, count)
    base = root(f"matthias_{weapon}_{action}_{frame:02d}", origin)
    crouch = p["crouch"]
    body_z = p["bob"] - crouch
    hip_z = 0.86 + body_z

    legs = (("rear", 0.14, p["leg_a"], p["lift_a"], 0.06), ("front", -0.14, p["leg_b"], p["lift_b"], -0.06))
    for side, sx, angle, lift, y in legs:
        knee_x = sx + math.sin(angle) * 0.20
        knee_z = 0.53 + lift * 0.55 + body_z * 0.18
        foot_x = sx + math.sin(angle) * 0.36
        foot_z = 0.12 + lift + p["jump"] * 0.08
        segment(f"{side}_thigh", origin, (sx, hip_z), (knee_x, knee_z), 0.20, 0.20, m["uniform2"], base, y=y)
        segment(f"{side}_shin", origin, (knee_x, knee_z), (foot_x, foot_z + 0.10), 0.18, 0.19, m["uniform"], base, y=y - 0.02)
        add_box(f"{side}_boot", xz(origin, foot_x - 0.07, foot_z, y - 0.03), (0.36, 0.28, 0.18), m["boot"], parent=base, bevel_width=0.04)

    add_box("pelvis", xz(origin, 0.30, 0.88 + body_z, 0.02), (0.48, 0.38, 0.28), m["uniform"], parent=base, bevel_width=0.06)
    add_box("torso", xz(origin, 0.32, 1.34 + body_z, 0.02), (0.60, 0.44, 0.78), m["uniform"], rot=(0, p["lean"], 0), parent=base, bevel_width=0.08)
    add_box("vest", xz(origin, 0.18, 1.34 + body_z, -0.26), (0.44, 0.09, 0.55), m["armor"], parent=base, bevel_width=0.04)
    add_box("pouch", xz(origin, 0.36, 1.08 + body_z, -0.31), (0.17, 0.10, 0.17), m["armor"], parent=base, bevel_width=0.03)

    add_sphere("face", xz(origin, 0.27, 1.92 + body_z, -0.20), (0.40, 0.34, 0.42), m["skin"], parent=base, segments=18, rings=9)
    add_sphere("nose", xz(origin, 0.04, 1.91 + body_z, -0.31), (0.10, 0.09, 0.11), m["skin"], parent=base, segments=10, rings=6)
    add_sphere("helmet", xz(origin, 0.31, 2.12 + body_z, -0.02), (0.56, 0.42, 0.34), m["helmet"], parent=base, segments=18, rings=9)
    add_box("helmet_brim", xz(origin, 0.06, 2.00 + body_z, -0.22), (0.34, 0.10, 0.07), m["helmet"], parent=base, bevel_width=0.02)
    add_box("brow", xz(origin, 0.10, 1.96 + body_z, -0.37), (0.12, 0.04, 0.035), m["helmet"], rot=(0, 0.08, 0), parent=base, bevel_width=0.01)
    add_box("eye", xz(origin, 0.05, 1.91 + body_z, -0.39), (0.035, 0.03, 0.035), m["dark"], parent=base, bevel_width=0.005)
    add_sphere("badge_head", xz(origin, 0.31, 2.18 + body_z, -0.24), (0.07, 0.04, 0.07), m["badge"], parent=base, segments=10, rings=6)
    add_box("badge_base", xz(origin, 0.31, 2.10 + body_z, -0.24), (0.12, 0.04, 0.04), m["badge"], parent=base, bevel_width=0.01)

    weapon_z = 1.47 + body_z - crouch * 0.04
    rear_grip_x, support_x = add_weapon(weapon, origin, base, m, weapon_z)
    segment("rear_upper_arm", origin, (0.23, 1.61 + body_z), (-0.02, 1.48 + body_z), 0.15, 0.16, m["uniform"], base, y=-0.22)
    segment("rear_forearm", origin, (-0.02, 1.48 + body_z), (rear_grip_x, weapon_z - 0.03), 0.13, 0.15, m["armor"], base, y=-0.36)
    segment("front_upper_arm", origin, (0.16, 1.56 + body_z), (-0.26, 1.39 + body_z), 0.15, 0.16, m["uniform2"], base, y=-0.27)
    segment("front_forearm", origin, (-0.26, 1.39 + body_z), (support_x, weapon_z - 0.04), 0.13, 0.15, m["armor"], base, y=-0.39)
    add_sphere("rear_hand", xz(origin, rear_grip_x, weapon_z - 0.03, -0.52), (0.15, 0.11, 0.15), m["skin"], parent=base, segments=10, rings=6)
    add_sphere("front_hand", xz(origin, support_x, weapon_z - 0.04, -0.53), (0.15, 0.11, 0.15), m["skin"], parent=base, segments=10, rings=6)
    return base


def setup_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = COLS * CELL_PX
    scene.render.resolution_y = ROWS * CELL_PX
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.035, 0.045, 0.065, 1.0)
        bg.inputs["Strength"].default_value = 0.42
    try:
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass

    center = Vector(((COLS - 1) * CELL / 2.0, 0.0, -(ROWS - 1) * CELL / 2.0 + 1.30))
    bpy.ops.object.camera_add(location=(center.x, -38.0, center.z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = COLS * CELL
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    def light(name, kind, loc, energy, size, color):
        bpy.ops.object.light_add(type=kind, location=loc)
        obj = bpy.context.object
        obj.name = name
        obj.data.energy = energy
        obj.data.color = color
        if hasattr(obj.data, "size"):
            obj.data.size = size
        if kind == "AREA" and hasattr(obj.data, "shape"):
            obj.data.shape = "DISK"
        obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
        return obj

    light("key", "AREA", (center.x - 9, -15, center.z + 11), 1050, 28, (1.0, 0.92, 0.84))
    light("fill", "AREA", (center.x + 10, -11, center.z + 4), 620, 30, (0.66, 0.80, 1.0))
    light("rim", "AREA", (center.x - 4, 10, center.z + 8), 900, 24, (0.40, 0.62, 1.0))
    return scene


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()
    m = mats()
    for row, (action, count) in enumerate(ACTIONS):
        for frame in range(count):
            origin = (frame * CELL + 0.12, 0.0, -row * CELL)
            build_frame(origin, action, frame, count, cfg.weapon, m)
    blend_path = out / f"matthias_{cfg.weapon}_integrated_v1.blend"
    png_path = out / f"matthias_{cfg.weapon}_atlas_v1.png"
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {blend_path}")
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
