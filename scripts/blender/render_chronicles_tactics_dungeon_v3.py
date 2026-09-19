#!/usr/bin/env python3
"""Render the next Chronicles of Matthias Tactics dungeon lookdev pass.

This deliberately builds on the existing deterministic dungeon scene instead of
forking its gameplay-readable layout. The v4 pass concentrates on the playable
plane: masonry silhouette, drainage, metalwork, damp clutter and practical-light
fixtures. Camera and sleeping-unit gag remain recognizable for A/B review.
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from pathlib import Path

import bpy

import importlib.util

_BASE_PATH = Path(__file__).with_name("render_chronicles_dungeon_mock.py")
_SPEC = importlib.util.spec_from_file_location("chronicles_dungeon_base", _BASE_PATH)
if _SPEC is None or _SPEC.loader is None:
    raise RuntimeError(f"Could not load canonical dungeon renderer: {_BASE_PATH}")
base = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(base)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    tail = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(tail)


def extra_materials(M):
    M["aged_iron"] = base.mat_principled(
        "TacticsAgedIron", (.035, .042, .048), .38, .82
    )
    M["rust"] = base.mat_principled(
        "TacticsRust", (.19, .045, .014), .64, .48
    )
    M["wet_metal"] = base.mat_principled(
        "TacticsWetMetal", (.055, .072, .082), .19, .72
    )
    M["bone"] = base.mat_principled(
        "TacticsBone", (.42, .36, .27), .76, 0.0
    )
    M["cold_glow"] = base.mat_principled(
        "TacticsColdGlow", (.025, .11, .18), .32, .10,
        (.035, .22, .34), 1.35
    )


def stone_buttress(M, x, y, z=1.1, rot=0.0, height=2.15):
    base.cube("tactics_buttress_foot", (x, y, .28),
              (.42, .48, .28), M["stone_dark"], (0, 0, rot), .065)
    base.cube("tactics_buttress_mid", (x, y, z),
              (.30, .37, height * .42), M["stone"], (0, 0, rot), .055)
    base.cube("tactics_buttress_cap", (x, y, height - .02),
              (.39, .46, .17), M["stone_dark"], (0, 0, rot), .065)


def drain_channel(M, x, y, length, axis="x"):
    # Broken floor grates rather than a continuous twin-rail silhouette.
    # They read as drainage at gameplay zoom and deliberately leave stone gaps.
    section = .54
    gap = .24
    count = max(1, int((length + gap) / (section + gap)))
    span = count * section + max(0, count - 1) * gap
    start = -span * .5 + section * .5
    for i in range(count):
        t = start + i * (section + gap)
        px, py = (x + t, y) if axis == "x" else (x, y + t)
        sx, sy = (section * .5, .105) if axis == "x" else (.105, section * .5)
        base.cube("tactics_drain_recess", (px, py, .018),
                  (sx, sy, .016), M["black"], bevel=.014)
        for j in (-.16, 0.0, .16):
            if axis == "x":
                bx, by = px + j, py
                bar_scale = (.016, .118, .009)
            else:
                bx, by = px, py + j
                bar_scale = (.118, .016, .009)
            base.cube("tactics_drain_bar", (bx, by, .043),
                      bar_scale, M["wet_metal"], bevel=.006)
        # One oxidised edge only: avoids the railway read from the v3 artifact.
        if axis == "x":
            base.cube("tactics_drain_oxidation", (px, py + .132, .036),
                      (section * .46, .010, .010), M["rust"], bevel=.004)
        else:
            base.cube("tactics_drain_oxidation", (px + .132, py, .036),
                      (.010, section * .46, .010), M["rust"], bevel=.004)


def damp_seam(M, x, y, length, angle=0.0):
    r = math.radians(angle)
    base.cube("tactics_damp_seam", (x, y, .034),
              (length * .5, .032, .008), M["wet_overlay"], (0, 0, r), .012)


def pipe_run(M, x, y, z, length, axis="x"):
    rot = (0, math.radians(90), 0) if axis == "x" else (math.radians(90), 0, 0)
    base.cyl("tactics_pipe", (x, y, z), .055, length, M["aged_iron"],
             rot=rot, vertices=20, bevel=.010)
    for t in (-.38, .0, .38):
        if axis == "x":
            loc = (x + t * length, y, z)
            ring_rot = (0, math.radians(90), 0)
        else:
            loc = (x, y + t * length, z)
            ring_rot = (math.radians(90), 0, 0)
        base.cyl("tactics_pipe_collar", loc, .077, .045, M["rust"],
                 rot=ring_rot, vertices=20, bevel=.009)


def torch_cage(M, x, y, z):
    # Thin metal ribs around existing practicals increase detail without
    # dimming their light.
    for a in range(0, 360, 90):
        r = math.radians(a)
        dx, dy = math.cos(r) * .115, math.sin(r) * .115
        base.cyl("tactics_sconce_rib", (x + dx, y + dy, z), .013, .42,
                 M["aged_iron"], vertices=12, bevel=.005)
    for zz, rr in ((z - .17, .13), (z + .18, .11)):
        base.cyl("tactics_sconce_ring", (x, y, zz), rr, .025, M["rust"],
                 vertices=24, bevel=.007)


def bone_scatter(M, x, y, angle=0.0):
    r = math.radians(angle)
    for off, length in ((-.12, .34), (.12, .25)):
        ox = math.cos(r + math.pi / 2) * off
        oy = math.sin(r + math.pi / 2) * off
        base.cyl("tactics_bone", (x + ox, y + oy, .075), .024, length,
                 M["bone"], rot=(0, math.radians(90), r), vertices=14,
                 bevel=.009)
        for s in (-1, 1):
            ex = x + ox + math.cos(r) * length * .5 * s
            ey = y + oy + math.sin(r) * length * .5 * s
            base.sphere("tactics_bone_knuckle", (ex, ey, .075),
                        (.036, .030, .030), M["bone"])


def edge_rubble(M, x, y, n=10, radius=.6):
    # Use deterministic base RNG seeded by the canonical renderer.
    for i in range(n):
        a = (i * 2.3999632297) % math.tau
        rr = radius * (.25 + .70 * ((i * 37) % 101) / 100.0)
        s = .045 + .075 * ((i * 53) % 97) / 96.0
        px, py = x + math.cos(a) * rr, y + math.sin(a) * rr
        base.cube("tactics_edge_chip", (px, py, .06 + s * .3),
                  (s, s * .65, s * .45), M["stone_dark"],
                  (a * .17, a * .08, a), .018)


def add_playable_plane_detail(M):
    # Short broken drains keep the physical story but no longer dominate the
    # foreground like mine-cart rails.
    drain_channel(M, -2.15, -2.58, 1.72, "x")
    drain_channel(M, .35, -2.58, 1.22, "x")
    drain_channel(M, 3.72, -.30, 1.65, "y")
    damp_seam(M, -1.08, 2.62, 1.05, -5)
    damp_seam(M, 2.42, .92, .82, 11)

    pipe_run(M, -4.10, 2.55, 1.05, 2.3, "y")
    pipe_run(M, 3.98, 2.55, .82, 2.0, "y")

    # Buttresses thicken the masonry silhouette on both sides while preserving
    # the canonical tactical footprint.
    stone_buttress(M, -4.18, 2.95, height=2.28)
    stone_buttress(M, -4.14, -.45, height=2.18)
    stone_buttress(M, 4.06, 2.78, height=2.22)
    stone_buttress(M, 4.02, -.88, height=2.02)

    # Detailed practical housings near the same light pools as v2.
    for x, y, z in ((-3.95, 1.20, 1.78), (-.25, 4.15, 1.95),
                    (3.90, 1.10, 1.88), (-3.55, -.45, 1.63)):
        torch_cage(M, x, y, z)

    # Small environmental storytelling near edges, never obscuring units.
    bone_scatter(M, -2.72, -2.38, -18)
    bone_scatter(M, 3.12, 2.72, 32)
    edge_rubble(M, -4.15, 3.75, 10, .52)
    edge_rubble(M, 4.02, 3.55, 9, .48)
    edge_rubble(M, 3.68, -2.42, 9, .46)

    # Cold embedded ward lights counter the orange torches and make the far
    # wall read as dungeon architecture instead of an unlit block stack.
    for x in (-1.65, 1.55):
        base.cube("tactics_ward_slot", (x, 4.17, 1.04),
                  (.11, .025, .30), M["cold_glow"], bevel=.018)
        base.point_light("tactics_ward_light", (x, 3.86, 1.06),
                         34, (.08, .32, .55), .32)


def tune_camera_and_light(scene):
    cam = scene.camera
    cam.location = (11.0, -15.25, 12.15)
    cam.data.ortho_scale = 10.32
    base.look_at(cam, (.02, .32, .58))
    try:
        scene.view_settings.exposure = .56
    except Exception:
        pass


def main():
    a = parse_args()
    out = os.path.abspath(a.output)
    Path(out).parent.mkdir(parents=True, exist_ok=True)

    base.clean()
    M = base.material_bank()
    extra_materials(M)
    scene = base.setup_scene(out)
    base.build(M)
    add_playable_plane_detail(M)
    tune_camera_and_light(scene)

    scene["chronicles_dungeon_mock"] = "tactics-lookdev-v4"
    scene["chronicles_dungeon_parent"] = "tactics-lookdev-v3"
    bpy.ops.render.render(write_still=True)
    print("Chronicles Tactics dungeon v4:", out)


if __name__ == "__main__":
    main()
