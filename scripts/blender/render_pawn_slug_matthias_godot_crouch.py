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

    # Stay visibly crouched: the canonical pose already has the correct knee
    # geometry. Lift it only a touch to avoid the old "sitting" read, then add
    # forward combat intent without straightening either leg.
    rig.pose.bones["root"].location.z += 0.025
    rig.pose.bones["root"].rotation_euler[1] += d(-3.0)
    rig.pose.bones["spine"].rotation_euler[1] += d(-4.0)
    rig.pose.bones["head"].rotation_euler[1] += d(2.0)
    rig.pose.bones["weapon_socket"].location.z += 0.015
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
