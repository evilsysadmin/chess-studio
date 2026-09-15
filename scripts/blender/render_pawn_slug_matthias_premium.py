#!/usr/bin/env python3
"""Render premium Blender-authored Pawn Slug Matthias weapon atlases."""
from __future__ import annotations

import sys
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from pawn_slug_matthias_premium_common import ACTIONS, CELL, CELL_PX, COLS, ROWS, clear_scene, mats, parse_args
from pawn_slug_matthias_premium_character import build_frame


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
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 48
    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.025, 0.032, 0.045, 1.0)
        bg.inputs["Strength"].default_value = 0.32
    try:
        scene.view_settings.look = "Medium High Contrast"
    except Exception:
        pass

    center = Vector(((COLS - 1) * CELL / 2.0, 0.0, -(ROWS - 1) * CELL / 2.0 + 1.34))
    bpy.ops.object.camera_add(location=(center.x, -42.0, center.z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = COLS * CELL
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    def light(name, loc, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=loc)
        obj = bpy.context.object
        obj.name = name
        obj.data.energy = energy
        obj.data.color = color
        obj.data.size = size
        obj.data.shape = "DISK"
        obj.rotation_euler = (center - obj.location).to_track_quat("-Z", "Y").to_euler()
        return obj

    light("key", (center.x - 7.0, -14.0, center.z + 9.0), 1150, 24, (1.0, 0.88, 0.75))
    light("fill", (center.x + 9.0, -10.0, center.z + 4.0), 680, 28, (0.72, 0.84, 1.0))
    light("rim", (center.x - 4.0, 9.0, center.z + 8.0), 1000, 20, (0.38, 0.58, 1.0))
    return scene


def main():
    cfg = parse_args()
    out = Path(cfg.output_dir).resolve()
    out.mkdir(parents=True, exist_ok=True)
    clear_scene()
    scene = setup_scene()
    m = mats()
    for row, (action, count) in enumerate(ACTIONS):
        for frame in range(count):
            origin = (frame * CELL + 0.08, 0.0, -row * CELL)
            build_frame(origin, action, frame, count, cfg.weapon, m)

    blend_path = out / f"matthias_{cfg.weapon}_premium_v2.blend"
    hi_png = out / f"matthias_{cfg.weapon}_premium_v2_hi.png"
    scene.render.filepath = str(hi_png)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {blend_path}")
    print(f"Wrote {hi_png}")


if __name__ == "__main__":
    main()
