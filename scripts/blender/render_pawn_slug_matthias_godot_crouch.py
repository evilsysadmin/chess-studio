#!/usr/bin/env python3
"""Render one combat-ready crouch cell for Pawn Slug Godot strict atlases."""
from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import render_pawn_slug_matthias_canonical_chibi as base
import render_pawn_slug_matthias_canonical_heavy as weighted
from pawn_slug_matthias_premium_common import WEAPONS

STRICT_CELL_PX = 256


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", default="/tmp/pawn-slug-godot-crouch")
    parser.add_argument("--weapon", choices=WEAPONS, required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def apply_combat_crouch(rig, weapon: str) -> None:
    # Author the gameplay crouch explicitly instead of deriving it from the
    # legacy/master crouch. The side-scroller read needs clear knee flexion,
    # asymmetric feet and an aimed weapon, not a seated/tucked silhouette.
    base.reset_pose(rig)
    base.weapon_stance(rig, weapon)
    d = math.radians

    root = rig.pose.bones["root"]
    spine = rig.pose.bones["spine"]
    head = rig.pose.bones["head"]
    root.location.z = -0.18
    root.location.x = -0.035
    root.rotation_euler[1] = d(-14.0)
    spine.rotation_euler[1] = d(-17.0)
    head.rotation_euler[1] = d(8.0)

    rig.pose.bones["thigh.L"].rotation_euler[1] = d(58.0)
    rig.pose.bones["shin.L"].rotation_euler[1] = d(-82.0)
    rig.pose.bones["foot.L"].rotation_euler[1] = d(-12.0)
    rig.pose.bones["thigh.R"].rotation_euler[1] = d(-46.0)
    rig.pose.bones["shin.R"].rotation_euler[1] = d(72.0)
    rig.pose.bones["foot.R"].rotation_euler[1] = d(13.0)

    socket = rig.pose.bones["weapon_socket"]
    socket.location.z -= 0.015
    socket.rotation_euler[1] += d(-3.0)

    # Preserve a little extra load on the torso for the heavy weapons without
    # changing the leg geometry that makes the crouch readable.
    profile = weighted.HEAVY_MOTION.get(weapon)
    if profile:
        load_lean = float(profile["load_lean_deg"])
        root.rotation_euler[1] += d(load_lean * 0.30)
        spine.rotation_euler[1] += d(load_lean * 0.55)
        socket.location.z -= float(profile["crouch_weapon_drop"]) * 0.35

    bpy.context.view_layer.update()


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)

    base.CELL_PX = STRICT_CELL_PX
    scene, rig = base.build_character(cfg.weapon)
    apply_combat_crouch(rig, cfg.weapon)

    output = out / f"matthias_{cfg.weapon}_crouch_strict_00.png"
    scene.render.filepath = str(output)
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {output}")


if __name__ == "__main__":
    main()
