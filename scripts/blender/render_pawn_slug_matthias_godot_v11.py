#!/usr/bin/env python3
"""Render a coherent Godot-v11 locomotion bank for canonical Pawn Slug Matthias.

This is deliberately a candidate-only authoring lane.  It reuses the approved
canonical chibi model and integrated weapon, then extends the pose bank with
crouch-walk, fall and land so Godot can eventually replace the mixed legacy
locomotion set without changing Matthias' identity between actions.
"""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import render_pawn_slug_matthias_canonical_chibi as base


ACTIONS = (
    ("idle", 10),
    ("walk", 10),
    ("run", 16),
    ("crouch", 10),
    ("crouch_walk", 10),
    ("jump", 9),
    ("fall", 6),
    ("land", 6),
)

BASE_APPLY_FRAME_POSE = base.apply_frame_pose


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-matthias-v11")
    parser.add_argument("--weapon", choices=base.WEAPONS, required=True)
    parser.add_argument("--profile", choices=("proof", "runtime"), default="proof")
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def _crouched_walk_pose(rig, weapon, frame, count):
    # Start from the exact final canonical crouch so the cap, face, torso and
    # weapon stay identical. Only the lower body receives a restrained gait.
    BASE_APPLY_FRAME_POSE(rig, weapon, "crouch", 9, 10)
    d = math.radians
    phase = (frame / max(1, count)) * math.tau
    stride = math.sin(phase)
    lift = abs(math.sin(phase * 2.0))

    rig.pose.bones["thigh.L"].rotation_euler[1] += d(12 * stride)
    rig.pose.bones["thigh.R"].rotation_euler[1] -= d(12 * stride)
    rig.pose.bones["shin.L"].rotation_euler[1] += d(-9 * max(0.0, stride) + 5 * max(0.0, -stride))
    rig.pose.bones["shin.R"].rotation_euler[1] += d(-9 * max(0.0, -stride) + 5 * max(0.0, stride))
    rig.pose.bones["foot.L"].rotation_euler[1] += d(-7 * stride)
    rig.pose.bones["foot.R"].rotation_euler[1] += d(7 * stride)
    rig.pose.bones["root"].location.z += 0.010 * lift
    rig.pose.bones["weapon_socket"].rotation_euler[2] += d(0.6 * math.sin(phase * 2.0))


def _fall_pose(rig, weapon, frame, count):
    # Continue the approved jump arc through its descending half instead of
    # inventing a second airborne costume/stance.
    progress = frame / max(1, count - 1)
    virtual_jump_frame = (0.60 + 0.40 * progress) * 8.0
    BASE_APPLY_FRAME_POSE(rig, weapon, "jump", virtual_jump_frame, 9)
    rig.pose.bones["root"].rotation_euler[1] += math.radians(2.0 * progress)
    rig.pose.bones["head"].rotation_euler[1] += math.radians(-2.0 * progress)


def _land_pose(rig, weapon, frame, count):
    # Compression then recovery, all from the same authored crouch rig.
    sequence = (5.0, 9.0, 8.0, 5.0, 2.0, 0.0)
    virtual = sequence[min(frame, len(sequence) - 1)]
    BASE_APPLY_FRAME_POSE(rig, weapon, "crouch", virtual, 10)
    impact = 1.0 - min(1.0, abs(frame - 1) / 4.0)
    rig.pose.bones["spine"].rotation_euler[1] += math.radians(-3.0 * impact)
    rig.pose.bones["head"].rotation_euler[1] += math.radians(2.0 * impact)


def apply_frame_pose(rig, weapon, action, frame, count):
    if action == "crouch_walk":
        _crouched_walk_pose(rig, weapon, frame, count)
        return
    if action == "fall":
        _fall_pose(rig, weapon, frame, count)
        return
    if action == "land":
        _land_pose(rig, weapon, frame, count)
        return
    BASE_APPLY_FRAME_POSE(rig, weapon, action, frame, count)


def render_proof(scene, rig, out, weapon):
    samples = {
        "idle": (0,),
        "run": (0, 4, 8, 12),
        "crouch": (9,),
        "crouch_walk": (0, 2, 5, 7),
        "jump": (0, 4, 8),
        "fall": (0, 3, 5),
        "land": (0, 1, 3, 5),
    }
    counts = dict(ACTIONS)
    for action, frames in samples.items():
        for frame in frames:
            base.render_frame(scene, rig, out, weapon, action, frame, counts[action])


def render_runtime(scene, rig, out, weapon):
    for action, count in ACTIONS:
        for frame in range(count):
            base.render_frame(scene, rig, out, weapon, action, frame, count)


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    base.apply_frame_pose = apply_frame_pose
    scene, rig = base.build_character(cfg.weapon)
    rig["pawn_slug_runtime_art"] = "canonical-chibi-matthias-godot-v11-candidate"
    rig["pawn_slug_godot_v11_candidate"] = True
    if cfg.profile == "proof":
        render_proof(scene, rig, out, cfg.weapon)
    else:
        render_runtime(scene, rig, out, cfg.weapon)


if __name__ == "__main__":
    main()
