#!/usr/bin/env python3
"""Render production-sized Pawn Slug atlases from the rigged Matthias proof.

This intentionally leaves the shipped runtime payloads untouched. It turns the
approved rig/body/weapon architecture into the existing 16x5 atlas contract so
we can validate the candidate at real 96px gameplay scale before promotion.
"""
from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector

from home_matthias_parts import build_character
from pawn_slug_matthias_premium_common import ACTIONS, CELL, CELL_PX, COLS, ROWS, clear_scene, parse_args
from render_pawn_slug_matthias_rigged_proof import (
    BODY_LIFT,
    CANONICAL_HEAD_PREFIXES,
    add_human_tactical_body,
    add_integrated_weapon,
    extend_human_rig,
    reset_pose,
    weapon_stance,
)


def keep_new_face_and_cap(previous_objects):
    """Hide only the legacy Home body created for this frame, never older cells."""
    kept = []
    for obj in set(bpy.context.scene.objects) - previous_objects:
        if obj.type != "MESH":
            continue
        keep = obj.name.startswith(CANONICAL_HEAD_PREFIXES)
        obj.hide_render = not keep
        obj.hide_viewport = not keep
        if keep:
            kept.append(obj.name)
    if not any(name.startswith("Head") for name in kept):
        raise RuntimeError("canonical Matthias face missing from rigged atlas cell")


def apply_atlas_pose(rig, action, frame, count, weapon):
    reset_pose(rig)
    weapon_stance(rig, weapon)
    d = math.radians
    phase = frame / max(1, count - (0 if action in {"crouch", "jump"} else 1))
    t = phase * math.tau
    wave = math.sin(t)
    pulse = math.cos(t)

    if action == "idle":
        rig.pose.bones["root"].location.z = max(0.0, -pulse) * 0.025
        rig.pose.bones["root"].rotation_euler = (0.0, d(-6 + wave * 1.2), d(-1 + wave * 1.0))
        rig.pose.bones["spine"].rotation_euler = (d(1), d(-7 + wave * 1.4), d(-3))
        rig.pose.bones["head"].rotation_euler = (d(-1), d(5 - wave * 1.4), d(2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(5 + wave * 2)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-7 - wave * 2)
        return

    if action in {"walk", "run"}:
        if action == "walk":
            stride, knee, lean, bob = 31.0, 25.0, -8.0, 0.040
        else:
            stride, knee, lean, bob = 55.0, 42.0, -13.0, 0.065
        left = wave
        right = -wave
        rig.pose.bones["root"].location.z = abs(wave) * bob
        rig.pose.bones["root"].location.x = -0.025 if action == "walk" else -0.050
        rig.pose.bones["root"].rotation_euler = (0.0, d(lean), d(-2.0 - wave * 1.5))
        rig.pose.bones["spine"].rotation_euler = (d(2), d(lean), d(-4.0 - wave * 1.5))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(-lean * 0.55), d(2.5))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(stride * left)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-knee * max(0.0, left) + knee * 0.38 * max(0.0, -left))
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(stride * right)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(-knee * max(0.0, right) + knee * 0.38 * max(0.0, -right))
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(-2.5 if action == "walk" else -5.0)
        return

    if action == "crouch":
        settle = min(1.0, frame / max(1, count - 1) * 1.35)
        rig.pose.bones["root"].location.z = -0.30 * settle
        rig.pose.bones["root"].rotation_euler[1] = d(-10 * settle)
        rig.pose.bones["spine"].rotation_euler = (d(3), d(-15 * settle), d(-5 * settle))
        rig.pose.bones["head"].rotation_euler = (d(-2), d(8 * settle), d(2))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(43 * settle)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-58 * settle)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-31 * settle)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(54 * settle)
        rig.pose.bones["weapon_socket"].location.z -= 0.08 * settle
        return

    if action == "jump":
        arc = math.sin(phase * math.pi)
        rig.pose.bones["root"].location.z = 0.31 * arc
        rig.pose.bones["root"].rotation_euler[1] = d(8 * arc)
        rig.pose.bones["spine"].rotation_euler = (d(-3 * arc), d(10 * arc), d(4 * arc))
        rig.pose.bones["head"].rotation_euler = (d(-4 * arc), d(-6 * arc), d(-2 * arc))
        rig.pose.bones["thigh.L"].rotation_euler[1] = d(18 + 42 * arc)
        rig.pose.bones["shin.L"].rotation_euler[1] = d(-20 - 50 * arc)
        rig.pose.bones["thigh.R"].rotation_euler[1] = d(-10 - 12 * arc)
        rig.pose.bones["shin.R"].rotation_euler[1] = d(18 + 41 * arc)
        rig.pose.bones["weapon_socket"].rotation_euler[1] += d(6 * arc)
        return

    raise ValueError(action)


def look_at(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def setup_scene():
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = True
    scene.render.resolution_x = COLS * CELL_PX
    scene.render.resolution_y = ROWS * CELL_PX
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.view_settings.view_transform = "AgX"
        scene.view_settings.look = "AgX - Medium High Contrast"
        scene.view_settings.exposure = 0.20
    except Exception:
        pass

    center = Vector(((COLS - 1) * CELL / 2.0, 0.0, -(ROWS - 1) * CELL / 2.0 + 1.18))
    bpy.ops.object.camera_add(location=(center.x, -42.0, center.z))
    camera = bpy.context.object
    camera.name = "PawnSlugRiggedAtlasCamera"
    camera.data.type = "ORTHO"
    camera.data.sensor_fit = "HORIZONTAL"
    camera.data.ortho_scale = COLS * CELL
    look_at(camera, center)
    scene.camera = camera

    def area(name, offset, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = center + Vector(offset)
        look_at(obj, center)

    area("rigged atlas key", (-7.0, -12.0, 8.0), 1500, 8.0, (1.0, 0.82, 0.64))
    area("rigged atlas fill", (8.0, -9.0, 4.0), 800, 7.0, (0.48, 0.65, 1.0))
    area("rigged atlas rim", (5.0, 8.0, 7.0), 1100, 6.0, (1.0, 0.38, 0.16))
    return scene


def build_cell(origin, action, frame, count, weapon):
    previous = set(bpy.context.scene.objects)
    rig = build_character()
    extend_human_rig(rig)
    keep_new_face_and_cap(previous)
    body_mats = add_human_tactical_body(rig)
    add_integrated_weapon(rig, weapon, body_mats)
    apply_atlas_pose(rig, action, frame, count, weapon)
    rig.location = (origin[0], origin[1], origin[2] + BODY_LIFT)
    rig.rotation_euler.z = math.radians(-11.0)
    rig.rotation_euler.x = math.radians(1.5)
    rig["pawn_slug_rigged_atlas"] = "human-tactical-matthias-v1"
    rig["target_runtime_px"] = 96
    rig["runtime_overlay"] = False
    return rig


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()

    for row, (action, count) in enumerate(ACTIONS):
        for frame in range(count):
            build_cell((frame * CELL + 0.08, 0.0, -row * CELL), action, frame, count, cfg.weapon)

    blend_path = out / f"matthias_{cfg.weapon}_rigged_v1.blend"
    hi_png = out / f"matthias_{cfg.weapon}_rigged_v1_hi.png"
    scene.render.filepath = str(hi_png)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {blend_path}")
    print(f"Wrote {hi_png}")


if __name__ == "__main__":
    main()
