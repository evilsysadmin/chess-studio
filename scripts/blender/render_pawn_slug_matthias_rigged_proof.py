#!/usr/bin/env python3
"""Render proof frames for a combat-authored, weapon-integrated Pawn Slug Matthias.

The proof keeps Matthias' canonical head/cap/face and rig identity, but deliberately
re-authors the body for small side-scroller sprites. Home's glossy pawn body reads
well in a portrait and poorly at gameplay scale, so Pawn Slug gets a matte,
asymmetric combat silhouette with chunkier limbs, visible grips and per-weapon
stance/recoil. Weapons remain part of the Blender scene before rasterization; there
is never a runtime weapon overlay in this pipeline.
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

from home_matthias_parts import build_character, box, cyl, cyl_between, mat, parent_bone, sphere
from pawn_slug_matthias_premium_common import WEAPONS, clear_scene, mats as combat_mats
from pawn_slug_matthias_premium_weapons import add_weapon

POSES = ("idle", "run", "crouch", "jump", "fire")
BODY_LIFT = 0.56
CANONICAL_HEAD_PREFIXES = (
    "Head",
    "Eye.",
    "Brow.",
    "Mouth.",
    "Classic cap ",
)


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
    add_bone(armature, "thigh.L", (-0.19, 0.02, 0.20), (-0.20, 0.01, -0.11), "root")
    add_bone(armature, "shin.L", (-0.20, 0.01, -0.11), (-0.17, 0.00, -0.44), "thigh.L")
    add_bone(armature, "foot.L", (-0.17, 0.00, -0.44), (-0.32, -0.12, -0.49), "shin.L")
    add_bone(armature, "thigh.R", (0.19, 0.05, 0.20), (0.20, 0.04, -0.11), "root")
    add_bone(armature, "shin.R", (0.20, 0.04, -0.11), (0.17, 0.03, -0.44), "thigh.R")
    add_bone(armature, "foot.R", (0.17, 0.03, -0.44), (0.32, -0.09, -0.49), "shin.R")
    add_bone(armature, "weapon_socket", (0.0, -0.17, 0.84), (-0.34, -0.17, 0.84), "spine")
    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")


def keep_only_canonical_head():
    """Hide Home portrait geometry that turns into a glossy chess-piece blob at 96px."""
    kept = []
    hidden = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if obj.name.startswith(CANONICAL_HEAD_PREFIXES):
            kept.append(obj.name)
            continue
        obj.hide_render = True
        obj.hide_viewport = True
        hidden.append(obj.name)
    if not any(name == "Head" for name in kept):
        raise RuntimeError("canonical Matthias head missing from combat proof")
    return kept, hidden


def combat_materials():
    return {
        "cloth": mat("combat matte navy", (0.018, 0.026, 0.041), .68, .03),
        "cloth_hi": mat("combat navy edge", (0.045, 0.064, 0.092), .58, .04),
        "leather": mat("combat black leather", (0.014, 0.012, 0.011), .46, .10),
        "brass": mat("combat muted brass", (0.46, 0.27, 0.070), .34, .62),
        "glove": mat("combat gloves", (0.055, 0.050, 0.045), .72, .02),
        "sole": mat("combat boot sole", (0.010, 0.010, 0.012), .78, .02),
    }


def add_combat_body(rig):
    m = combat_materials()

    # Broad but angular torso: fewer glossy revolved surfaces, stronger silhouette.
    torso = box("Combat torso", (0.0, 0.015, 0.83), (0.335, 0.215, 0.315), m["cloth"], bevel=0.070)
    chest = box("Combat chest panel", (0.0, -0.205, 0.88), (0.255, 0.030, 0.205), m["cloth_hi"], bevel=0.026)
    belt = box("Combat belt", (0.0, -0.015, 0.575), (0.355, 0.225, 0.050), m["leather"], bevel=0.018)
    buckle = box("Combat buckle", (0.0, -0.250, 0.575), (0.070, 0.025, 0.052), m["brass"], bevel=0.010)
    collar = cyl("Combat collar", (0.0, 0.0, 1.105), 0.265, 0.075, m["cloth_hi"], verts=64, bevel=0.010)
    collar_ring = cyl("Combat collar brass", (0.0, 0.0, 1.145), 0.270, 0.018, m["brass"], verts=64, bevel=0.004)
    strap = box("Combat sling", (0.105, -0.235, 0.86), (0.030, 0.018, 0.245), m["leather"], rot=(0.0, math.radians(-9), math.radians(-7)), bevel=0.010)
    for obj in (torso, chest, belt, buckle, collar, collar_ring, strap):
        parent_bone(obj, rig, "spine")

    shoulder_l = (-0.30, 0.07, 0.98)
    elbow_l = (-0.39, 0.02, 0.83)
    wrist_l = (-0.34, -0.08, 0.72)
    shoulder_r = (0.30, 0.07, 0.98)
    elbow_r = (0.39, 0.02, 0.83)
    wrist_r = (0.34, -0.08, 0.72)

    upper_l = cyl_between("Combat upper arm.L", shoulder_l, elbow_l, 0.060, m["cloth"], 36, 0.010)
    upper_r = cyl_between("Combat upper arm.R", shoulder_r, elbow_r, 0.060, m["cloth"], 36, 0.010)
    fore_l = cyl_between("Combat forearm.L", elbow_l, wrist_l, 0.056, m["cloth_hi"], 36, 0.010)
    fore_r = cyl_between("Combat forearm.R", elbow_r, wrist_r, 0.056, m["cloth_hi"], 36, 0.010)
    cuff_l = sphere("Combat cuff.L", wrist_l, (0.070, 0.060, 0.065), m["brass"], 24)
    cuff_r = sphere("Combat cuff.R", wrist_r, (0.070, 0.060, 0.065), m["brass"], 24)
    parent_bone(upper_l, rig, "upper_arm.L")
    parent_bone(upper_r, rig, "upper_arm.R")
    for obj in (fore_l, cuff_l):
        parent_bone(obj, rig, "forearm.L")
    for obj in (fore_r, cuff_r):
        parent_bone(obj, rig, "forearm.R")

    specs = {
        "L": ((-0.19, 0.02, 0.20), (-0.20, 0.01, -0.11), (-0.17, 0.00, -0.44), -0.035),
        "R": ((0.19, 0.05, 0.20), (0.20, 0.04, -0.11), (0.17, 0.03, -0.44), 0.035),
    }
    for side, (hip, knee, ankle, depth) in specs.items():
        upper = cyl_between(f"Combat thigh.{side}", hip, knee, 0.105, m["cloth"], 36, 0.012)
        knee_cap = sphere(f"Combat knee.{side}", knee, (0.115, 0.098, 0.105), m["cloth_hi"], 28)
        lower = cyl_between(f"Combat shin.{side}", knee, ankle, 0.085, m["cloth_hi"], 36, 0.010)
        boot = box(
            f"Combat boot.{side}",
            (ankle[0] - 0.060, -0.095 + depth, ankle[2] - 0.035),
            (0.175, 0.135, 0.085),
            m["leather"],
            rot=(0.0, math.radians(5 if side == "L" else -5), 0.0),
            bevel=0.026,
        )
        sole = box(
            f"Combat sole.{side}",
            (ankle[0] - 0.070, -0.102 + depth, ankle[2] - 0.105),
            (0.190, 0.145, 0.027),
            m["sole"],
            bevel=0.010,
        )
        parent_bone(upper, rig, f"thigh.{side}")
        parent_bone(knee_cap, rig, f"thigh.{side}")
        parent_bone(lower, rig, f"shin.{side}")
        parent_bone(boot, rig, f"foot.{side}")
        parent_bone(sole, rig, f"foot.{side}")

    return m


def add_integrated_weapon(rig, weapon, body_mats):
    weapon_root = bpy.data.objects.new(f"PawnSlugWeapon.{weapon}", None)
    bpy.context.collection.objects.link(weapon_root)
    weapon_root["pawn_slug_integrated_weapon"] = weapon
    weapon_root["runtime_overlay"] = False

    z_by_weapon = {
        "pistol": 0.87,
        "machinegun": 0.84,
        "shotgun": 0.86,
        "panzerfaust": 0.96,
    }
    weapon_z = z_by_weapon[weapon]
    rear_grip_x, front_grip_x = add_weapon(
        weapon,
        (0.0, 0.0, 0.0),
        weapon_root,
        combat_mats(),
        weapon_z,
    )
    parent_bone(weapon_root, rig, "weapon_socket")

    # Hands are authored into the same rasterized scene and ride the same socket,
    # so the gun can never visually detach from Matthias during a pose.
    rear = sphere(
        f"Combat weapon hand rear.{weapon}",
        (rear_grip_x, -0.585, weapon_z - (0.10 if weapon == "pistol" else 0.055)),
        (0.066, 0.050, 0.062),
        body_mats["glove"],
        28,
    )
    front = sphere(
        f"Combat weapon hand front.{weapon}",
        (front_grip_x, -0.590, weapon_z - (0.01 if weapon != "panzerfaust" else 0.045)),
        (0.066, 0.050, 0.062),
        body_mats["glove"],
        28,
    )
    parent_bone(rear, rig, "weapon_socket")
    parent_bone(front, rig, "weapon_socket")
    return weapon_root


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (0.001, 0.001, 0.001) if bone.name.startswith("prop_") else (1.0, 1.0, 1.0)


def apply_weapon_stance(rig, weapon):
    d = math.radians
    stances = {
        "pistol": {
            "ur": (-24, -5, 21), "fr": (-48, -2, -20),
            "ul": (-27, 4, -18), "fl": (-44, 2, 23),
            "socket": (0, -2, 0), "socket_z": 0.02,
        },
        "machinegun": {
            "ur": (-18, -4, 17), "fr": (-38, -2, -18),
            "ul": (-20, 3, -28), "fl": (-35, 1, 31),
            "socket": (0, -4, 2), "socket_z": 0.00,
        },
        "shotgun": {
            "ur": (-22, -5, 18), "fr": (-42, -2, -19),
            "ul": (-19, 3, -34), "fl": (-30, 1, 36),
            "socket": (0, -5, 3), "socket_z": 0.02,
        },
        "panzerfaust": {
            "ur": (-13, -4, 14), "fr": (-30, -2, -13),
            "ul": (-15, 3, -31), "fl": (-25, 1, 33),
            "socket": (0, -7, 4), "socket_z": 0.10,
        },
    }
    s = stances[weapon]
    rig.pose.bones["upper_arm.R"].rotation_euler = tuple(d(v) for v in s["ur"])
    rig.pose.bones["forearm.R"].rotation_euler = tuple(d(v) for v in s["fr"])
    rig.pose.bones["upper_arm.L"].rotation_euler = tuple(d(v) for v in s["ul"])
    rig.pose.bones["forearm.L"].rotation_euler = tuple(d(v) for v in s["fl"])
    rig.pose.bones["weapon_socket"].rotation_euler = tuple(d(v) for v in s["socket"])
    rig.pose.bones["weapon_socket"].location.z = s["socket_z"]


def apply_pose(rig, pose_name, weapon):
    reset_pose(rig)
    apply_weapon_stance(rig, weapon)
    d = math.radians

    # Visible movement is intentionally exaggerated for the final 96px target.
    if pose_name == "idle":
        rig.pose.bones["spine"].rotation_euler = (d(1), d(-3), d(-2))
        rig.pose.bones["head"].rotation_euler = (d(-1), d(3), d(1))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(4)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-4)
        return

    if pose_name == "run":
        rig.pose.bones["root"].rotation_euler = (0.0, d(-9), d(-2))
        rig.pose.bones["root"].location.x = -0.035
        rig.pose.bones["spine"].rotation_euler = (d(2), d(-11), d(-5))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(7), d(3))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(46)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-30)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-40)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(34)
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(-4)
        return

    if pose_name == "crouch":
        rig.pose.bones["root"].location.z = -0.28
        rig.pose.bones["root"].location.x = 0.035
        rig.pose.bones["spine"].rotation_euler = (d(3), d(-12), d(-4))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(7), d(2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(36)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-52)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-25)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(48)
        rig.pose.bones["weapon_socket"].location.z -= 0.07
        return

    if pose_name == "jump":
        rig.pose.bones["root"].location.z = 0.28
        rig.pose.bones["spine"].rotation_euler = (d(-2), d(8), d(3))
        rig.pose.bones["head"].rotation_euler = (d(-4), d(-5), d(-2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(52)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-66)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-18)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(54)
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(5)
        return

    if pose_name == "fire":
        recoil = {
            "pistol": 0.075,
            "machinegun": 0.045,
            "shotgun": 0.115,
            "panzerfaust": 0.155,
        }[weapon]
        kick = {
            "pistol": 4,
            "machinegun": 3,
            "shotgun": 7,
            "panzerfaust": 10,
        }[weapon]
        rig.pose.bones["root"].rotation_euler[1] = d(4 + kick * 0.35)
        rig.pose.bones["spine"].rotation_euler = (d(-1), d(6 + kick * 0.45), d(3))
        rig.pose.bones["head"].rotation_euler = (d(-3), d(-4), d(-2))
        rig.pose.bones["weapon_socket"].location.x += recoil
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(kick)
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(-9)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(12)
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
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.30
    except Exception:
        try:
            scene.view_settings.view_transform = "Standard"
            scene.view_settings.exposure = 0.28
        except Exception:
            pass

    target = Vector((0.0, 0.0, 1.18))
    bpy.ops.object.camera_add(location=(0.0, -9.0, target.z))
    camera = bpy.context.object
    camera.name = "PawnSlugRigProofCamera"
    camera.data.type = "ORTHO"
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.ortho_scale = 2.72
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

    # Matte readable key/fill with a narrow warm rim: shape first, highlights second.
    area("combat proof key", (-2.4, -4.2, 4.1), 560, 3.2, (1.0, 0.82, 0.62))
    area("combat proof fill", (2.8, -2.6, 2.7), 300, 3.0, (0.48, 0.67, 1.0))
    area("combat proof rim", (1.6, 2.8, 3.8), 420, 2.2, (1.0, 0.39, 0.17))
    return scene


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()
    rig = build_character()
    extend_combat_rig(rig)
    keep_only_canonical_head()
    body_mats = add_combat_body(rig)
    add_integrated_weapon(rig, cfg.weapon, body_mats)

    rig.location.z = BODY_LIFT
    rig.rotation_euler.z = math.radians(-8.5)
    rig["pawn_slug_combat_proof"] = "canonical-head-combat-body-integrated-weapon-v2"
    rig["target_runtime_px"] = 96
    rig["runtime_overlay"] = False

    for pose_name in POSES:
        apply_pose(rig, pose_name, cfg.weapon)
        bpy.context.view_layer.update()
        output = out / f"matthias_{cfg.weapon}_rigged_{pose_name}_proof.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print("Wrote", output)


if __name__ == "__main__":
    main()
