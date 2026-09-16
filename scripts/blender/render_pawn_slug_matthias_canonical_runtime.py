#!/usr/bin/env python3
"""Render canonical human Matthias runtime frames for Pawn Slug.

This renderer deliberately reuses the approved Matthias face/cap rig and the
human tactical body from the visual proof renderer.  Unlike the old premium
sheet generator, it never substitutes a generic human head.  Runtime animation
is emitted as 192x192 transparent cells matching the existing 16x5 atlas
contract; a separate pack step assembles the final lossless WebP.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import render_pawn_slug_matthias_rigged_proof as proof
from pawn_slug_matthias_premium_common import WEAPONS

ACTIONS = (
    ("idle", 10),
    ("walk", 10),
    ("run", 16),
    ("crouch", 10),
    ("jump", 9),
)
CELL_PX = 192


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-canonical-runtime")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    parser.add_argument("--profile", choices=("proof", "runtime"), default="runtime")
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def build_character(weapon):
    proof.clear_scene()
    scene = proof.setup_scene()
    scene.render.resolution_x = CELL_PX
    scene.render.resolution_y = CELL_PX
    scene.render.resolution_percentage = 100

    rig = proof.build_character()
    proof.extend_human_rig(rig)
    proof.keep_only_matthias_face_and_cap()
    body_mats = proof.add_human_tactical_body(rig)
    proof.add_integrated_weapon(rig, weapon, body_mats)

    rig.location.z = proof.BODY_LIFT
    rig.rotation_euler.z = math.radians(-11.0)
    rig.rotation_euler.x = math.radians(1.5)
    rig["pawn_slug_runtime_art"] = "canonical-human-matthias-v2"
    rig["pawn_slug_canonical_identity"] = "face-cap-human-tactical"
    rig["runtime_overlay"] = False
    rig["runtime_cell_px"] = CELL_PX
    return scene, rig


def apply_stride(rig, action, frame, count):
    """Turn the proof pose into an actual locomotion cycle with readable legs."""
    phase = (frame / max(1, count)) * math.tau
    stride = math.sin(phase)
    cadence = math.cos(phase)
    d = math.radians

    if action == "idle":
        proof.apply_pose(rig, "idle", "machinegun")
        rig.pose.bones["root"].location.z += 0.012 * (1.0 - cadence) * 0.5
        return

    if action in {"walk", "run"}:
        proof.apply_pose(rig, "run", "machinegun")
        amp = 28 if action == "walk" else 56
        shin_amp = 24 if action == "walk" else 46
        bob = 0.018 if action == "walk" else 0.035

        # Opposed thighs plus asymmetric knee flexion make every quarter-cycle
        # visibly different at gameplay size instead of sliding one static pose.
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(amp * stride)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-amp * stride)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-shin_amp * max(0.0, stride) + 12 * max(0.0, -stride))
        rig.pose.bones["shin.R"].rotation_euler[1] = d(-shin_amp * max(0.0, -stride) + 12 * max(0.0, stride))
        rig.pose.bones["foot.L"].rotation_euler[1] = d(-18 * stride)
        rig.pose.bones["foot.R"].rotation_euler[1] = d(18 * stride)
        rig.pose.bones["root"].location.z += bob * abs(math.sin(phase * 2.0))
        if action == "walk":
            rig.pose.bones["root"].rotation_euler[1] = d(-8)
            rig.pose.bones["spine"].rotation_euler[1] = d(-8)
        return

    if action == "crouch":
        proof.apply_pose(rig, "crouch", "machinegun")
        return

    proof.apply_pose(rig, "jump", "machinegun")
    progress = frame / max(1, count - 1)
    arc = math.sin(progress * math.pi)
    tuck = math.sin(progress * math.pi)
    rig.pose.bones["root"].location.z = 0.08 + 0.30 * arc
    rig.pose.bones["thigh.L"].rotation_euler[1] = d(34 + 22 * tuck)
    rig.pose.bones["shin.L"].rotation_euler[1] = d(-48 - 18 * tuck)
    rig.pose.bones["thigh.R"].rotation_euler[1] = d(-18 + 14 * tuck)
    rig.pose.bones["shin.R"].rotation_euler[1] = d(42 + 16 * tuck)


def apply_frame_pose(rig, weapon, action, frame, count):
    # apply_stride uses the machinegun body language as its locomotion baseline;
    # restore the requested weapon stance afterwards so this renderer can be
    # reused for shotgun/panzerfaust without forking the animation contract.
    apply_stride(rig, action, frame, count)
    proof.weapon_stance(rig, weapon)
    bpy.context.view_layer.update()


def render_frame(scene, rig, out, weapon, action, frame, count):
    apply_frame_pose(rig, weapon, action, frame, count)
    output = out / f"matthias_{weapon}_{action}_{frame:02d}.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print("Wrote", output)


def render_proof(scene, rig, out, weapon):
    # Five cheap cells are enough in PR CI to prove the crucial run cycle is not
    # frozen.  The expensive full 55-cell atlas is rendered only after merge.
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
