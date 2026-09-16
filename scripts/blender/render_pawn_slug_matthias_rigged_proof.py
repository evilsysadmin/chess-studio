#!/usr/bin/env python3
"""Render small proof frames for a rigged, weapon-integrated Pawn Slug Matthias.

This is deliberately a proof generator, not a runtime asset producer. It reuses
Matthias' canonical Home character/rig, adds compact combat legs plus a weapon
socket, equips one real Blender-authored weapon, and renders representative poses.
The weapon is part of the Blender scene before rasterization; runtime overlays are
not part of this pipeline.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from home_matthias_parts import build_character, box, cyl_between, parent_bone, sphere
from pawn_slug_matthias_premium_common import WEAPONS, clear_scene, mats as combat_mats
from pawn_slug_matthias_premium_weapons import add_weapon

POSES = ("idle", "run", "crouch", "jump")
BODY_LIFT = 0.56


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-rigged-proof")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def add_bone(armature, name, head, tail, parent=None):
    item = armature.edit_bones.new(name)
    item.head = head
    item.tail = tail
    if parent:
        item.parent = armature.edit_bones[parent]
    return item


def extend_combat_rig(rig):
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    armature = rig.data
    add_bone(armature, "thigh.L", (-0.18, 0.02, 0.20), (-0.20, 0.01, -0.10), "root")
    add_bone(armature, "shin.L", (-0.20, 0.01, -0.10), (-0.16, 0.00, -0.40), "thigh.L")
    add_bone(armature, "foot.L", (-0.16, 0.00, -0.40), (-0.28, -0.10, -0.46), "shin.L")
    add_bone(armature, "thigh.R", (0.18, 0.05, 0.20), (0.20, 0.04, -0.10), "root")
    add_bone(armature, "shin.R", (0.20, 0.04, -0.10), (0.16, 0.03, -0.40), "thigh.R")
    add_bone(armature, "foot.R", (0.16, 0.03, -0.40), (0.28, -0.07, -0.46), "shin.R")
    add_bone(armature, "weapon_socket", (0.0, -0.16, 0.79), (-0.34, -0.16, 0.79), "spine")
    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")


def add_combat_legs(rig):
    navy = bpy.data.materials.get("classic navy cloth")
    brass = bpy.data.materials.get("classic aged brass")
    leather = bpy.data.materials.get("classic black leather")
    if not all((navy, brass, leather)):
        raise RuntimeError("canonical Home Matthias materials unavailable")

    specs = {
        "L": ((-0.18, 0.02, 0.20), (-0.20, 0.01, -0.10), (-0.16, 0.00, -0.40), -0.04),
        "R": ((0.18, 0.05, 0.20), (0.20, 0.04, -0.10), (0.16, 0.03, -0.40), 0.04),
    }
    for side, (hip, knee, ankle, depth) in specs.items():
        upper = cyl_between(f"Combat thigh.{side}", hip, knee, 0.085, navy, 36, 0.010)
        knee_cap = sphere(f"Combat knee.{side}", knee, (0.105, 0.090, 0.105), brass, 30)
        lower = cyl_between(f"Combat shin.{side}", knee, ankle, 0.072, navy, 36, 0.009)
        boot = box(
            f"Combat boot.{side}",
            (ankle[0] - 0.045, -0.075 + depth, ankle[2] - 0.035),
            (0.145, 0.115, 0.070),
            leather,
            rot=(0.0, math.radians(4 if side == "L" else -4), 0.0),
            bevel=0.018,
        )
        parent_bone(upper, rig, f"thigh.{side}")
        parent_bone(knee_cap, rig, f"thigh.{side}")
        parent_bone(lower, rig, f"shin.{side}")
        parent_bone(boot, rig, f"foot.{side}")


def add_integrated_weapon(rig, weapon):
    weapon_root = bpy.data.objects.new(f"PawnSlugWeapon.{weapon}", None)
    bpy.context.collection.objects.link(weapon_root)
    weapon_root["pawn_slug_integrated_weapon"] = weapon
    weapon_root["runtime_overlay"] = False
    add_weapon(weapon, (0.0, 0.0, 0.0), weapon_root, combat_mats(), 0.82)
    parent_bone(weapon_root, rig, "weapon_socket")
    return weapon_root


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        if bone.name.startswith("prop_"):
            bone.scale = (0.001, 0.001, 0.001)
        else:
            bone.scale = (1.0, 1.0, 1.0)


def apply_weapon_stance(rig, weapon):
    d = math.radians
    spread = {
        "pistol": 0.0,
        "machinegun": 1.0,
        "shotgun": 1.35,
        "panzerfaust": 1.65,
    }[weapon]
    rig.pose.bones["upper_arm.R"].rotation_euler = (d(-18), d(-3), d(18))
    rig.pose.bones["forearm.R"].rotation_euler = (d(-38), d(-2), d(-19))
    rig.pose.bones["upper_arm.L"].rotation_euler = (d(-14 - spread * 3), d(2), d(-18 - spread * 6))
    rig.pose.bones["forearm.L"].rotation_euler = (d(-30 - spread * 5), d(1), d(18 + spread * 8))
    rig.pose.bones["weapon_socket"].rotation_euler = (0.0, d(-1.5 * spread), d(1.0 * spread))


def apply_pose(rig, pose_name, weapon):
    reset_pose(rig)
    apply_weapon_stance(rig, weapon)
    d = math.radians
    if pose_name == "idle":
        rig.pose.bones["spine"].rotation_euler = (d(1.2), 0.0, d(-1.0))
        rig.pose.bones["head"].rotation_euler = (d(-1.0), d(1.0), d(0.6))
        return
    if pose_name == "run":
        rig.pose.bones["root"].rotation_euler = (0.0, d(-4), 0.0)
        rig.pose.bones["spine"].rotation_euler = (d(4.0), 0.0, d(-2.0))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(31)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-18)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-28)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(24)
        rig.pose.bones["head"].rotation_euler = (d(-2.0), d(2.0), d(1.0))
        return
    if pose_name == "crouch":
        rig.pose.bones["root"].location.z = -0.18
        rig.pose.bones["spine"].rotation_euler = (d(7), 0.0, d(-2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(25)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-35)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-20)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(32)
        return
    if pose_name == "jump":
        rig.pose.bones["root"].location.z = 0.24
        rig.pose.bones["spine"].rotation_euler = (d(-3), 0.0, d(1))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(38)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-52)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(31)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(-46)
        rig.pose.bones["head"].rotation_euler = (d(-3), d(2), 0.0)
        return
    raise ValueError(pose_name)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = 384
    scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    try:
        scene.view_settings.view_transform = "Standard"
        scene.view_settings.exposure = 0.40
    except Exception:
        pass

    target = Vector((0.0, 0.0, 1.20))
    bpy.ops.object.camera_add(location=(0.0, -9.0, target.z))
    camera = bpy.context.object
    camera.name = "PawnSlugRigProofCamera"
    camera.data.type = "ORTHO"
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.ortho_scale = 3.05
    look_at(camera, target)
    scene.camera = camera

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        look_at(obj, target)

    area("combat proof key", (-2.2, -4.0, 4.0), 720, 3.0, (1.0, 0.80, 0.58))
    area("combat proof fill", (2.6, -2.4, 2.5), 410, 2.8, (0.52, 0.70, 1.0))
    area("combat proof rim", (1.4, 2.6, 3.6), 560, 2.4, (1.0, 0.42, 0.20))
    return scene


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()
    rig = build_character()
    extend_combat_rig(rig)
    add_combat_legs(rig)
    add_integrated_weapon(rig, cfg.weapon)
    rig.location.z = BODY_LIFT
    rig["pawn_slug_combat_proof"] = "canonical-home-rig-plus-integrated-weapon-v1"

    for pose_name in POSES:
        apply_pose(rig, pose_name, cfg.weapon)
        bpy.context.view_layer.update()
        output = out / f"matthias_{cfg.weapon}_rigged_{pose_name}_proof.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print("Wrote", output)


if __name__ == "__main__":
    main()
