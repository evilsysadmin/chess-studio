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
    weighted.apply_frame_pose(rig, weapon, "crouch", 9, 10)
    d = math.radians

    rig.pose.bones["root"].location.z += 0.10
    rig.pose.bones["root"].rotation_euler[1] += d(-4.0)
    rig.pose.bones["spine"].rotation_euler[1] += d(-5.0)
    rig.pose.bones["head"].rotation_euler[1] += d(3.0)
    rig.pose.bones["thigh.L"].rotation_euler[1] *= 0.82
    rig.pose.bones["thigh.R"].rotation_euler[1] *= 0.82
    rig.pose.bones["shin.L"].rotation_euler[1] *= 0.86
    rig.pose.bones["shin.R"].rotation_euler[1] *= 0.86
    rig.pose.bones["weapon_socket"].location.z += 0.045
    rig.pose.bones["weapon_socket"].rotation_euler[1] += d(-2.0)
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
