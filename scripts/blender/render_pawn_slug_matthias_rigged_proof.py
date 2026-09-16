#!/usr/bin/env python3
"""Render human tactical Matthias proofs for Pawn Slug.

Pawn Slug deliberately does not use Matthias' chess-pawn body. The mode gets a
human arcade-soldier interpretation: canonical Matthias face/cap identity, black
tactical clothing, readable human limbs and one weapon baked into every rendered
sprite. There is never a runtime weapon overlay.
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
from pawn_slug_matthias_premium_common import WEAPONS, clear_scene, mats as weapon_mats
from pawn_slug_matthias_premium_weapons import add_weapon

POSES = ("idle", "run", "crouch", "jump", "fire")
BODY_LIFT = 0.66
CANONICAL_HEAD_PREFIXES = ("Head", "Eye.", "Brow.", "Mouth.", "Classic cap ")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-rigged-proof")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def add_bone(armature, name, head, tail, parent=None):
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = tail
    if parent:
        bone.parent = armature.edit_bones[parent]
    return bone


def extend_human_rig(rig):
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    armature = rig.data

    # Longer, clearly human lower body. Root/spine/head/arms come from canonical Matthias.
    add_bone(armature, "thigh.L", (-0.16, 0.03, 0.53), (-0.17, 0.02, 0.18), "root")
    add_bone(armature, "shin.L", (-0.17, 0.02, 0.18), (-0.16, 0.01, -0.18), "thigh.L")
    add_bone(armature, "foot.L", (-0.16, 0.01, -0.18), (-0.31, -0.12, -0.24), "shin.L")
    add_bone(armature, "thigh.R", (0.16, 0.05, 0.53), (0.17, 0.04, 0.18), "root")
    add_bone(armature, "shin.R", (0.17, 0.04, 0.18), (0.16, 0.03, -0.18), "thigh.R")
    add_bone(armature, "foot.R", (0.16, 0.03, -0.18), (0.31, -0.10, -0.24), "shin.R")
    add_bone(armature, "weapon_socket", (0.0, -0.15, 0.94), (-0.36, -0.15, 0.94), "spine")

    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")


def keep_only_matthias_face_and_cap():
    kept = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        keep = obj.name.startswith(CANONICAL_HEAD_PREFIXES)
        obj.hide_render = not keep
        obj.hide_viewport = not keep
        if keep:
            kept.append(obj.name)
    if "Head" not in kept:
        raise RuntimeError("canonical Matthias face missing")


def tactical_materials():
    return {
        "uniform": mat("slug tactical black cloth", (0.012, 0.016, 0.022), .82, .01),
        "uniform2": mat("slug tactical charcoal", (0.030, 0.038, 0.050), .72, .02),
        "carrier": mat("slug plate carrier", (0.020, 0.024, 0.030), .88, .02),
        "webbing": mat("slug webbing", (0.045, 0.048, 0.052), .84, .01),
        "glove": mat("slug tactical glove", (0.018, 0.018, 0.020), .80, .01),
        "boot": mat("slug combat boot", (0.012, 0.011, 0.012), .70, .03),
        "sole": mat("slug boot sole", (0.005, 0.005, 0.006), .92, .00),
        "metal": mat("slug subdued metal", (0.12, 0.13, 0.14), .48, .36),
        "brass": mat("slug Matthias brass accent", (0.42, 0.23, 0.055), .42, .48),
    }


def add_human_tactical_body(rig):
    m = tactical_materials()

    # Human torso: shoulder width > waist, no revolved chess silhouette.
    torso = box("Tactical torso", (0.0, 0.025, 0.88), (0.285, 0.170, 0.300), m["uniform"], bevel=0.075)
    abdomen = box("Tactical abdomen", (0.0, 0.035, 0.62), (0.235, 0.155, 0.130), m["uniform2"], bevel=0.050)
    carrier = box("Plate carrier", (0.0, -0.175, 0.89), (0.245, 0.055, 0.225), m["carrier"], bevel=0.040)
    carrier_lower = box("Plate carrier lower", (0.0, -0.185, 0.72), (0.220, 0.050, 0.080), m["webbing"], bevel=0.025)
    belt = box("Tactical belt", (0.0, 0.000, 0.535), (0.250, 0.175, 0.045), m["webbing"], bevel=0.018)
    buckle = box("Tactical buckle", (0.0, -0.190, 0.535), (0.055, 0.020, 0.040), m["metal"], bevel=0.008)
    collar = cyl("Tactical collar", (0.0, 0.0, 1.15), 0.205, 0.065, m["uniform2"], verts=48, bevel=0.010)
    chest_id = box("Matthias chest accent", (0.105, -0.237, 0.92), (0.030, 0.014, 0.065), m["brass"], bevel=0.006)
    sling = box("Weapon sling", (-0.055, -0.225, 0.86), (0.024, 0.014, 0.255), m["webbing"], rot=(0, math.radians(7), math.radians(7)), bevel=0.008)
    for obj in (torso, abdomen, carrier, carrier_lower, belt, buckle, collar, chest_id, sling):
        parent_bone(obj, rig, "spine")

    # Human arms: shoulders, upper arms, elbows, forearms, gloves.
    arm_specs = {
        "L": ((-0.285, 0.035, 1.00), (-0.405, -0.005, 0.86), (-0.360, -0.115, 0.73)),
        "R": ((0.285, 0.055, 1.00), (0.405, 0.005, 0.86), (0.360, -0.105, 0.73)),
    }
    for side, (shoulder, elbow, wrist) in arm_specs.items():
        shoulder_pad = sphere(f"Shoulder pad.{side}", shoulder, (0.095, 0.080, 0.090), m["carrier"], 28)
        upper = cyl_between(f"Upper arm.{side}", shoulder, elbow, 0.065, m["uniform"], 32, 0.010)
        elbow_pad = sphere(f"Elbow pad.{side}", elbow, (0.073, 0.065, 0.070), m["uniform2"], 24)
        fore = cyl_between(f"Forearm.{side}", elbow, wrist, 0.060, m["uniform2"], 32, 0.009)
        glove = sphere(f"Tactical glove.{side}", wrist, (0.073, 0.058, 0.070), m["glove"], 26)
        parent_bone(shoulder_pad, rig, f"upper_arm.{side}")
        parent_bone(upper, rig, f"upper_arm.{side}")
        parent_bone(elbow_pad, rig, f"forearm.{side}")
        parent_bone(fore, rig, f"forearm.{side}")
        parent_bone(glove, rig, f"forearm.{side}")

    # Human legs: separated hips/thighs/knees/shins, chunky boots for 96px readability.
    leg_specs = {
        "L": ((-0.145, 0.025, 0.53), (-0.165, 0.015, 0.18), (-0.155, 0.005, -0.18), -0.020),
        "R": ((0.145, 0.045, 0.53), (0.165, 0.035, 0.18), (0.155, 0.025, -0.18), 0.020),
    }
    for side, (hip, knee, ankle, depth) in leg_specs.items():
        thigh = cyl_between(f"Tactical thigh.{side}", hip, knee, 0.092, m["uniform"], 32, 0.012)
        knee_pad = box(f"Knee pad.{side}", (knee[0], knee[1] - 0.075, knee[2]), (0.085, 0.055, 0.075), m["carrier"], bevel=0.025)
        shin = cyl_between(f"Tactical shin.{side}", knee, ankle, 0.078, m["uniform2"], 32, 0.010)
        boot = box(
            f"Combat boot.{side}",
            (ankle[0] - 0.055, -0.085 + depth, ankle[2] - 0.035),
            (0.155, 0.120, 0.085),
            m["boot"],
            rot=(0.0, math.radians(6 if side == "L" else -6), 0.0),
            bevel=0.025,
        )
        sole = box(f"Boot sole.{side}", (ankle[0] - 0.065, -0.090 + depth, ankle[2] - 0.105), (0.168, 0.128, 0.024), m["sole"], bevel=0.008)
        parent_bone(thigh, rig, f"thigh.{side}")
        parent_bone(knee_pad, rig, f"shin.{side}")
        parent_bone(shin, rig, f"shin.{side}")
        parent_bone(boot, rig, f"foot.{side}")
        parent_bone(sole, rig, f"foot.{side}")

    return m


def add_integrated_weapon(rig, weapon, body_mats):
    root = bpy.data.objects.new(f"PawnSlugWeapon.{weapon}", None)
    bpy.context.collection.objects.link(root)
    root["pawn_slug_integrated_weapon"] = weapon
    root["runtime_overlay"] = False

    z = {"pistol": 0.93, "machinegun": 0.90, "shotgun": 0.91, "panzerfaust": 1.00}[weapon]
    rear_x, front_x = add_weapon(weapon, (0.0, 0.0, 0.0), root, weapon_mats(), z)
    parent_bone(root, rig, "weapon_socket")

    # Extra grip silhouettes are attached to the weapon socket, therefore baked with it.
    hand_z = z - (0.095 if weapon == "pistol" else 0.040)
    rear_hand = sphere(f"Rear grip hand.{weapon}", (rear_x, -0.595, hand_z), (0.070, 0.052, 0.068), body_mats["glove"], 24)
    front_hand = sphere(f"Front grip hand.{weapon}", (front_x, -0.600, z - 0.010), (0.070, 0.052, 0.068), body_mats["glove"], 24)
    parent_bone(rear_hand, rig, "weapon_socket")
    parent_bone(front_hand, rig, "weapon_socket")
    return root


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (0.001, 0.001, 0.001) if bone.name.startswith("prop_") else (1.0, 1.0, 1.0)


def weapon_stance(rig, weapon):
    d = math.radians
    spec = {
        "pistol": ((-29, -5, 24), (-52, -2, -21), (-28, 4, -20), (-47, 2, 25), -2, 1),
        "machinegun": ((-20, -5, 20), (-41, -2, -18), (-22, 3, -31), (-37, 1, 34), -4, 2),
        "shotgun": ((-23, -5, 21), (-44, -2, -19), (-20, 3, -38), (-33, 1, 40), -5, 3),
        "panzerfaust": ((-15, -4, 16), (-32, -2, -14), (-17, 3, -35), (-27, 1, 37), -7, 5),
    }[weapon]
    ur, fr, ul, fl, yaw, roll = spec
    rig.pose.bones["upper_arm.R"].rotation_euler = tuple(d(x) for x in ur)
    rig.pose.bones["forearm.R"].rotation_euler = tuple(d(x) for x in fr)
    rig.pose.bones["upper_arm.L"].rotation_euler = tuple(d(x) for x in ul)
    rig.pose.bones["forearm.L"].rotation_euler = tuple(d(x) for x in fl)
    rig.pose.bones["weapon_socket"].rotation_euler = (0.0, d(yaw), d(roll))


def apply_pose(rig, pose, weapon):
    reset_pose(rig)
    weapon_stance(rig, weapon)
    d = math.radians

    if pose == "idle":
        rig.pose.bones["root"].rotation_euler = (0, d(-6), d(-1))
        rig.pose.bones["spine"].rotation_euler = (d(1), d(-7), d(-3))
        rig.pose.bones["head"].rotation_euler = (d(-1), d(5), d(2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(5)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-7)
        return

    if pose == "run":
        rig.pose.bones["root"].rotation_euler = (0, d(-13), d(-3))
        rig.pose.bones["root"].location.x = -0.045
        rig.pose.bones["spine"].rotation_euler = (d(2), d(-13), d(-6))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(8), d(3))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(55)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-38)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-47)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(39)
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(-5)
        return

    if pose == "crouch":
        rig.pose.bones["root"].location.z = -0.30
        rig.pose.bones["root"].rotation_euler[1] = d(-10)
        rig.pose.bones["spine"].rotation_euler = (d(3), d(-15), d(-5))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(8), d(2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(43)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-58)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-31)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(54)
        rig.pose.bones["weapon_socket"].location.z -= 0.08
        return

    if pose == "jump":
        rig.pose.bones["root"].location.z = 0.31
        rig.pose.bones["root"].rotation_euler[1] = d(8)
        rig.pose.bones["spine"].rotation_euler = (d(-3), d(10), d(4))
        rig.pose.bones["head"].rotation_euler = (d(-4), d(-6), d(-2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(60)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-70)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-22)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(59)
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(6)
        return

    if pose == "fire":
        recoil = {"pistol": 0.075, "machinegun": 0.045, "shotgun": 0.12, "panzerfaust": 0.16}[weapon]
        kick = {"pistol": 5, "machinegun": 3, "shotgun": 8, "panzerfaust": 11}[weapon]
        rig.pose.bones["root"].rotation_euler[1] = d(6 + kick * 0.30)
        rig.pose.bones["spine"].rotation_euler = (d(-1), d(8 + kick * 0.45), d(4))
        rig.pose.bones["head"].rotation_euler = (d(-3), d(-6), d(-2))
        rig.pose.bones["weapon_socket"].location.x += recoil
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(kick)
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(-10)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(14)
        return

    raise ValueError(pose)


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
        scene.view_settings.exposure = 0.20
    except Exception:
        pass

    target = Vector((0.0, 0.0, 1.18))
    bpy.ops.object.camera_add(location=(0.0, -9.2, target.z))
    camera = bpy.context.object
    camera.name = "PawnSlugHumanMatthiasCamera"
    camera.data.type = "ORTHO"
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.ortho_scale = 2.82
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

    area("human slug key", (-2.4, -4.4, 4.0), 500, 3.0, (1.0, 0.82, 0.64))
    area("human slug fill", (2.9, -2.8, 2.6), 260, 2.8, (0.48, 0.65, 1.0))
    area("human slug rim", (1.7, 2.8, 3.8), 390, 2.0, (1.0, 0.38, 0.16))
    return scene


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()

    rig = build_character()
    extend_human_rig(rig)
    keep_only_matthias_face_and_cap()
    mats = add_human_tactical_body(rig)
    add_integrated_weapon(rig, cfg.weapon, mats)

    rig.location.z = BODY_LIFT
    # Three-quarter side-scroller stance; source still faces left for runtime mirroring.
    rig.rotation_euler.z = math.radians(-11.0)
    rig.rotation_euler.x = math.radians(1.5)
    rig["pawn_slug_combat_proof"] = "human-tactical-matthias-v1"
    rig["pawn_slug_body_language"] = "human-arcade-soldier"
    rig["target_runtime_px"] = 96
    rig["runtime_overlay"] = False

    for pose in POSES:
        apply_pose(rig, pose, cfg.weapon)
        bpy.context.view_layer.update()
        output = out / f"matthias_{cfg.weapon}_rigged_{pose}_proof.png"
        scene.render.filepath = str(output)
        bpy.ops.render.render(write_still=True)
        print("Wrote", output)


if __name__ == "__main__":
    main()
