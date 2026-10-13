#!/usr/bin/env python3
"""V54 — sample actual Quaternius animation poses with Sven V53 bone-mounted kit.

This is an animation/weapon-contact diagnostic. It is not a playable Sven or
a two-hand rifle claim. Never bake or synthesize fake clips to pass this gate.
"""
from __future__ import annotations
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
from chesscom_sven_art_direction_v53 import (
    arguments, import_and_normalize, add_design, make_studio, look_at
)

CLIPS = (
    ("Idle_Gun", (0.12, 0.62)),
    ("Gun_Shoot", (0.10, 0.55)),
    ("Run_Shoot", (0.15, 0.65)),
    ("Walk", (0.12, 0.62)),
    ("Death", (0.10, 0.88)),
)
MIN_MOTION = {"Gun_Shoot": 0.025, "Run_Shoot": 0.025, "Walk": 0.025, "Death": 0.15}


def pose_frame(scene, rig, action, phase):
    rig.animation_data_create()
    rig.animation_data.use_nla = False
    rig.animation_data.action = action
    lo, hi = action.frame_range
    if hi <= lo:
        raise ValueError("empty-action:" + action.name)
    frame = int(round(lo + (hi - lo) * phase))
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    def wrist(side):
        bone = rig.pose.bones.get("Wrist." + side)
        if bone is None:
            raise RuntimeError("missing-animated-wrist:" + side)
        return rig.matrix_world @ bone.matrix
    left, right = wrist("L"), wrist("R")
    left_pos, right_pos = left.translation, right.translation
    if any(not math.isfinite(x) for x in (*left_pos, *right_pos)):
        raise RuntimeError("nonfinite-wrist:" + action.name)
    return {
        "frame": frame,
        "left_wrist_world_m": [round(v, 5) for v in left_pos],
        "right_wrist_world_m": [round(v, 5) for v in right_pos],
        "hand_separation_m": round((left_pos - right_pos).length, 5),
    }


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = import_and_normalize(args.source_glb)
    kit = add_design(candidate)
    rig = next(obj for obj in candidate["objects"] if obj.type == "ARMATURE")
    expected = {name: next((a for a in bpy.data.actions
                            if a.name.endswith("|" + name)), None)
                for name, _ in CLIPS}
    if any(action is None for action in expected.values()):
        raise RuntimeError("source-action-missing:" +
                           ",".join(name for name, action in expected.items() if action is None))

    scene, camera = make_studio()
    camera.data.ortho_scale = 2.25
    scene.cycles.samples = 8 if scene.render.engine == "CYCLES" else 1
    camera.location = (2.5, -3.7, 2.4)
    look_at(camera, (0, 0, .95))
    report = {"schema": 1, "review_only": True, "promotable": False,
              "actor": "quaternius-cc0-sven-art-direction-v53",
              "animations_are_authentic": True,
              "two_hand_rifle_contact_verified": False,
              "gun_muzzle_verified": False,
              "source_action_names": {}, "poses": {}, "kit_pieces": kit["pieces"]}

    for clip, phases in CLIPS:
        action = expected[clip]
        report["source_action_names"][clip] = action.name
        samples = []
        for i, phase in enumerate(phases):
            metrics = pose_frame(scene, rig, action, phase)
            output = args.output_dir / f"motion-{clip}-{i}.png"
            scene.render.filepath = str(output)
            bpy.ops.render.render(write_still=True)
            data = output.read_bytes()
            if len(data) < 1024:
                raise RuntimeError("motion-render-missing:" + clip)
            samples.append({**metrics, "image": output.name,
                            "sha256": hashlib.sha256(data).hexdigest()})
        displacement = math.dist(samples[0]["right_wrist_world_m"],
                                 samples[1]["right_wrist_world_m"])
        separation_shift = abs(samples[0]["hand_separation_m"] -
                               samples[1]["hand_separation_m"])
        report["poses"][clip] = {
            "samples": samples,
            "right_hand_displacement_m": round(displacement, 5),
            "hand_separation_shift_m": round(separation_shift, 5),
        }
        if displacement < MIN_MOTION.get(clip, 0.0):
            raise RuntimeError(f"animation-is-static:{clip}:{displacement:.4f}")

    if len({s["sha256"] for p in report["poses"].values() for s in p["samples"]}) != 10:
        raise RuntimeError("pose-contact-duplicate-frames")
    # A rifle supported by BOTH hands cannot be certified by one-handed
    # source clips. Samples can only inform a future authored two-hand IK pass.
    report["reason_not_promotable"] = (
        "Source Gun_Shoot elevates the right wrist while the left stays low; "
        "Run_Shoot has strongly variable hand separation. No genuine "
        "two-hand foregrip or rifle attachment has been authored."
    )
    (args.output_dir / "motion-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("V54_MOTION_EVIDENCE_ONLY", {
        clip: p["right_hand_displacement_m"] for clip, p in report["poses"].items()
    })


if __name__ == "__main__":
    main()
