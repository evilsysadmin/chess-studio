#!/usr/bin/env python3
"""Render the next Chronicles of Matthias Tactics dungeon lookdev pass.

This deliberately builds on the existing deterministic dungeon scene instead of
forking its gameplay-readable layout. The v7 pass concentrates on the playable
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



def tune_stone_materials(M):
    """Add restrained mineral/roughness variation without changing geometry."""
    profiles = {
        "stone": ((.36, .72), (.84, .90, .94, 1), (1.02, .96, .88, 1), .18, .11),
        "stone_dark": ((.42, .78), (.72, .78, .84, 1), (.94, .88, .80, 1), .16, .10),
        "floor": ((.24, .62), (.76, .84, .90, 1), (1.04, .96, .84, 1), .24, .15),
    }
    for key, (rough_range, mineral_dark, mineral_light, mineral_mix, bump_strength) in profiles.items():
        mat = M[key]
        nt = mat.node_tree
        bs = nt.nodes.get("Principled BSDF")
        if bs is None:
            continue

        # Preserve the canonical base colour graph, then add very low-amplitude
        # mineral mottling. This avoids replacing the existing authored stone.
        base_input = bs.inputs.get("Base Color")
        previous = base_input.links[0] if base_input and base_input.links else None
        mineral = nt.nodes.new("ShaderNodeTexNoise")
        mineral.name = f"TacticsMineral_{key}"
        mineral.inputs["Scale"].default_value = 8.5 if key == "floor" else 6.5
        mineral.inputs["Detail"].default_value = 4.5
        mineral.inputs["Roughness"].default_value = .67
        mineral.inputs["Distortion"].default_value = .08

        mineral_ramp = nt.nodes.new("ShaderNodeValToRGB")
        mineral_ramp.name = f"TacticsMineralRamp_{key}"
        mineral_ramp.color_ramp.elements[0].color = mineral_dark
        mineral_ramp.color_ramp.elements[1].color = mineral_light
        nt.links.new(mineral.outputs["Fac"], mineral_ramp.inputs["Fac"])

        mineral_mix_node = nt.nodes.new("ShaderNodeMixRGB")
        mineral_mix_node.name = f"TacticsMineralMix_{key}"
        mineral_mix_node.blend_type = "MULTIPLY"
        mineral_mix_node.inputs[0].default_value = mineral_mix
        if previous is not None:
            from_socket = previous.from_socket
            nt.links.remove(previous)
            nt.links.new(from_socket, mineral_mix_node.inputs[1])
        else:
            mineral_mix_node.inputs[1].default_value = bs.inputs["Base Color"].default_value
        nt.links.new(mineral_ramp.outputs["Color"], mineral_mix_node.inputs[2])
        nt.links.new(mineral_mix_node.outputs["Color"], bs.inputs["Base Color"])

        # Broad wet/dry response. Large slabs no longer share one plastic
        # roughness value, but the range stays readable under gameplay lights.
        rough = nt.nodes.new("ShaderNodeTexNoise")
        rough.name = f"TacticsRoughness_{key}"
        rough.inputs["Scale"].default_value = 10.0 if key == "floor" else 7.5
        rough.inputs["Detail"].default_value = 3.2
        rough.inputs["Roughness"].default_value = .72
        rough.inputs["Distortion"].default_value = .10
        rough_ramp = nt.nodes.new("ShaderNodeValToRGB")
        rough_ramp.name = f"TacticsRoughnessRamp_{key}"
        lo, hi = rough_range
        rough_ramp.color_ramp.elements[0].color = (lo, lo, lo, 1)
        rough_ramp.color_ramp.elements[1].color = (hi, hi, hi, 1)
        nt.links.new(rough.outputs["Fac"], rough_ramp.inputs["Fac"])
        nt.links.new(rough_ramp.outputs["Color"], bs.inputs["Roughness"])

        # Fine pitting layered over the existing macro bump.
        micro = nt.nodes.new("ShaderNodeTexNoise")
        micro.name = f"TacticsMicroPitting_{key}"
        micro.inputs["Scale"].default_value = 82.0 if key == "floor" else 68.0
        micro.inputs["Detail"].default_value = 2.4
        micro.inputs["Roughness"].default_value = .70
        micro_bump = nt.nodes.new("ShaderNodeBump")
        micro_bump.name = f"TacticsMicroBump_{key}"
        micro_bump.inputs["Strength"].default_value = bump_strength
        micro_bump.inputs["Distance"].default_value = .022
        nt.links.new(micro.outputs["Fac"], micro_bump.inputs["Height"])

        normal_input = bs.inputs.get("Normal")
        prior_normal = normal_input.links[0] if normal_input and normal_input.links else None
        if prior_normal is not None:
            prior_socket = prior_normal.from_socket
            nt.links.remove(prior_normal)
            nt.links.new(prior_socket, micro_bump.inputs["Normal"])
        nt.links.new(micro_bump.outputs["Normal"], bs.inputs["Normal"])

        if key == "floor" and "Coat Weight" in bs.inputs:
            bs.inputs["Coat Weight"].default_value = .22


def stone_buttress(M, x, y, z=1.1, rot=0.0, height=2.15):
    base.cube("tactics_buttress_foot", (x, y, .28),
              (.42, .48, .28), M["stone_dark"], (0, 0, rot), .065)
    base.cube("tactics_buttress_mid", (x, y, z),
              (.30, .37, height * .42), M["stone"], (0, 0, rot), .055)
    base.cube("tactics_buttress_cap", (x, y, height - .02),
              (.39, .46, .17), M["stone_dark"], (0, 0, rot), .065)


def drain_channel(M, x, y, length, axis="x"):
    # Compact framed grates. The two-axis lattice reads as drainage instead of
    # a miniature ladder/rail at the canonical camera angle.
    panel_len = .42
    panel_w = .30
    gap = .28
    count = max(1, int((length + gap) / (panel_len + gap)))
    span = count * panel_len + max(0, count - 1) * gap
    start = -span * .5 + panel_len * .5
    for i in range(count):
        t = start + i * (panel_len + gap)
        px, py = (x + t, y) if axis == "x" else (x, y + t)
        sx, sy = (panel_len * .5, panel_w * .5) if axis == "x" else (panel_w * .5, panel_len * .5)
        base.cube("tactics_grate_recess", (px, py, .017),
                  (sx, sy, .015), M["black"], bevel=.014)

        # perimeter frame
        if axis == "x":
            for dy in (-panel_w*.43, panel_w*.43):
                base.cube("tactics_grate_frame", (px, py+dy, .043),
                          (panel_len*.46, .014, .011), M["wet_metal"], bevel=.005)
            for dx in (-panel_len*.43, panel_len*.43):
                base.cube("tactics_grate_frame", (px+dx, py, .043),
                          (.014, panel_w*.46, .011), M["wet_metal"], bevel=.005)
            for dx in (-.10, 0.0, .10):
                base.cube("tactics_grate_bar", (px+dx, py, .046),
                          (.011, panel_w*.42, .009), M["aged_iron"], bevel=.004)
            for dy in (-.075, .075):
                base.cube("tactics_grate_bar", (px, py+dy, .047),
                          (panel_len*.40, .010, .009), M["aged_iron"], bevel=.004)
        else:
            for dx in (-panel_w*.43, panel_w*.43):
                base.cube("tactics_grate_frame", (px+dx, py, .043),
                          (.014, panel_len*.46, .011), M["wet_metal"], bevel=.005)
            for dy in (-panel_len*.43, panel_len*.43):
                base.cube("tactics_grate_frame", (px, py+dy, .043),
                          (panel_w*.46, .014, .011), M["wet_metal"], bevel=.005)
            for dy in (-.10, 0.0, .10):
                base.cube("tactics_grate_bar", (px, py+dy, .046),
                          (panel_w*.42, .011, .009), M["aged_iron"], bevel=.004)
            for dx in (-.075, .075):
                base.cube("tactics_grate_bar", (px+dx, py, .047),
                          (.010, panel_len*.40, .009), M["aged_iron"], bevel=.004)

        # one irregular rust streak, not a continuous outline
        if i % 2 == 0:
            off = .12 if axis == "x" else -.12
            if axis == "x":
                base.cube("tactics_grate_rust", (px, py+off, .038),
                          (panel_len*.28, .008, .008), M["rust"], bevel=.003)
            else:
                base.cube("tactics_grate_rust", (px+off, py, .038),
                          (.008, panel_len*.28, .008), M["rust"], bevel=.003)


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



def arch_masonry_detail(M):
    """Give the central arch a readable inner ring and real depth."""
    # front-face trim sits slightly toward camera from the canonical arch.
    front_y = 1.045
    for x in (-1.78, -.22):
        base.cube("tactics_arch_inner_jamb", (x, front_y, .91),
                  (.105, .040, .64), M["stone_dark"], bevel=.030)
    base.cube("tactics_arch_keystone", (-1.0, front_y, 2.08),
              (.205, .048, .18), M["stone_dark"], bevel=.040)
    for x in (-1.48, -1.24, -.76, -.52):
        z = 1.92 + (.14 if abs(x+1.0) < .35 else .04)
        base.cube("tactics_arch_voissior", (x, front_y+.006, z),
                  (.105, .040, .12), M["stone"], (0, math.radians((x+1.0)*20), 0), .028)

    # short corridor/steps beyond the opening: depth cue only, outside the
    # primary tactical plane.
    for i in range(4):
        base.cube("tactics_arch_step", (-1.0, 1.78+i*.27, .045+i*.035),
                  (.62-i*.035, .125, .045), M["stone_dark"], bevel=.022)
    # A real stone back wall with a smaller recess reads as a corridor; the
    # v6 full black plane looked like a pasted rectangle in the review PNG.
    base.cube("tactics_arch_corridor_floor", (-1.0, 2.34, .015),
              (.62, .62, .026), M["stone_dark"], bevel=.018)
    base.cube("tactics_arch_backwall", (-1.0, 2.86, .84),
              (.62, .055, .78), M["stone_dark"], bevel=.028)
    base.cube("tactics_arch_recess", (-1.0, 2.79, .76),
              (.30, .030, .48), M["black"], bevel=.018)
    for x in (-1.50, -.50):
        base.cube("tactics_arch_corridor_side", (x, 2.35, .72),
                  (.055, .48, .68), M["stone_dark"], bevel=.025)
    base.point_light("tactics_arch_cool_bounce", (-1.0, 2.30, .68),
                     22, (.07, .18, .28), .38)


def wall_masonry_hardware(M):
    """Sparse iron cramps make the chunky wall construction feel assembled."""
    for x, y, z, rot in (
        (1.20, 3.98, 1.10, 0), (2.38, 3.98, .74, 0),
        (3.86, 2.05, 1.08, math.radians(90)),
        (-4.02, 2.10, .86, math.radians(90)),
    ):
        base.cube("tactics_wall_cramp", (x, y, z),
                  (.16, .022, .026), M["aged_iron"], (0, 0, rot), .008)
        for side in (-1, 1):
            dx = math.cos(rot) * .12 * side
            dy = math.sin(rot) * .12 * side
            base.cyl("tactics_wall_rivet", (x+dx, y+dy, z+.003),
                     .025, .022, M["rust"], rot=(math.radians(90), 0, 0),
                     vertices=14, bevel=.005)


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
    tune_stone_materials(M)
    scene = base.setup_scene(out)
    base.build(M)
    add_playable_plane_detail(M)
    arch_masonry_detail(M)
    wall_masonry_hardware(M)
    tune_camera_and_light(scene)

    scene["chronicles_dungeon_mock"] = "tactics-lookdev-v7"
    scene["chronicles_dungeon_parent"] = "tactics-lookdev-v6"
    bpy.ops.render.render(write_still=True)
    print("Chronicles Tactics dungeon v7:", out)


if __name__ == "__main__":
    main()
