#!/usr/bin/env python3
"""Build canonical Pawn Slug Matthias art in Blender.

The weapon is part of the rendered Matthias model. Runtime must never bolt a
second weapon sprite on top of him. The atlas keeps the existing 16-column
animation contract and stacks 4 weapon banks x 5 action rows.

Run with:
  blender --background --python scripts/blender/build_pawn_slug_matthias_integrated.py -- --output-dir /tmp/pawn-slug-art --weapon machinegun
"""
from __future__ import annotations

import argparse
import math
import os
from pathlib import Path

import bpy
COLS = 16
ROWS_PER_WEAPON = 5
WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
ACTIONS = (
    ("idle", 10),
    ("walk", 10),
    ("run", 16),
    ("crouch", 10),
    ("jump", 9),
)
CELL_W = 96
CELL_H = 96
WORLD_CELL_X = 2.55
WORLD_CELL_Z = 2.55
TOTAL_ROWS = ROWS_PER_WEAPON


def args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-art")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    argv = []
    if "--" in os.sys.argv:
        argv = os.sys.argv[os.sys.argv.index("--") + 1 :]
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        # orphan purge will deal with anything still referenced
        pass


def mat(name: str, rgba: tuple[float, float, float, float], metallic=0.0, roughness=0.55):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = rgba
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Roughness"].default_value = roughness
    return m


def cube(name, loc, scale, material, rot=(0.0, 0.0, 0.0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if material:
        obj.data.materials.append(material)
    parent_keep_world(obj, parent)
    return obj


def cyl(name, loc, radius, depth, material, rot=(0.0, 0.0, 0.0), vertices=12, parent=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot)
    obj = bpy.context.object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    parent_keep_world(obj, parent)
    return obj


def sphere(name, loc, scale, material, segments=16, rings=8, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if material:
        obj.data.materials.append(material)
    parent_keep_world(obj, parent)
    return obj


def root(name, loc):
    obj = bpy.data.objects.new(name, None)
    obj.location = loc
    bpy.context.collection.objects.link(obj)
    return obj


def xz(origin, x, z, y=0.0):
    return (origin[0] + x, origin[1] + y, origin[2] + z)


def parent_keep_world(obj, parent):
    if not parent:
        return obj
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world
    return obj


def add_pawn_badge(origin, parent, ivory, y=-0.245):
    # Small physical pawn mark on the helmet front; readable at 96px without text textures.
    sphere("helmet_badge_head", xz(origin, 0.0, 2.11, y), (0.075, 0.035, 0.075), ivory, segments=10, rings=6, parent=parent)
    cyl("helmet_badge_neck", xz(origin, 0.0, 2.015, y), 0.055, 0.09, ivory, rot=(math.pi / 2, 0, 0), vertices=10, parent=parent)
    cube("helmet_badge_base", xz(origin, 0.0, 1.94, y), (0.115, 0.035, 0.035), ivory, parent=parent)


def limb_box(name, origin, center, length, thickness, angle, material, parent, depth=0.19):
    # Rectangle aligned in X/Z. Blender rotation is around Y for screen-plane limbs.
    return cube(
        name,
        xz(origin, center[0], center[1], center[2] if len(center) > 2 else 0.0),
        (length / 2, depth, thickness / 2),
        material,
        rot=(0.0, -angle, 0.0),
        parent=parent,
    )


def pose(action: str, frame: int, count: int):
    t = (frame / max(1, count)) * math.tau
    stride = math.sin(t)
    lift_a = max(0.0, math.sin(t))
    lift_b = max(0.0, math.sin(t + math.pi))
    if action == "idle":
        bob = 0.018 * math.sin(t)
        return dict(body_z=bob, lean=0.0, l_leg=-0.05, r_leg=0.05, l_lift=0.0, r_lift=0.0, crouch=0.0, jump=0.0)
    if action == "walk":
        return dict(body_z=0.03 * abs(stride), lean=-0.035, l_leg=0.34 * stride, r_leg=-0.34 * stride, l_lift=0.11 * lift_a, r_lift=0.11 * lift_b, crouch=0.0, jump=0.0)
    if action == "run":
        return dict(body_z=0.055 * abs(stride), lean=-0.085, l_leg=0.62 * stride, r_leg=-0.62 * stride, l_lift=0.22 * lift_a, r_lift=0.22 * lift_b, crouch=0.0, jump=0.0)
    if action == "crouch":
        blend = min(1.0, frame / max(1, count - 1) * 1.35)
        return dict(body_z=-0.22 * blend, lean=-0.04, l_leg=0.06, r_leg=-0.06, l_lift=0.0, r_lift=0.0, crouch=0.46 * blend, jump=0.0)
    # authored jump arc: takeoff -> apex -> landing; legs visibly tuck.
    phase = frame / max(1, count - 1)
    jump = math.sin(phase * math.pi) * 0.38
    tuck = math.sin(phase * math.pi) * 0.42
    return dict(body_z=jump, lean=-0.04, l_leg=-0.12 + tuck, r_leg=0.10 - tuck, l_lift=0.12 + tuck * 0.2, r_lift=0.12 + tuck * 0.2, crouch=0.10 * math.sin(phase * math.pi), jump=jump)


def add_weapon(weapon: str, origin, parent, mats, z=1.35):
    gunmetal, dark, polymer, olive, brass = mats
    # Weapon group is physically parented to Matthias' root and rendered in the same pass.
    g = root(f"weapon_{weapon}", xz(origin, 0, 0, -0.025))
    parent_keep_world(g, parent)
    if weapon == "pistol":
        cube("p99_slide", xz(origin, 0.63, z, -0.07), (0.34, 0.11, 0.09), gunmetal, parent=g)
        cube("p99_frame", xz(origin, 0.56, z - 0.14, -0.07), (0.24, 0.105, 0.07), polymer, parent=g)
        cube("p99_grip", xz(origin, 0.43, z - 0.31, -0.07), (0.105, 0.11, 0.22), polymer, rot=(0, -0.16, 0), parent=g)
        cube("p99_ejection", xz(origin, 0.64, z + 0.07, -0.185), (0.08, 0.018, 0.025), brass, parent=g)
        cube("p99_front_sight", xz(origin, 0.87, z + 0.105, -0.07), (0.02, 0.02, 0.025), dark, parent=g)
        cube("p99_rear_sight", xz(origin, 0.38, z + 0.105, -0.07), (0.025, 0.02, 0.025), dark, parent=g)
        cyl("p99_muzzle", xz(origin, 0.98, z, -0.07), 0.055, 0.12, dark, rot=(0, math.pi / 2, 0), vertices=12, parent=g)
    elif weapon == "machinegun":
        cube("smg_receiver", xz(origin, 0.66, z, -0.07), (0.43, 0.12, 0.12), gunmetal, parent=g)
        cyl("smg_barrel", xz(origin, 1.17, z + 0.015, -0.07), 0.055, 0.42, gunmetal, rot=(0, math.pi / 2, 0), vertices=12, parent=g)
        cube("smg_handguard", xz(origin, 0.99, z - 0.01, -0.07), (0.16, 0.13, 0.13), polymer, parent=g)
        cube("smg_mag", xz(origin, 0.62, z - 0.27, -0.07), (0.085, 0.09, 0.23), dark, rot=(0, -0.08, 0), parent=g)
        cube("smg_grip", xz(origin, 0.42, z - 0.24, -0.07), (0.09, 0.10, 0.18), polymer, rot=(0, -0.16, 0), parent=g)
        cube("smg_stock", xz(origin, 0.17, z + 0.02, -0.07), (0.22, 0.055, 0.055), dark, parent=g)
        cube("smg_stock_pad", xz(origin, -0.02, z - 0.04, -0.07), (0.045, 0.09, 0.16), polymer, parent=g)
        cube("smg_sight", xz(origin, 0.77, z + 0.16, -0.07), (0.045, 0.035, 0.045), dark, parent=g)
    elif weapon == "shotgun":
        cube("shotgun_receiver", xz(origin, 0.62, z, -0.07), (0.35, 0.12, 0.12), gunmetal, parent=g)
        cyl("shotgun_barrel", xz(origin, 1.28, z + 0.04, -0.07), 0.052, 0.95, dark, rot=(0, math.pi / 2, 0), vertices=12, parent=g)
        cyl("shotgun_mag_tube", xz(origin, 1.20, z - 0.07, -0.07), 0.04, 0.72, gunmetal, rot=(0, math.pi / 2, 0), vertices=12, parent=g)
        cyl("shotgun_pump", xz(origin, 1.02, z - 0.02, -0.07), 0.105, 0.36, polymer, rot=(0, math.pi / 2, 0), vertices=12, parent=g)
        cube("shotgun_grip", xz(origin, 0.40, z - 0.22, -0.07), (0.09, 0.10, 0.18), polymer, rot=(0, -0.17, 0), parent=g)
        cube("shotgun_stock", xz(origin, 0.13, z - 0.02, -0.07), (0.25, 0.11, 0.13), polymer, rot=(0, 0.05, 0), parent=g)
    else:
        cyl("panzer_tube", xz(origin, 0.76, z + 0.02, -0.075), 0.14, 1.42, olive, rot=(0, math.pi / 2, 0), vertices=16, parent=g)
        cyl("panzer_rear", xz(origin, 0.03, z + 0.02, -0.075), 0.19, 0.19, dark, rot=(0, math.pi / 2, 0), vertices=16, parent=g)
        cyl("panzer_warhead", xz(origin, 1.56, z + 0.02, -0.075), 0.20, 0.36, olive, rot=(0, math.pi / 2, 0), vertices=16, parent=g)
        cube("panzer_grip", xz(origin, 0.63, z - 0.25, -0.075), (0.09, 0.10, 0.19), dark, rot=(0, -0.1, 0), parent=g)
        cube("panzer_sight", xz(origin, 0.74, z + 0.20, -0.075), (0.12, 0.05, 0.05), gunmetal, parent=g)
    return g


def build_matthias(origin, action: str, frame: int, count: int, weapon: str, materials):
    skin, black, black2, armor, boot, ivory, gunmetal, polymer, olive, brass = materials
    p = pose(action, frame, count)
    base = root(f"matthias_{weapon}_{action}_{frame:02d}", origin)

    body_z = p["body_z"] - p["crouch"]
    lean = p["lean"]
    # legs/feet: distinct contact and flight phases, no more rigid sliding.
    hip_z = 0.78 + body_z
    leg_len = 0.58 - p["crouch"] * 0.25
    for side, sx, angle, lift in (
        ("l", -0.18, p["l_leg"], p["l_lift"]),
        ("r", 0.18, p["r_leg"], p["r_lift"]),
    ):
        foot_x = sx + math.sin(angle) * 0.34
        foot_z = 0.18 + lift + p["jump"] * 0.16
        knee_x = sx + math.sin(angle) * 0.17
        knee_z = 0.49 + lift * 0.55 + body_z * 0.25
        limb_box(f"{side}_thigh", origin, ((sx + knee_x) / 2, (hip_z + knee_z) / 2), leg_len * 0.55, 0.22, -angle * 0.62, armor, base)
        limb_box(f"{side}_shin", origin, ((knee_x + foot_x) / 2, (knee_z + foot_z + 0.13) / 2), leg_len * 0.52, 0.20, angle * 0.72, black2, base)
        cube(f"{side}_boot", xz(origin, foot_x + 0.05, foot_z, -0.01), (0.19, 0.24, 0.105), boot, rot=(0, -0.03 + angle * 0.12, 0), parent=base)

    # torso and kit
    cube("pelvis", xz(origin, 0, 0.78 + body_z), (0.34, 0.21, 0.18), black2, rot=(0, lean, 0), parent=base)
    cube("torso", xz(origin, -0.02, 1.20 + body_z), (0.39, 0.22, 0.42), black, rot=(0, lean, 0), parent=base)
    cube("vest", xz(origin, 0.03, 1.20 + body_z, -0.21), (0.34, 0.05, 0.32), armor, rot=(0, lean, 0), parent=base)
    cube("pack", xz(origin, -0.22, 1.20 + body_z, 0.22), (0.24, 0.11, 0.28), black2, rot=(0, lean, 0), parent=base)
    cube("pouch_l", xz(origin, -0.24, 0.91 + body_z, -0.16), (0.10, 0.08, 0.11), armor, parent=base)
    cube("pouch_r", xz(origin, 0.18, 0.91 + body_z, -0.16), (0.10, 0.08, 0.11), armor, parent=base)

    # head and helmet
    cube("head", xz(origin, -0.02, 1.78 + body_z, -0.03), (0.32, 0.22, 0.29), skin, rot=(0, lean * 0.25, 0), parent=base)
    # dark hair strip + brows give the same stern Matthias readability at sprite scale.
    cube("hair", xz(origin, -0.10, 1.92 + body_z, -0.245), (0.26, 0.025, 0.09), black2, parent=base)
    cube("brow", xz(origin, 0.13, 1.82 + body_z, -0.255), (0.12, 0.018, 0.025), black2, parent=base)
    cube("eye", xz(origin, 0.21, 1.78 + body_z, -0.258), (0.025, 0.018, 0.025), black2, parent=base)
    sphere("helmet_dome", xz(origin, -0.02, 2.02 + body_z, 0.0), (0.39, 0.27, 0.30), black2, segments=18, rings=10, parent=base)
    cyl("helmet_brim", xz(origin, 0.0, 1.90 + body_z, -0.01), 0.38, 0.09, black2, rot=(math.pi / 2, 0, 0), vertices=18, parent=base)
    add_pawn_badge((origin[0], origin[1], origin[2] + body_z), base, ivory)

    # arms are posed around the integrated weapon, not around an invisible generic grip.
    weapon_z = 1.36 + body_z - p["crouch"] * 0.05
    if weapon == "panzerfaust":
        shoulder_z = 1.42 + body_z
        rear_x, front_x = 0.28, 0.92
    elif weapon == "shotgun":
        shoulder_z = 1.38 + body_z
        rear_x, front_x = 0.34, 0.84
    elif weapon == "machinegun":
        shoulder_z = 1.37 + body_z
        rear_x, front_x = 0.34, 0.78
    else:
        shoulder_z = 1.34 + body_z
        rear_x, front_x = 0.34, 0.62

    # upper arms / forearms, slightly separated in depth so hands read clearly.
    limb_box("rear_upper_arm", origin, (0.02, shoulder_z), 0.48, 0.19, -0.20, black, base, depth=0.17)
    limb_box("rear_forearm", origin, (rear_x, weapon_z), 0.44, 0.18, 0.03, armor, base, depth=0.17)
    limb_box("front_upper_arm", origin, (0.12, shoulder_z - 0.03, -0.03), 0.50, 0.19, -0.32, black, base, depth=0.16)
    limb_box("front_forearm", origin, (front_x - 0.13, weapon_z - 0.03, -0.03), max(0.35, front_x * 0.5), 0.18, 0.02, armor, base, depth=0.16)
    cube("rear_hand", xz(origin, rear_x + 0.14, weapon_z - 0.06, -0.19), (0.09, 0.07, 0.10), skin, parent=base)
    cube("front_hand", xz(origin, front_x, weapon_z - 0.05, -0.19), (0.09, 0.07, 0.10), skin, parent=base)

    add_weapon(weapon, origin, base, (gunmetal, black2, polymer, olive, brass), z=weapon_z)
    return base


def setup_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = COLS * CELL_W
    scene.render.resolution_y = TOTAL_ROWS * CELL_H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.world.color = (0.012, 0.014, 0.018)
    if hasattr(scene, "eevee"):
        try:
            scene.eevee.use_gtao = True
            scene.eevee.gtao_distance = 3
            scene.eevee.gtao_factor = 1.25
            scene.eevee.use_soft_shadows = True
        except Exception:
            pass

    # Camera matches pixel-art profile: mild orthographic three-quarter depth, no perspective pumping.
    center_x = (COLS - 1) * WORLD_CELL_X / 2
    center_z = -(TOTAL_ROWS - 1) * WORLD_CELL_Z / 2 + 1.08
    bpy.ops.object.camera_add(location=(center_x, -78, center_z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    # Blender orthographic scale is the camera width. Match the full 16-column
    # world width; the 1536:480 aspect then yields exactly the required 5-row height.
    cam.data.ortho_scale = COLS * WORLD_CELL_X
    cam.rotation_euler = (math.pi / 2, 0, 0)
    scene.camera = cam

    # Huge soft key + cool rim so every atlas cell gets identical premium lighting.
    bpy.ops.object.light_add(type="AREA", location=(center_x - 8, -12, center_z + 18))
    key = bpy.context.object
    key.data.energy = 2800
    key.data.shape = "RECTANGLE"
    key.data.size = 50
    key.data.size_y = 50
    key.rotation_euler = (math.radians(22), 0, math.radians(-10))

    bpy.ops.object.light_add(type="AREA", location=(center_x + 12, 8, center_z + 9))
    rim = bpy.context.object
    rim.data.energy = 1900
    rim.data.color = (0.34, 0.50, 0.78)
    rim.data.size = 60
    rim.rotation_euler = (math.radians(80), 0, math.radians(180))

    bpy.ops.object.light_add(type="AREA", location=(center_x, -8, center_z - 12))
    fill = bpy.context.object
    fill.data.energy = 850
    fill.data.color = (0.95, 0.62, 0.35)
    fill.data.size = 70
    return scene


def build_weapon(weapon):
    materials = (
        mat("skin", (0.77, 0.61, 0.49, 1), 0.0, 0.62),
        mat("uniform_black", (0.025, 0.030, 0.038, 1), 0.05, 0.50),
        mat("helmet_black", (0.012, 0.015, 0.020, 1), 0.18, 0.28),
        mat("armor", (0.085, 0.095, 0.105, 1), 0.15, 0.40),
        mat("boots", (0.020, 0.021, 0.024, 1), 0.10, 0.32),
        mat("badge", (0.80, 0.78, 0.70, 1), 0.20, 0.30),
        mat("gunmetal", (0.055, 0.065, 0.075, 1), 0.72, 0.24),
        mat("polymer", (0.020, 0.024, 0.029, 1), 0.05, 0.43),
        mat("olive", (0.19, 0.22, 0.15, 1), 0.28, 0.48),
        mat("brass", (0.40, 0.25, 0.08, 1), 0.72, 0.24),
    )
    for row, (action, count) in enumerate(ACTIONS):
        for frame in range(count):
            build_matthias((frame * WORLD_CELL_X, 0, -row * WORLD_CELL_Z), action, frame, count, weapon, materials)


def main():
    cfg = args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()
    build_weapon(cfg.weapon)
    blend_path = out / f"matthias_{cfg.weapon}_integrated_v1.blend"
    png_path = out / f"matthias_{cfg.weapon}_atlas_v1.png"
    scene.render.filepath = str(png_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {blend_path}")
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
