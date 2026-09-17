#!/usr/bin/env python3
"""Add weapon-weighted motion to the canonical Pawn Slug Matthias renderer.

The canonical chibi renderer owns Matthias' approved model, face, cap, lighting,
and atlas contract.  This thin layer only changes pose dynamics for the two
heavy weapons before those frames are packed and published.  Machinegun and
pistol remain byte-for-byte pose-equivalent to the base renderer.
"""
from __future__ import annotations

import math

import render_pawn_slug_matthias_canonical_chibi as base


BASE_APPLY_FRAME_POSE = base.apply_frame_pose

# Purely visual load-bearing profiles.  Timings, frame counts, hitboxes and
# gameplay movement remain owned by runtime code; these values only alter the
# rendered silhouette inside each existing 192x192 cell.
HEAVY_MOTION = {
    "shotgun": {
        "stride_scale": 0.92,
        "shin_scale": 0.95,
        "bob_scale": 0.88,
        "load_lean_deg": -1.5,
        "sway_scale": 0.80,
        "jump_leg_scale": 0.92,
        "crouch_weapon_drop": 0.015,
        "stance_roll_deg": 3.0,
    },
    "panzerfaust": {
        "stride_scale": 0.76,
        "shin_scale": 0.82,
        "bob_scale": 0.65,
        "load_lean_deg": -4.0,
        "sway_scale": 0.38,
        "jump_leg_scale": 0.72,
        "crouch_weapon_drop": 0.035,
        "stance_roll_deg": 4.0,
    },
}


def _scale_bone_y(rig, bone_name, scale):
    rig.pose.bones[bone_name].rotation_euler[1] *= scale


def _counter_head_for_load(rig, load_lean_deg):
    # Preserve Matthias' face readability while the torso visibly carries the
    # heavier weapon forward.
    rig.pose.bones["head"].rotation_euler[1] += math.radians(-load_lean_deg * 0.55)


def apply_frame_pose(rig, weapon, action, frame, count):
    BASE_APPLY_FRAME_POSE(rig, weapon, action, frame, count)
    profile = HEAVY_MOTION.get(weapon)
    if not profile:
        return

    d = math.radians
    load_lean = profile["load_lean_deg"]

    if action == "idle":
        rig.pose.bones["root"].location.z *= profile["bob_scale"]
        rig.pose.bones["root"].rotation_euler[1] += d(load_lean * 0.55)
        rig.pose.bones["spine"].rotation_euler[1] += d(load_lean)
        _counter_head_for_load(rig, load_lean)
        return

    if action in {"walk", "run"}:
        for bone_name in ("thigh.L", "thigh.R"):
            _scale_bone_y(rig, bone_name, profile["stride_scale"])
        for bone_name in ("shin.L", "shin.R"):
            _scale_bone_y(rig, bone_name, profile["shin_scale"])
        rig.pose.bones["root"].location.z *= profile["bob_scale"]
        rig.pose.bones["root"].rotation_euler[1] += d(load_lean * 0.45)
        rig.pose.bones["spine"].rotation_euler[1] += d(load_lean)
        _counter_head_for_load(rig, load_lean)

        socket = rig.pose.bones["weapon_socket"]
        stance_roll = d(profile["stance_roll_deg"])
        dynamic_sway = socket.rotation_euler[2] - stance_roll
        socket.rotation_euler[2] = stance_roll + dynamic_sway * profile["sway_scale"]
        return

    if action == "crouch":
        rig.pose.bones["root"].rotation_euler[1] += d(load_lean * 0.35)
        rig.pose.bones["spine"].rotation_euler[1] += d(load_lean * 0.75)
        rig.pose.bones["weapon_socket"].location.z -= profile["crouch_weapon_drop"]
        _counter_head_for_load(rig, load_lean * 0.70)
        return

    # Jump: heavy weapons should read as cargo being carried through the arc,
    # not as the same exaggerated leg tuck used by the lighter bank.
    for bone_name in ("thigh.L", "thigh.R", "shin.L", "shin.R"):
        _scale_bone_y(rig, bone_name, profile["jump_leg_scale"])
    rig.pose.bones["root"].rotation_euler[1] += d(load_lean * 0.30)
    rig.pose.bones["spine"].rotation_euler[1] += d(load_lean * 0.65)
    _counter_head_for_load(rig, load_lean * 0.60)


def main():
    base.apply_frame_pose = apply_frame_pose
    base.main()


if __name__ == "__main__":
    main()
