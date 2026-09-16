#!/usr/bin/env python3
"""Render premium Blender-authored Pawn Slug Matthias weapon atlases."""
from __future__ import annotations

import math
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
        scene.eevee.taa_render_samples = 64

    scene.world.use_nodes = True
    bg = scene.world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.045, 0.060, 0.085, 1.0)
        bg.inputs["Strength"].default_value = 0.42
    try:
        scene.view_settings.view_transform = "Standard"
    except Exception:
        pass
    try:
        scene.view_settings.exposure = 0.45
        scene.view_settings.gamma = 1.0
    except Exception:
        pass

    center = Vector(((COLS - 1) * CELL / 2.0, 0.0, -(ROWS - 1) * CELL / 2.0 + 1.34))
    bpy.ops.object.camera_add(location=(center.x, -42.0, center.z))
    cam = bpy.context.object
    cam.data.type = "ORTHO"

    # Blender's orthographic scale is the *vertical* camera span. The previous
    # renderer used COLS * CELL as though ortho_scale represented width, which
    # made the 16x5 atlas frame roughly 3.2x too tall and shrank Matthias before
    # the later downsample. Author exactly five cell-heights vertically; the
    # 16:5 render aspect supplies the matching sixteen-cell horizontal span.
    expected_aspect = COLS / ROWS
    render_aspect = scene.render.resolution_x / scene.render.resolution_y
    if not math.isclose(render_aspect, expected_aspect, rel_tol=0.0, abs_tol=1e-9):
        raise RuntimeError(
            f"Pawn Slug atlas aspect drift: render={render_aspect:.9f} expected={expected_aspect:.9f}"
        )
    cam.data.ortho_scale = ROWS * CELL
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = cam

    def sun(name, direction, energy, color, angle_degrees):
        bpy.ops.object.light_add(type="SUN", location=(0.0, 0.0, 0.0))
        obj = bpy.context.object
        obj.name = name
        obj.data.energy = energy
        obj.data.color = color
        if hasattr(obj.data, "angle"):
            obj.data.angle = math.radians(angle_degrees)
        obj.rotation_euler = Vector(direction).to_track_quat("-Z", "Y").to_euler()
        return obj

    sun("key", (0.30, 1.00, -0.62), 2.35, (1.0, 0.90, 0.80), 7.0)
    sun("fill", (-0.55, 0.78, -0.18), 0.95, (0.72, 0.84, 1.0), 12.0)
    sun("rim", (0.15, -1.00, -0.38), 0.62, (0.42, 0.62, 1.0), 9.0)
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

    blend_path = out / f"matthias_{cfg.weapon}_premium_v3.blend"
    hi_png = out / f"matthias_{cfg.weapon}_premium_v3_hi.png"
    scene.render.filepath = str(hi_png)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.render.render(write_still=True)
    print(f"Wrote {blend_path}")
    print(f"Wrote {hi_png}")


if __name__ == "__main__":
    main()
