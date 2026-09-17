#!/usr/bin/env python3
"""Render Matthias in the approved Pawn Slug pistol-family visual language.

This is deliberately a thin art-direction layer over the existing canonical
renderer: atlas dimensions, animation timing and weapon models stay untouched.
Only Matthias' body/head proportions, materials and lighting are replaced so
SMG, Benelli and bazooka read as the same compact tactical pawn-sage as the
approved pistol art instead of a tall toy/police-uniform variant.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import render_pawn_slug_matthias_canonical_chibi as base
import render_pawn_slug_matthias_canonical_heavy as weighted

ORIGINAL_SETUP_SCENE = base.setup_scene


def build_rig():
    armature = base.bpy.data.armatures.new("PawnSlugPistolFamilyRig")
    rig = base.bpy.data.objects.new("PawnSlugPistolFamilyRig", armature)
    base.bpy.context.collection.objects.link(rig)
    base.bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    base.bpy.ops.object.mode_set(mode="EDIT")

    # Compact, low-centre silhouette matching the approved pistol family.
    base.add_bone(armature, "root", (0, 0, 0.42), (0, 0, 0.60))
    base.add_bone(armature, "spine", (0, 0, 0.60), (0, 0, 1.08), "root")
    base.add_bone(armature, "head", (0, 0, 1.02), (0, 0, 1.52), "spine")

    base.add_bone(armature, "upper_arm.L", (-0.30, 0.01, 1.00), (-0.39, -0.05, 0.91), "spine")
    base.add_bone(armature, "forearm.L", (-0.39, -0.05, 0.91), (-0.31, -0.17, 0.86), "upper_arm.L")
    base.add_bone(armature, "upper_arm.R", (0.30, 0.02, 1.00), (0.39, -0.04, 0.91), "spine")
    base.add_bone(armature, "forearm.R", (0.39, -0.04, 0.91), (0.31, -0.16, 0.86), "upper_arm.R")

    base.add_bone(armature, "thigh.L", (-0.15, 0.02, 0.58), (-0.15, 0.02, 0.43), "root")
    base.add_bone(armature, "shin.L", (-0.15, 0.02, 0.43), (-0.15, 0.01, 0.30), "thigh.L")
    base.add_bone(armature, "foot.L", (-0.15, 0.01, 0.30), (-0.28, -0.09, 0.25), "shin.L")
    base.add_bone(armature, "thigh.R", (0.15, 0.04, 0.58), (0.15, 0.04, 0.43), "root")
    base.add_bone(armature, "shin.R", (0.15, 0.04, 0.43), (0.15, 0.03, 0.30), "thigh.R")
    base.add_bone(armature, "foot.R", (0.15, 0.03, 0.30), (0.28, -0.08, 0.25), "shin.R")

    base.add_bone(armature, "weapon_socket", (0.0, -0.14, 0.94), (-0.38, -0.14, 0.94), "spine")

    base.bpy.ops.object.mode_set(mode="POSE")
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"
    base.bpy.ops.object.mode_set(mode="OBJECT")
    return rig


def materials():
    # Neutral blacks + warm ivory: remove the blue-police read from the old bank.
    return {
        "skin": base.mat("pistol family warm ivory", (0.61, 0.43, 0.26), .38, .01),
        "skin_hi": base.mat("pistol family ivory highlight", (0.78, 0.59, 0.36), .32, .01),
        "black": base.mat("pistol family facial black", (0.003, 0.003, 0.004), .40, .03),
        "navy": base.mat("pistol family cap black", (0.006, 0.008, 0.012), .25, .22),
        "navy2": base.mat("pistol family cap edge", (0.018, 0.021, 0.028), .30, .18),
        "band": base.mat("pistol family cap band", (0.055, 0.025, 0.014), .38, .06),
        "brass": base.mat("pistol family muted brass", (0.48, 0.27, 0.060), .28, .72),
        "cloth": base.mat("pistol family tactical black", (0.008, 0.010, 0.014), .76, .04),
        "cloth2": base.mat("pistol family tactical charcoal", (0.025, 0.029, 0.036), .66, .06),
        "armor": base.mat("pistol family armour", (0.018, 0.022, 0.028), .42, .22),
        "armor_hi": base.mat("pistol family armour edge", (0.052, 0.057, 0.064), .44, .26),
        "webbing": base.mat("pistol family webbing", (0.045, 0.041, 0.036), .60, .06),
        "glove": base.mat("pistol family glove", (0.010, 0.010, 0.012), .50, .08),
        "boot": base.mat("pistol family boot", (0.010, 0.009, 0.011), .44, .14),
        "sole": base.mat("pistol family boot sole", (0.003, 0.003, 0.004), .80, .01),
    }


def build_head(rig, m):
    # Pistol canon: compact rounded face, cap worn low and eyes mostly under brim.
    head = base.sphere("Pistol family Matthias head", (0.0, -0.020, 1.36), (0.325, 0.265, 0.275), m["skin"], 72)
    base.parent_bone(head, rig, "head")

    eye_line = base.box("Pistol family eye line", (0.0, -0.286, 1.395), (0.150, 0.008, 0.020), m["black"], bevel=.006)
    base.parent_bone(eye_line, rig, "head")

    for side, x in (("L", -0.105), ("R", 0.105)):
        eye = base.front_ellipse(f"Pistol family eye.{side}", (x, -0.289, 1.385), 0.030, 0.040, 0.012, m["black"], 28, .002)
        base.parent_bone(eye, rig, "head")
    mouth = base.box("Pistol family mouth", (0.0, -0.294, 1.265), (0.036, 0.008, 0.007), m["black"], bevel=.003)
    base.parent_bone(mouth, rig, "head")

    crown = base.loft_ellipse(
        "Pistol family officer cap crown",
        [
            (.305, .235, 1.535, .000),
            (.345, .255, 1.585, .018),
            (.375, .270, 1.635, .050),
            (.390, .275, 1.685, .090),
            (.370, .260, 1.725, .120),
        ],
        m["navy"], 96, .008,
    )
    top = base.elliptic_cyl("Pistol family cap top", (0.0, 0.085, 1.735), .370, .060, .72, m["navy2"], rot=(math.radians(-5), 0, 0), verts=96, bevel=.010)
    band = base.elliptic_cyl("Pistol family cap band", (0.0, -0.010, 1.545), .325, .055, .74, m["band"], rot=(math.radians(-3), 0, 0), verts=92, bevel=.007)
    brass_line = base.elliptic_cyl("Pistol family cap piping", (0.0, -0.016, 1.515), .326, .011, .74, m["brass"], verts=92, bevel=.002)
    visor = base.crescent_visor("Pistol family low visor", (0.0, -0.018, 1.530), m["navy"], .285, .415, .175, .225, .026, 10, 42)
    badge = base.front_ellipse("Pistol family cap badge", (0.0, -0.305, 1.615), .040, .050, .010, m["brass"], 32, .002)
    wing_l = base.box("Pistol family badge wing.L", (-.064, -.304, 1.616), (.040, .006, .010), m["brass"], rot=(0, math.radians(-10), math.radians(10)), bevel=.002)
    wing_r = base.box("Pistol family badge wing.R", (.064, -.304, 1.616), (.040, .006, .010), m["brass"], rot=(0, math.radians(10), math.radians(-10)), bevel=.002)
    for obj in (crown, top, band, brass_line, visor, badge, wing_l, wing_r):
        base.parent_bone(obj, rig, "head")


def build_body(rig, m):
    # Rounded compact torso and short limbs reproduce the pistol-sheet silhouette.
    torso = base.sphere("Pistol family rounded torso", (0.0, 0.015, 0.91), (0.305, 0.220, 0.255), m["cloth"], 48)
    abdomen = base.sphere("Pistol family abdomen", (0.0, 0.020, 0.705), (0.260, 0.190, 0.135), m["cloth2"], 42)
    collar = base.cyl("Pistol family collar", (0.0, 0.0, 1.130), .210, .055, m["cloth2"], verts=48, bevel=.012)
    carrier = base.box("Pistol family plate carrier", (0.0, -0.215, 0.925), (0.245, 0.058, 0.175), m["armor"], bevel=.045)
    carrier_hi = base.box("Pistol family front plate", (0.0, -0.268, 0.955), (0.190, 0.014, 0.105), m["armor_hi"], bevel=.020)
    belt = base.box("Pistol family belt", (0.0, -0.005, 0.635), (0.280, 0.190, 0.038), m["webbing"], bevel=.015)
    buckle = base.box("Pistol family buckle", (0.0, -0.200, 0.635), (0.040, 0.012, 0.030), m["brass"], bevel=.006)
    for obj in (torso, abdomen, collar, carrier, carrier_hi, belt, buckle):
        base.parent_bone(obj, rig, "spine")

    for i, x in enumerate((-0.175, -0.087, 0.0, 0.087, 0.175)):
        pouch = base.box(f"Pistol family pouch.{i}", (x, -0.215, 0.700), (0.038, 0.035, 0.052), m["webbing"], bevel=.014)
        base.parent_bone(pouch, rig, "spine")

    arm_specs = {
        "L": ((-0.300, 0.00, 1.000), (-0.390, -0.05, 0.91), (-0.31, -0.17, 0.86)),
        "R": ((0.300, 0.02, 1.000), (0.390, -0.04, 0.91), (0.31, -0.16, 0.86)),
    }
    for side, (shoulder, elbow, wrist) in arm_specs.items():
        shoulder_pad = base.sphere(f"Pistol family shoulder.{side}", shoulder, (0.118, 0.090, 0.108), m["armor"], 32)
        upper = base.cyl_between(f"Pistol family upper arm.{side}", shoulder, elbow, .070, m["cloth"], 30, .012)
        elbow_pad = base.sphere(f"Pistol family elbow.{side}", elbow, (0.074, 0.060, 0.070), m["armor_hi"], 28)
        fore = base.cyl_between(f"Pistol family forearm.{side}", elbow, wrist, .068, m["cloth2"], 30, .012)
        glove = base.sphere(f"Pistol family glove.{side}", wrist, (0.074, 0.058, 0.068), m["glove"], 28)
        base.parent_bone(shoulder_pad, rig, f"upper_arm.{side}")
        base.parent_bone(upper, rig, f"upper_arm.{side}")
        base.parent_bone(elbow_pad, rig, f"forearm.{side}")
        base.parent_bone(fore, rig, f"forearm.{side}")
        base.parent_bone(glove, rig, f"forearm.{side}")

    leg_specs = {
        "L": ((-0.15, 0.02, 0.57), (-0.15, 0.01, 0.43), (-0.15, 0.00, 0.30), -0.012),
        "R": ((0.15, 0.04, 0.57), (0.15, 0.03, 0.43), (0.15, 0.02, 0.30), 0.012),
    }
    for side, (hip, knee, ankle, depth) in leg_specs.items():
        thigh = base.cyl_between(f"Pistol family thigh.{side}", hip, knee, .110, m["cloth"], 32, .015)
        knee_pad = base.sphere(f"Pistol family knee.{side}", (knee[0], knee[1] - .060, knee[2]), (.098, .066, .080), m["armor_hi"], 28)
        shin = base.cyl_between(f"Pistol family shin.{side}", knee, ankle, .098, m["cloth2"], 32, .014)
        boot = base.box(
            f"Pistol family boot.{side}",
            (ankle[0] - .045, -.075 + depth, ankle[2] - .008),
            (.145, .120, .072), m["boot"],
            rot=(0, math.radians(5 if side == "L" else -5), 0), bevel=.030,
        )
        sole = base.box(f"Pistol family sole.{side}", (ankle[0] - .047, -.078 + depth, ankle[2] - .065), (.152, .126, .018), m["sole"], bevel=.007)
        base.parent_bone(thigh, rig, f"thigh.{side}")
        base.parent_bone(knee_pad, rig, f"shin.{side}")
        base.parent_bone(shin, rig, f"shin.{side}")
        base.parent_bone(boot, rig, f"foot.{side}")
        base.parent_bone(sole, rig, f"foot.{side}")


def setup_scene():
    scene = ORIGINAL_SETUP_SCENE()
    # Softer neutral fill: black gear stays black instead of becoming blue police uniform.
    cool = base.bpy.data.objects.get("canonical cool fill")
    if cool and getattr(cool, "data", None):
        cool.data.energy = 145
        cool.data.color = (0.58, 0.62, 0.72)
    key = base.bpy.data.objects.get("canonical warm key")
    if key and getattr(key, "data", None):
        key.data.energy = 540
    rim = base.bpy.data.objects.get("canonical rim")
    if rim and getattr(rim, "data", None):
        rim.data.energy = 320
    return scene


def main():
    base.build_rig = build_rig
    base.materials = materials
    base.build_head = build_head
    base.build_body = build_body
    base.setup_scene = setup_scene
    base.BODY_LIFT = 0.12
    weighted.main()


if __name__ == "__main__":
    main()
