#!/usr/bin/env python3
"""Build the first Blender blockout for the canonical Chess Studio Home.

The goal of this pass is intentionally narrow: lock camera/composition and the
major architectural/prop masses before spending time on detailed modelling.
It never mutates runtime Home assets.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


CONTRACT = "home-blender-v2-blockout-v1"
DEFAULT_REFERENCE = "frontend/src/assets/home-canonical/great-hall-dungeon.webp"


def argv_after_double_dash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=DEFAULT_REFERENCE)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=32)
    parser.add_argument("--max-width", type=int, default=1280)
    parser.add_argument("--engine", choices=("workbench", "eevee"), default="workbench")
    return parser.parse_args(argv_after_double_dash())


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name: str, color: tuple[float, float, float, float], *, roughness=0.7, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission is not None:
        bsdf.inputs["Emission Color"].default_value = emission
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def apply_material(obj, mat) -> None:
    if hasattr(obj.data, "materials"):
        obj.data.materials.append(mat)


def cube(name: str, location, scale, mat, *, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    apply_material(obj, mat)
    return obj


def cylinder(name: str, location, radius: float, depth: float, mat, *, vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    apply_material(obj, mat)
    return obj


def sphere(name: str, location, scale, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    apply_material(obj, mat)
    return obj


def curve_tube(name: str, points, bevel_depth: float, mat):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = bevel_depth
    curve.bevel_resolution = 3
    spline = curve.splines.new("POLY")
    spline.points.add(len(points) - 1)
    for point, co in zip(spline.points, points):
        point.co = (*co, 1.0)
    obj = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(obj)
    apply_material(obj, mat)
    return obj


def arch(name: str, x: float, y: float, width: float, spring_z: float, top_z: float, bottom_z: float, mat):
    radius = width / 2.0
    center_z = top_z - radius
    points = [(x - radius, y, bottom_z), (x - radius, y, center_z)]
    for i in range(17):
        theta = math.pi - (math.pi * i / 16.0)
        points.append((x + radius * math.cos(theta), y, center_z + radius * math.sin(theta)))
    points.extend([(x + radius, y, center_z), (x + radius, y, bottom_z)])
    return curve_tube(name, points, 0.19, mat)


def look_at(obj, target) -> None:
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def add_area_light(name: str, location, energy: float, color, size: float, target=(0, 2.0, 2.0)):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    look_at(obj, target)
    return obj


def add_point_light(name: str, location, energy: float, color, radius=0.22):
    data = bpy.data.lights.new(name, type="POINT")
    data.energy = energy
    data.color = color
    data.shadow_soft_size = radius
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    return obj


def add_table_and_board(materials):
    wood = materials["wood"]
    dark = materials["board_dark"]
    light = materials["board_light"]
    metal = materials["brass"]
    cube("HOME_PROP_table_top", (0.0, 1.7, 1.02), (2.55, 1.35, 0.14), wood, bevel=0.08)
    for x in (-2.15, 2.15):
        for y in (0.78, 2.62):
            cube(f"HOME_PROP_table_leg_{x}_{y}", (x, y, 0.52), (0.13, 0.13, 0.52), wood, bevel=0.03)
    square = 0.275
    start_x = -4 * square + square / 2
    start_y = 1.7 - 4 * square + square / 2
    for row in range(8):
        for col in range(8):
            mat = light if (row + col) % 2 == 0 else dark
            cube(
                f"HOME_PROP_board_{row}_{col}",
                (start_x + col * square, start_y + row * square, 1.185),
                (square / 2, square / 2, 0.018),
                mat,
            )
    cube("HOME_PROP_board_frame", (0, 1.7, 1.15), (1.18, 1.18, 0.035), metal, bevel=0.025)


def add_fireplace(name: str, x: float, materials):
    stone = materials["stone"]
    dark = materials["stone_dark"]
    fire = materials["fire"]
    cube(f"HOME_PROP_{name}_hearth", (x, 6.12, 0.72), (1.18, 0.48, 0.72), dark, bevel=0.05)
    cube(f"HOME_PROP_{name}_mantel", (x, 5.88, 1.58), (1.42, 0.22, 0.14), stone, bevel=0.04)
    arch(f"HOME_ARCH_{name}_alcove", x, 6.18, 2.65, 2.5, 4.2, 0.12, dark)
    cube(f"HOME_PROP_{name}_fire", (x, 5.61, 0.73), (0.72, 0.07, 0.43), fire, bevel=0.12)
    add_point_light(f"HOME_LIGHT_{name}", (x, 5.18, 1.16), 520, (1.0, 0.25, 0.06), radius=0.7)


def add_bookshelf(materials):
    wood = materials["wood"]
    brass = materials["brass"]
    x, y = -2.55, 6.22
    cube("HOME_PROP_library_back", (x, y, 2.35), (1.45, 0.28, 2.25), wood, bevel=0.04)
    for idx, z in enumerate((0.5, 1.18, 1.86, 2.54, 3.22, 3.9, 4.48)):
        cube(f"HOME_PROP_library_shelf_{idx}", (x, y - 0.33, z), (1.45, 0.12, 0.065), brass, bevel=0.02)
    for side in (-1, 1):
        cube(f"HOME_PROP_library_post_{side}", (x + side * 1.34, y - 0.31, 2.35), (0.11, 0.13, 2.25), brass, bevel=0.025)
    # Book masses only: enough to match the canonical silhouette before detailing.
    book_colors = (materials["banner"], materials["book_green"], materials["book_brown"])
    for row, z in enumerate((0.82, 1.5, 2.18, 2.86, 3.54, 4.16)):
        for col in range(9):
            bx = x - 1.15 + col * 0.285
            h = 0.22 + 0.035 * ((row + col) % 3)
            cube(f"HOME_PROP_book_{row}_{col}", (bx, y - 0.47, z), (0.09, 0.08, h), book_colors[(row + col) % len(book_colors)])


def add_banner(name: str, x: float, materials):
    banner = materials["banner"]
    brass = materials["brass"]
    cube(f"HOME_PROP_banner_{name}", (x, 5.88, 4.48), (0.46, 0.045, 1.15), banner, bevel=0.025)
    cube(f"HOME_PROP_banner_bar_{name}", (x, 5.82, 5.66), (0.58, 0.06, 0.045), brass, bevel=0.015)


def add_armor(materials):
    steel = materials["steel"]
    brass = materials["brass"]
    stone = materials["stone"]
    x, y = 1.35, 5.46
    cube("HOME_PROP_armor_pedestal", (x, y, 0.28), (0.58, 0.48, 0.28), stone, bevel=0.05)
    cylinder("HOME_PROP_armor_legs", (x, y, 0.94), 0.22, 1.1, steel)
    sphere("HOME_PROP_armor_torso", (x, y, 1.72), (0.46, 0.3, 0.62), steel)
    sphere("HOME_PROP_armor_helmet", (x, y, 2.48), (0.31, 0.29, 0.32), steel)
    cube("HOME_PROP_armor_visor", (x, y - 0.28, 2.48), (0.28, 0.05, 0.095), brass, bevel=0.02)
    curve_tube("HOME_PROP_armor_left_arm", [(x - 0.37, y, 1.98), (x - 0.58, y, 1.48)], 0.1, steel)
    curve_tube("HOME_PROP_armor_right_arm", [(x + 0.37, y, 1.98), (x + 0.58, y, 1.48)], 0.1, steel)


def add_trophy(materials):
    brass = materials["brass"]
    wood = materials["wood"]
    x, y = -3.45, 5.76
    cube("HOME_PROP_trophy_shelf", (x, y, 2.78), (0.56, 0.22, 0.08), wood, bevel=0.025)
    cylinder("HOME_PROP_trophy_stem", (x, y - 0.18, 3.05), 0.07, 0.34, brass)
    sphere("HOME_PROP_trophy_cup", (x, y - 0.18, 3.34), (0.28, 0.22, 0.22), brass)
    curve_tube("HOME_PROP_trophy_handle_l", [(x - 0.18, y - 0.18, 3.42), (x - 0.34, y - 0.18, 3.33), (x - 0.23, y - 0.18, 3.18)], 0.035, brass)
    curve_tube("HOME_PROP_trophy_handle_r", [(x + 0.18, y - 0.18, 3.42), (x + 0.34, y - 0.18, 3.33), (x + 0.23, y - 0.18, 3.18)], 0.035, brass)


def add_stairs(materials):
    stone = materials["stone"]
    brass = materials["brass"]
    dark = materials["dark"]
    x0, y0 = 6.85, 4.75
    cube("HOME_ARCH_dungeon_void", (x0, 5.88, 1.55), (1.28, 0.08, 1.52), dark, bevel=0.08)
    arch("HOME_ARCH_dungeon_arch", x0, 5.78, 2.75, 2.6, 4.2, 0.2, stone)
    for i in range(9):
        y = y0 - i * 0.38
        z = 0.82 - i * 0.075
        cube(
            f"HOME_ARCH_dungeon_step_{i}",
            (x0, y, z),
            (1.18, 0.25, 0.09),
            stone,
            bevel=0.025,
        )
    curve_tube("HOME_PROP_dungeon_rail", [(5.76, 4.85, 1.25), (5.76, 3.55, 0.92), (5.76, 2.2, 0.62)], 0.045, brass)


def build_scene(reference: Path, samples: int, max_width: int, engine: str):def build_scene(reference: Path, samples: int, max_width: int, engine: str):
    reset_scene()
    scene = bpy.context.scene
    if engine == "workbench":
        scene.render.engine = "BLENDER_WORKBENCH"
        scene.display.shading.light = "STUDIO"
        scene.display.shading.color_type = "MATERIAL"
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
    else:
        try:
            scene.render.engine = "BLENDER_EEVEE_NEXT"
        except TypeError:
            scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.resolution_percentage = 100

    ref_image = bpy.data.images.load(str(reference), check_existing=False)
    width, height = int(ref_image.size[0]), int(ref_image.size[1])
    if width <= 0 or height <= 0:
        width, height = 1814, 867
    render_width = min(width, max(640, max_width))
    render_height = round(height * render_width / width)
    scene.render.resolution_x = render_width
    scene.render.resolution_y = render_height

    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.film_transparent = False

    if hasattr(scene, "eevee"):
        scene.eevee.taa_render_samples = max(8, samples)

    world = bpy.data.worlds.new("HOME_WORLD")
    world.use_nodes = True
    scene.world = world
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.012, 0.007, 0.004, 1.0)
    bg.inputs["Strength"].default_value = 0.22

    materials = {
        "stone": material("HOME_MAT_stone", (0.17, 0.12, 0.09, 1), roughness=0.88),
        "stone_dark": material("HOME_MAT_stone_dark", (0.075, 0.05, 0.04, 1), roughness=0.95),
        "wood": material("HOME_MAT_wood", (0.16, 0.065, 0.025, 1), roughness=0.7),
        "brass": material("HOME_MAT_brass", (0.47, 0.25, 0.055, 1), roughness=0.32, metallic=0.82),
        "steel": material("HOME_MAT_steel", (0.16, 0.17, 0.18, 1), roughness=0.42, metallic=0.72),
        "board_light": material("HOME_MAT_board_light", (0.52, 0.33, 0.16, 1), roughness=0.65),
        "board_dark": material("HOME_MAT_board_dark", (0.08, 0.035, 0.018, 1), roughness=0.75),
        "rug": material("HOME_MAT_rug", (0.28, 0.02, 0.018, 1), roughness=0.9),
        "banner": material("HOME_MAT_banner", (0.34, 0.018, 0.012, 1), roughness=0.82),
        "book_green": material("HOME_MAT_book_green", (0.08, 0.16, 0.10, 1), roughness=0.88),
        "book_brown": material("HOME_MAT_book_brown", (0.22, 0.08, 0.035, 1), roughness=0.88),
        "dark": material("HOME_MAT_dark", (0.018, 0.012, 0.01, 1), roughness=0.9),
        "window": material(
            "HOME_MAT_window",
            (0.025, 0.07, 0.11, 1),
            roughness=0.22,
            emission=(0.09, 0.28, 0.44, 1),
            emission_strength=1.45,
        ),
        "fire": material(
            "HOME_MAT_fire",
            (0.55, 0.08, 0.01, 1),
            roughness=0.35,
            emission=(1.0, 0.19, 0.025, 1),
            emission_strength=5.0,
        ),
    }

    # Canonical Great Hall blockout v2: reproduce the asymmetric visual masses
    # from great-hall-dungeon.webp before adding any decorative detail.
    cube("HOME_ARCH_floor", (0, 2.6, -0.18), (9.35, 6.8, 0.18), materials["stone_dark"])
    cube("HOME_ARCH_back_wall", (0, 7.0, 3.2), (9.35, 0.25, 3.4), materials["stone"])
    cube("HOME_ARCH_left_wall", (-9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_right_wall", (9.15, 2.9, 3.0), (0.18, 4.4, 3.2), materials["stone"])
    cube("HOME_ARCH_rug", (0, 1.95, 0.018), (3.55, 4.45, 0.018), materials["rug"])

    # Large canonical masses, left-to-right: fireplace, library, armor portal,
    # second fireplace, window and dungeon stair.
    for x in (-7.6, -4.8, -0.65, 2.85, 5.95, 8.25):
        cylinder(f"HOME_ARCH_column_{x}", (x, 6.55, 2.6), 0.25, 5.2, materials["stone"], vertices=40)
        cylinder(f"HOME_ARCH_column_base_{x}", (x, 6.55, 0.25), 0.4, 0.5, materials["stone_dark"], vertices=36)

    add_fireplace("fireplace_left", -6.15, materials)
    add_bookshelf(materials)
    arch("HOME_ARCH_armor_portal", 1.35, 6.18, 2.55, 2.55, 4.35, 0.15, materials["stone_dark"])
    add_fireplace("fireplace_right", 4.45, materials)

    cube("HOME_ARCH_window_right", (8.0, 6.62, 3.58), (0.78, 0.07, 1.46), materials["window"], bevel=0.08)
    arch("HOME_ARCH_window_right_frame", 8.0, 6.48, 1.78, 3.32, 4.48, 2.08, materials["brass"])

    for name, x in (("left", -4.7), ("center", -0.15), ("right", 3.05), ("far_right", 7.2)):
        add_banner(name, x, materials)

    add_table_and_board(materials)
    add_armor(materials)
    add_trophy(materials)
    add_stairs(materials)

    # Chandelier and warm pools of light.    # Chandelier and warm pools of light.
    cylinder("HOME_PROP_chandelier_drop", (0, 2.45, 4.85), 0.055, 1.5, materials["brass"])
    curve_tube("HOME_PROP_chandelier_ring", [
        (1.2 * math.cos(i * math.tau / 20), 2.45 + 0.55 * math.sin(i * math.tau / 20), 4.18)
        for i in range(21)
    ], 0.055, materials["brass"])
    for idx, x in enumerate((-0.85, -0.28, 0.28, 0.85)):
        cube(f"HOME_PROP_chandelier_candle_{idx}", (x, 2.45, 4.22), (0.055, 0.055, 0.18), materials["fire"])
        add_point_light(f"HOME_LIGHT_chandelier_{idx}", (x, 2.25, 4.3), 95, (1.0, 0.58, 0.23), radius=0.25)

    for idx, x in enumerate((-6.0, -3.0, 3.0, 6.0)):
        cube(f"HOME_PROP_torch_{idx}", (x, 6.02, 2.45), (0.06, 0.08, 0.34), materials["brass"], bevel=0.025)
        sphere(f"HOME_PROP_torch_flame_{idx}", (x, 5.92, 2.82), (0.12, 0.08, 0.22), materials["fire"])
        add_point_light(f"HOME_LIGHT_torch_{idx}", (x, 5.55, 2.85), 185, (1.0, 0.34, 0.09), radius=0.35)

    add_area_light("HOME_LIGHT_key", (-3.8, -2.0, 6.5), 900, (1.0, 0.58, 0.3), 6.0, target=(0, 2.4, 1.8))
    add_area_light("HOME_LIGHT_fill", (5.0, 1.0, 5.2), 520, (0.22, 0.38, 0.58), 5.0, target=(0, 3.2, 2.0))
    add_area_light("HOME_LIGHT_back", (0, 7.0, 5.8), 650, (1.0, 0.41, 0.14), 4.0, target=(0, 2.5, 2.2))

    camera_data = bpy.data.cameras.new("HOME_CAMERA_CANONICAL")
    camera_data.lens = 42.0
    camera_data.sensor_width = 36.0
    camera = bpy.data.objects.new("HOME_CAMERA_CANONICAL", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (0.0, -15.8, 5.25)
    target = (0.0, 2.65, 2.05)
    look_at(camera, target)
    scene.camera = camera

    try:
        scene.view_settings.look = "AgX - Medium High Contrast"
    except Exception:
        try:
            scene.view_settings.look = "Medium High Contrast"
        except Exception:
            pass
    return scene, camera, target, width, height, render_width, render_height


def render(scene, path: Path) -> None:
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    root = Path.cwd()
    reference = (root / args.reference).resolve()
    if not reference.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference}")

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    scene, camera, target, width, height, render_width, render_height = build_scene(reference, args.samples, args.max_width, args.engine)

    blend_path = out_dir / "home-v2-blockout.blend"
    beauty_path = out_dir / "home-v2-preview.png"
    clay_path = out_dir / "home-v2-clay.png"
    metadata_path = out_dir / "home-v2-camera.json"

    render(scene, beauty_path)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

    clay = material("HOME_MAT_clay_override", (0.34, 0.30, 0.26, 1), roughness=0.88)
    for obj in bpy.data.objects:
        if obj.type == "MESH" and obj.data.materials:
            obj.data.materials.clear()
            obj.data.materials.append(clay)
    render(scene, clay_path)

    metadata = {
        "contract": CONTRACT,
        "reference": args.reference,
        "reference_size": [width, height],
        "render_size": [render_width, render_height],
        "engine": args.engine,
        "camera": {
            "name": camera.name,
            "lens_mm": camera.data.lens,
            "sensor_width_mm": camera.data.sensor_width,
            "position": [round(v, 6) for v in camera.location],
            "rotation_euler": [round(v, 6) for v in camera.rotation_euler],
            "target": list(target),
        },
        "object_count": len(bpy.data.objects),
        "named_groups": {
            "architecture": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_ARCH_")),
            "props": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_PROP_")),
            "lights": sorted(o.name for o in bpy.data.objects if o.name.startswith("HOME_LIGHT_")),
        },
        "notes": [
            "Blockout only: camera, silhouette and destination masses before detail.",
            "The current runtime Home is intentionally untouched and remains the rollback baseline.",
        ],
    }
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"contract": CONTRACT, "output": str(out_dir), "objects": metadata["object_count"]}))


if __name__ == "__main__":
    main()
