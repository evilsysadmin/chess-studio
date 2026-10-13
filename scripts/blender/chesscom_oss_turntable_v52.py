#!/usr/bin/env python3
"""CPU Blender turntable of a SHA-pinned CC0 tactical humanoid candidate.

A/B research only: no visual claim about Sven, no runtime publishing.
Input GLB is audited separately; this script never fetches from the network.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def arguments():
    p = argparse.ArgumentParser()
    p.add_argument("--source-glb", type=Path, required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, xyz, power, rgb):
    data = bpy.data.lights.new(name, type="AREA")
    data.energy = power
    data.color = rgb
    data.shape = "DISK"
    data.size = 3.2
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = xyz
    look_at(obj, (0, 0, 0.95))


def import_and_normalize(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(path.resolve()))
    items = list(bpy.context.scene.objects)
    meshes = [o for o in items if o.type == "MESH"]
    rigs = [o for o in items if o.type == "ARMATURE"]
    if not meshes:
        raise RuntimeError("technical-source-no-mesh")
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = [min(p[k] for p in points) for k in range(3)]
    high = [max(p[k] for p in points) for k in range(3)]
    dims = [high[k] - low[k] for k in range(3)]
    if not (0.01 < dims[2] < 1e4 and max(dims[:2]) > .01):
        raise RuntimeError("technical-source-degenerate-bounds")

    wrapper = bpy.data.objects.new("CHESSCOM_CC0_Technical_Candidate_Not_Sven", None)
    bpy.context.collection.objects.link(wrapper)
    item_set = set(items)
    for obj in items:
        if obj.parent in item_set:
            continue
        matrix = obj.matrix_world.copy()
        obj.parent = wrapper
        obj.matrix_world = matrix
    factor = 1.78 / dims[2]
    wrapper.scale = (factor,) * 3
    wrapper.location = (-factor * (low[0] + high[0]) / 2,
                        -factor * (low[1] + high[1]) / 2, -factor * low[2])
    bpy.context.view_layer.update()
    skinned_meshes = sum(
        any(mod.type == "ARMATURE" for mod in obj.modifiers)
        or bool(obj.vertex_groups) and (obj.parent in rigs)
        for obj in meshes
    )
    return {
        "objects": items,
        "root": wrapper,
        "technical_geometry": {
            "meshes": len(meshes), "armatures": len(rigs),
            "skinned_meshes": skinned_meshes,
            "source_bounds": [low, high],
            "normalized_height": 1.78,
            "action_names": sorted(bpy.data.actions.keys()),
        }
    }


def export_candidate(candidate, path):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in candidate["objects"] + [candidate["root"]]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = candidate["root"]
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True,
        export_animations=True, export_skins=True,
        export_yup=True, export_apply=False,
    )
    if not path.is_file() or path.stat().st_size < 1024:
        raise RuntimeError("candidate-export-missing")
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_studio():
    scene = bpy.context.scene
    available = {entry.identifier for entry in scene.render.bl_rna.properties["engine"].enum_items}
    # Cycles CPU avoids EGL/GPU initialization crashes on headless GitHub runners.
    for name in ("CYCLES", "BLENDER_WORKBENCH"):
        if name in available:
            scene.render.engine = name
            break
    if scene.render.engine == "CYCLES":
        scene.cycles.device = "CPU"
        scene.cycles.samples = 12
    scene.render.resolution_x = 256
    scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Sven_CC0_Test_World")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (.065, .08, .11, 1)
        background.inputs["Strength"].default_value = .6

    cam_data = bpy.data.cameras.new("CC0_8view_camera")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 1.55
    camera = bpy.data.objects.new("CC0_8view_camera", cam_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    area("blue_key", (2.5, -2.1, 4), 440, (.47, .68, 1))
    area("warm_fill", (-2.3, -1.9, 3), 510, (1, .72, .46))
    area("edge", (1, 3.5, 3.2), 230, (.6, .83, 1))
    return scene, camera


def main():
    args = arguments()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    candidate = import_and_normalize(args.source_glb)
    export_path = args.output_dir / "quaternius-cc0-preview.glb"
    candidate_sha = export_candidate(candidate, export_path)
    scene, camera = make_studio()
    scene.frame_set(1)
    previews = {}
    for index, direction in enumerate(DIRECTIONS):
        angle = index * math.pi / 4
        camera.location = (3.1 * math.sin(angle), -3.1 * math.cos(angle), 2.3)
        look_at(camera, (0, 0, .93))
        image = args.output_dir / f"view-{index:02d}-{direction}.png"
        scene.render.filepath = str(image)
        bpy.ops.render.render(write_still=True)
        payload = image.read_bytes()
        if len(payload) < 1024:
            raise RuntimeError("render-too-small:" + direction)
        previews[direction] = {
            "path": image.name, "bytes": len(payload),
            "sha256": hashlib.sha256(payload).hexdigest(),
        }
    if len({entry["sha256"] for entry in previews.values()}) != len(DIRECTIONS):
        raise RuntimeError("duplicate-view-pixels")
    report = {
        "identity": "chesscom-cc0-swat-eightview-v52",
        "review_only": True, "is_canonical_sven": False,
        "approved_for_runtime": False,
        "has_combat_animation_contract": False,
        "model": candidate["technical_geometry"],
        "exported_glb": {"file": export_path.name, "sha256": candidate_sha,
                         "bytes": export_path.stat().st_size},
        "blender_version": bpy.app.version_string,
        "views": previews,
    }
    (args.output_dir / "blender-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print("CHESSCOM_CC0_REVIEW_ONLY", report["exported_glb"], len(previews))


if __name__ == "__main__":
    main()
