#!/usr/bin/env python3
"""Render the canonical chibi Matthias runtime banks for Pawn Slug.

The approved Pawn Slug language is a compact arcade soldier: oversized warm-ivory
Matthias head, broad officer cap, stocky black tactical body and one weapon baked
into every frame.  This renderer intentionally does not reuse the old tall
"human tactical" body and never relies on a runtime head/weapon overlay.
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

from home_matthias_parts import (
    box,
    crescent_visor,
    cyl,
    cyl_between,
    elliptic_cyl,
    front_ellipse,
    front_prism,
    iron_cross_points,
    loft_ellipse,
    mat,
    parent_bone,
    sphere,
)
from pawn_slug_matthias_premium_common import WEAPONS, clear_scene, mats as weapon_mats
from pawn_slug_matthias_premium_weapons import add_weapon

ACTIONS = (
    ("idle", 10),
    ("walk", 10),
    ("run", 16),
    ("crouch", 10),
    ("jump", 9),
)
CELL_PX = 192
BODY_LIFT = 0.28


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-canonical-chibi")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    parser.add_argument("--profile", choices=("proof", "runtime"), default="runtime")
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def add_bone(armature, name, head, tail, parent=None):
    item = armature.edit_bones.new(name)
    item.head = head
    item.tail = tail
    if parent:
        item.parent = armature.edit_bones[parent]
    return item


def build_rig():
    armature = bpy.data.armatures.new("PawnSlugCanonicalChibiRig")
    rig = bpy.data.objects.new("PawnSlugCanonicalChibiRig", armature)
    bpy.context.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")

    add_bone(armature, "root", (0, 0, 0.35), (0, 0, 0.62))
    add_bone(armature, "spine", (0, 0, 0.62), (0, 0, 1.19), "root")
    add_bone(armature, "head", (0, 0, 1.15), (0, 0, 1.73), "spine")

    add_bone(armature, "upper_arm.L", (-0.34, 0.01, 1.09), (-0.43, -0.05, 0.96), "spine")
    add_bone(armature, "forearm.L", (-0.43, -0.05, 0.96), (-0.34, -0.18, 0.88), "upper_arm.L")
    add_bone(armature, "upper_arm.R", (0.34, 0.02, 1.09), (0.43, -0.04, 0.96), "spine")
    add_bone(armature, "forearm.R", (0.43, -0.04, 0.96), (0.34, -0.17, 0.88), "upper_arm.R")

    add_bone(armature, "thigh.L", (-0.17, 0.02, 0.62), (-0.18, 0.02, 0.37), "root")
    add_bone(armature, "shin.L", (-0.18, 0.02, 0.37), (-0.17, 0.01, 0.14), "thigh.L")
    add_bone(armature, "foot.L", (-0.17, 0.01, 0.14), (-0.34, -0.10, 0.08), "shin.L")
    add_bone(armature, "thigh.R", (0.17, 0.04, 0.62), (0.18, 0.04, 0.37), "root")
    add_bone(armature, "shin.R", (0.18, 0.04, 0.37), (0.17, 0.03, 0.14), "thigh.R")
    add_bone(armature, "foot.R", (0.17, 0.03, 0.14), (0.34, -0.08, 0.08), "shin.R")

    add_bone(armature, "weapon_socket", (0.0, -0.14, 0.98), (-0.40, -0.14, 0.98), "spine")

    bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def materials():
    return {
        "skin": mat("slug canonical warm ivory", (0.66, 0.48, 0.29), .36, .02),
        "skin_hi": mat("slug canonical ivory highlight", (0.82, 0.65, 0.42), .30, .02),
        "black": mat("slug canonical face black", (0.002, 0.003, 0.004), .42, .03),
        "navy": mat("slug canonical cap navy", (0.006, 0.010, 0.020), .22, .25),
        "navy2": mat("slug canonical cap highlight", (0.018, 0.026, 0.045), .28, .18),
        "band": mat("slug canonical cap leather band", (0.105, 0.035, 0.017), .36, .08),
        "brass": mat("slug canonical brass", (0.58, 0.34, 0.085), .24, .82),
        "cloth": mat("slug canonical tactical cloth", (0.012, 0.017, 0.025), .72, .05),
        "cloth2": mat("slug canonical tactical charcoal", (0.035, 0.045, 0.060), .62, .08),
        "armor": mat("slug canonical armor", (0.024, 0.030, 0.039), .38, .30),
        "armor_hi": mat("slug canonical armor highlight", (0.070, 0.078, 0.090), .42, .30),
        "webbing": mat("slug canonical webbing", (0.055, 0.050, 0.045), .58, .08),
        "glove": mat("slug canonical glove", (0.018, 0.018, 0.021), .46, .12),
        "boot": mat("slug canonical boot", (0.014, 0.013, 0.015), .40, .18),
        "sole": mat("slug canonical boot sole", (0.004, 0.004, 0.005), .78, .02),
    }


def build_head(rig, m):
    head = sphere("Canonical chibi head", (0.0, -0.015, 1.48), (0.43, 0.31, 0.36), m["skin"], 72)
    parent_bone(head, rig, "head")

    for side, x, brow_angle in (("L", -0.135, -18), ("R", 0.135, 18)):
        eye = front_ellipse(f"Canonical eye.{side}", (x, -0.323, 1.49), 0.033, 0.061, 0.018, m["black"], 32, .002)
        brow = box(
            f"Canonical brow.{side}",
            (x, -0.344, 1.615),
            (0.082, 0.014, 0.018),
            m["black"],
            rot=(0, math.radians(brow_angle), 0),
            bevel=.006,
        )
        parent_bone(eye, rig, "head")
        parent_bone(brow, rig, "head")
    mouth = box("Canonical stern mouth", (0.0, -0.347, 1.355), (0.060, 0.012, 0.012), m["black"], bevel=.004)
    parent_bone(mouth, rig, "head")

    crown = loft_ellipse(
        "Canonical cap crown",
        [
            (.39, .285, 1.70, .005),
            (.42, .298, 1.755, .018),
            (.45, .310, 1.805, .050),
            (.47, .315, 1.845, .085),
            (.455, .305, 1.88, .110),
        ],
        m["navy"],
        112,
        .010,
    )
    top = elliptic_cyl("Canonical cap top", (0.0, 0.105, 1.885), .445, .072, .72, m["navy2"], rot=(math.radians(-3), 0, 0), verts=112, bevel=.012)
    band = elliptic_cyl("Canonical cap band", (0.0, -0.005, 1.715), .395, .072, .76, m["band"], rot=(math.radians(-2), 0, 0), verts=108, bevel=.008)
    brass_line = elliptic_cyl("Canonical cap brass line", (0.0, -0.010, 1.682), .397, .014, .76, m["brass"], verts=108, bevel=.003)
    visor = crescent_visor("Canonical cap visor", (0.0, -0.010, 1.69), m["navy"], .33, .48, .20, .25, .034, 10, 48)
    badge = front_ellipse("Canonical cap badge", (0.0, -0.335, 1.77), .052, .064, .012, m["brass"], 40, .003)
    wing_l = box("Canonical cap badge wing.L", (-.085, -.333, 1.775), (.058, .008, .014), m["brass"], rot=(0, math.radians(-12), math.radians(12)), bevel=.003)
    wing_r = box("Canonical cap badge wing.R", (.085, -.333, 1.775), (.058, .008, .014), m["brass"], rot=(0, math.radians(12), math.radians(-12)), bevel=.003)
    for obj in (crown, top, band, brass_line, visor, badge, wing_l, wing_r):
        parent_bone(obj, rig, "head")


def build_body(rig, m):
    torso = box("Canonical compact torso", (0.0, 0.02, 0.98), (0.36, 0.22, 0.29), m["cloth"], bevel=.10)
    abdomen = box("Canonical compact abdomen", (0.0, 0.025, 0.73), (0.31, 0.20, 0.12), m["cloth2"], bevel=.06)
    collar = cyl("Canonical tactical collar", (0.0, 0.0, 1.245), .245, .080, m["cloth2"], verts=56, bevel=.014)
    carrier = box("Canonical plate carrier", (0.0, -0.225, 0.99), (0.31, 0.070, 0.245), m["armor"], bevel=.050)
    carrier_hi = box("Canonical carrier plate", (0.0, -0.292, 1.03), (0.245, 0.018, 0.150), m["armor_hi"], bevel=.022)
    belt = box("Canonical tactical belt", (0.0, -0.005, 0.675), (0.335, 0.22, 0.048), m["webbing"], bevel=.018)
    buckle = box("Canonical belt buckle", (0.0, -0.238, 0.675), (0.052, 0.016, 0.040), m["brass"], bevel=.008)
    cross = front_prism("Canonical shoulder-style cross chest", (0.105, -0.317, 1.04), iron_cross_points(.060), .014, m["brass"], .003)
    for obj in (torso, abdomen, collar, carrier, carrier_hi, belt, buckle, cross):
        parent_bone(obj, rig, "spine")

    for i, x in enumerate((-0.245, -0.122, 0.0, 0.122, 0.245)):
        pouch = box(f"Canonical pouch.{i}", (x, -0.255, 0.745), (0.052, 0.045, 0.075), m["webbing"], bevel=.018)
        parent_bone(pouch, rig, "spine")
    pack = box("Canonical small backpack", (0.0, 0.215, 0.96), (0.27, 0.10, 0.25), m["armor"], bevel=.055)
    parent_bone(pack, rig, "spine")

    arm_specs = {
        "L": ((-0.35, 0.00, 1.10), (-0.46, -0.055, 0.98), (-0.35, -0.17, 0.90)),
        "R": ((0.35, 0.02, 1.10), (0.46, -0.045, 0.98), (0.35, -0.16, 0.90)),
    }
    for side, (shoulder, elbow, wrist) in arm_specs.items():
        shoulder_pad = sphere(f"Canonical shoulder pad.{side}", shoulder, (0.13, 0.095, 0.12), m["armor"], 36)
        upper = cyl_between(f"Canonical upper arm.{side}", shoulder, elbow, .085, m["cloth"], 36, .015)
        elbow_pad = sphere(f"Canonical elbow pad.{side}", elbow, (0.088, 0.072, 0.082), m["armor_hi"], 30)
        fore = cyl_between(f"Canonical forearm.{side}", elbow, wrist, .080, m["cloth2"], 36, .014)
        glove = sphere(f"Canonical glove.{side}", wrist, (0.090, 0.068, 0.082), m["glove"], 30)
        parent_bone(shoulder_pad, rig, f"upper_arm.{side}")
        parent_bone(upper, rig, f"upper_arm.{side}")
        parent_bone(elbow_pad, rig, f"forearm.{side}")
        parent_bone(fore, rig, f"forearm.{side}")
        parent_bone(glove, rig, f"forearm.{side}")

    leg_specs = {
        "L": ((-0.17, 0.02, 0.61), (-0.18, 0.01, 0.37), (-0.17, 0.00, 0.14), -0.015),
        "R": ((0.17, 0.04, 0.61), (0.18, 0.03, 0.37), (0.17, 0.02, 0.14), 0.015),
    }
    for side, (hip, knee, ankle, depth) in leg_specs.items():
        thigh = cyl_between(f"Canonical thigh.{side}", hip, knee, .115, m["cloth"], 36, .018)
        thigh_plate = box(f"Canonical thigh plate.{side}", (knee[0], knee[1] - .075, .48), (.095, .060, .110), m["armor"], bevel=.030)
        knee_pad = sphere(f"Canonical knee pad.{side}", (knee[0], knee[1] - .075, knee[2]), (.105, .072, .090), m["armor_hi"], 30)
        shin = cyl_between(f"Canonical shin.{side}", knee, ankle, .100, m["cloth2"], 36, .016)
        boot = box(
            f"Canonical combat boot.{side}",
            (ankle[0] - .060, -.090 + depth, ankle[2] - .020),
            (.175, .145, .105),
            m["boot"],
            rot=(0, math.radians(6 if side == "L" else -6), 0),
            bevel=.035,
        )
        sole = box(f"Canonical boot sole.{side}", (ankle[0] - .065, -.095 + depth, ankle[2] - .105), (.185, .152, .025), m["sole"], bevel=.008)
        parent_bone(thigh, rig, f"thigh.{side}")
        parent_bone(thigh_plate, rig, f"thigh.{side}")
        parent_bone(knee_pad, rig, f"shin.{side}")
        parent_bone(shin, rig, f"shin.{side}")
        parent_bone(boot, rig, f"foot.{side}")
        parent_bone(sole, rig, f"foot.{side}")


def add_integrated_weapon(rig, weapon, m):
    root = bpy.data.objects.new(f"PawnSlugCanonicalWeapon.{weapon}", None)
    bpy.context.collection.objects.link(root)
    root["pawn_slug_integrated_weapon"] = weapon
    root["runtime_overlay"] = False
    z = {"pistol": 1.00, "machinegun": 1.00, "shotgun": 1.01, "panzerfaust": 1.09}[weapon]
    rear_x, front_x = add_weapon(weapon, (0.0, 0.0, 0.0), root, weapon_mats(), z)
    parent_bone(root, rig, "weapon_socket")

    rear = sphere(f"Canonical rear grip hand.{weapon}", (rear_x, -0.625, z - .035), (.088, .062, .080), m["glove"], 30)
    front = sphere(f"Canonical front grip hand.{weapon}", (front_x, -0.630, z - .010), (.088, .062, .080), m["glove"], 30)
    parent_bone(rear, rig, "weapon_socket")
    parent_bone(front, rig, "weapon_socket")


def reset_pose(rig):
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = (0.0, 0.0, 0.0)
        bone.location = (0.0, 0.0, 0.0)
        bone.scale = (1.0, 1.0, 1.0)


def weapon_stance(rig, weapon):
    d = math.radians
    spec = {
        "pistol": ((-24, -5, 18), (-44, -2, -17), (-24, 3, -17), (-42, 2, 20), -2, 1),
        "machinegun": ((-19, -5, 18), (-37, -2, -16), (-20, 3, -29), (-35, 1, 31), -3, 2),
        "shotgun": ((-21, -5, 19), (-39, -2, -17), (-19, 3, -35), (-31, 1, 36), -4, 3),
        "panzerfaust": ((-12, -4, 14), (-28, -2, -12), (-15, 3, -31), (-25, 1, 33), -6, 4),
    }[weapon]
    ur, fr, ul, fl, yaw, roll = spec
    rig.pose.bones["upper_arm.R"].rotation_euler = tuple(d(x) for x in ur)
    rig.pose.bones["forearm.R"].rotation_euler = tuple(d(x) for x in fr)
    rig.pose.bones["upper_arm.L"].rotation_euler = tuple(d(x) for x in ul)
    rig.pose.bones["forearm.L"].rotation_euler = tuple(d(x) for x in fl)
    rig.pose.bones["weapon_socket"].rotation_euler = (0.0, d(yaw), d(roll))


def apply_frame_pose(rig, weapon, action, frame, count):
    reset_pose(rig)
    weapon_stance(rig, weapon)
    d = math.radians
    phase = (frame / max(1, count)) * math.tau
    stride = math.sin(phase)

    if action == "idle":
        rig.pose.bones["root"].location.z = 0.010 * (1.0 - math.cos(phase))
        rig.pose.bones["root"].rotation_euler[1] = d(-5)
        rig.pose.bones["spine"].rotation_euler[1] = d(-7)
        rig.pose.bones["head"].rotation_euler[1] = d(4)
        return

    if action in {"walk", "run"}:
        # Keep the canonical face/cap and tactical torso visually locked while
        # the legs carry the motion. The previous run pose was a touch too
        # elastic at 192 px, making the silhouette read as a costume swap when
        # sampled quickly in Godot.
        amp = 28 if action == "walk" else 46
        shin = 24 if action == "walk" else 38
        bob = .018 if action == "walk" else .026
        rig.pose.bones["root"].rotation_euler[1] = d(-9 if action == "walk" else -11)
        rig.pose.bones["spine"].rotation_euler[1] = d(-7 if action == "walk" else -9)
        rig.pose.bones["head"].rotation_euler[1] = d(4 if action == "walk" else 6)
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(amp * stride)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-amp * stride)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-shin * max(0.0, stride) + 10 * max(0.0, -stride))
        rig.pose.bones["shin.R"].rotation_euler[1] = d(-shin * max(0.0, -stride) + 10 * max(0.0, stride))
        rig.pose.bones["foot.L"].rotation_euler[1] = d(-14 * stride)
        rig.pose.bones["foot.R"].rotation_euler[1] = d(14 * stride)
        rig.pose.bones["root"].location.z = bob * abs(math.sin(phase * 2.0))
        rig.pose.bones["weapon_socket"].rotation_euler[2] += d(1.0 * math.sin(phase * 2.0))
        return

    if action == "crouch":
        blend = min(1.0, frame / max(1, count - 1) * 1.4)
        rig.pose.bones["root"].location.z = -0.22 * blend
        rig.pose.bones["root"].rotation_euler[1] = d(-10)
        rig.pose.bones["spine"].rotation_euler[1] = d(-13)
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(40 * blend)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-54 * blend)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-28 * blend)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(50 * blend)
        rig.pose.bones["weapon_socket"].location.z -= .06 * blend
        return

    progress = frame / max(1, count - 1)
    arc = math.sin(progress * math.pi)
    tuck = math.sin(progress * math.pi)
    rig.pose.bones["root"].location.z = .08 + .28 * arc
    rig.pose.bones["root"].rotation_euler[1] = d(-3 + 8 * (progress - .5))
    rig.pose.bones["spine"].rotation_euler[1] = d(-5)
    rig.pose.bones["thigh.L"].rotation_euler[1] = d(28 + 28 * tuck)
    rig.pose.bones["shin.L"].rotation_euler[1] = d(-42 - 18 * tuck)
    rig.pose.bones["thigh.R"].rotation_euler[1] = d(-17 + 12 * tuck)
    rig.pose.bones["shin.R"].rotation_euler[1] = d(38 + 14 * tuck)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = CELL_PX
    scene.render.resolution_y = CELL_PX
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = .38
    except Exception:
        pass

    target = Vector((-0.10, 0.0, 1.12))
    bpy.ops.object.camera_add(location=(0.0, -8.7, 1.15))
    camera = bpy.context.object
    camera.name = "PawnSlugCanonicalChibiCamera"
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = 2.55
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

    area("canonical warm key", (-2.6, -4.6, 4.0), 620, 3.2, (1.0, .72, .46))
    area("canonical cool fill", (3.0, -2.9, 2.7), 330, 3.0, (.42, .60, 1.0))
    area("canonical rim", (1.6, 2.8, 3.7), 470, 2.2, (1.0, .34, .12))
    return scene


def build_character(weapon):
    clear_scene()
    scene = setup_scene()
    rig = build_rig()
    m = materials()
    build_head(rig, m)
    build_body(rig, m)
    add_integrated_weapon(rig, weapon, m)

    rig.location.z = BODY_LIFT
    rig.rotation_euler.z = math.radians(-8.0)
    rig.rotation_euler.x = math.radians(1.5)
    rig["pawn_slug_runtime_art"] = "canonical-chibi-matthias-v3"
    rig["pawn_slug_canonical_identity"] = "approved-head-cap-stocky-tactical"
    rig["runtime_overlay"] = False
    rig["runtime_cell_px"] = CELL_PX
    return scene, rig


def render_frame(scene, rig, out, weapon, action, frame, count):
    apply_frame_pose(rig, weapon, action, frame, count)
    bpy.context.view_layer.update()
    output = out / f"matthias_{weapon}_{action}_{frame:02d}.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print("Wrote", output)


def render_proof(scene, rig, out, weapon):
    render_frame(scene, rig, out, weapon, "idle", 0, 10)
    for frame in (0, 4, 8, 12):
        render_frame(scene, rig, out, weapon, "run", frame, 16)


def render_runtime(scene, rig, out, weapon):
    for action, count in ACTIONS:
        for frame in range(count):
            render_frame(scene, rig, out, weapon, action, frame, count)


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    scene, rig = build_character(cfg.weapon)
    if cfg.profile == "proof":
        render_proof(scene, rig, out, cfg.weapon)
    else:
        render_runtime(scene, rig, out, cfg.weapon)


if __name__ == "__main__":
    main()
