#!/usr/bin/env python3
"""Eight review-only Blender views of OUR authored, SHA-pinned Sven GLB.

No asset downloads. No external substitute model. Not a 96-frame animation bank.
Source must already exist and pass the authored rig audit.
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

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "art"))
from chesscom_owned_master_v40 import audit_candidate, verify_original_art  # noqa: E402

DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")


def arguments():
    p = argparse.ArgumentParser()
    p.add_argument("--master-glb", type=Path, required=True)
    p.add_argument("--sha256", required=True)
    p.add_argument("--output-dir", type=Path, required=True)
    return p.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def lamp(name, position, target, energy, color):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.color = color
    data.shape = "DISK"
    data.size = 3
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    point_at(obj, target)


def load_master(path):
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(path))
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH"]
    rigs = [o for o in scene.objects if o.type == "ARMATURE"]
    if not meshes or not rigs:
        raise RuntimeError("import-missing-mesh-or-armature")
    original_roots = [o for o in scene.objects if o.parent is None and o.type not in ("LIGHT", "CAMERA")]
    root = bpy.data.objects.new("Sven_authored_turntable", None)
    bpy.context.collection.objects.link(root)
    for obj in original_roots:
        world = obj.matrix_world.copy()
        obj.parent = root
        obj.matrix_world = world
    for obj in list(scene.objects):
        if obj.type in ("LIGHT", "CAMERA"):
            bpy.data.objects.remove(obj, do_unlink=True)
    bpy.context.view_layer.update()
    points = [o.matrix_world @ Vector(corner) for o in meshes for corner in o.bound_box]
    low = [min(v[i] for v in points) for i in range(3)]
    high = [max(v[i] for v in points) for i in range(3)]
    size = [high[i] - low[i] for i in range(3)]
    if not (.1 < size[2] < 100 and max(size[:2]) > .05):
        raise RuntimeError("invalid-master-bounds")
    factor = 1.78 / size[2]
    root.scale = (factor,) * 3
    root.location = (-factor * (low[0] + high[0]) / 2,
                     -factor * (low[1] + high[1]) / 2,
                     -factor * low[2])
    return root, {"mesh_count": len(meshes), "armature_count": len(rigs), "original_bounds": [low, high]}


def setup_scene():
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 256
    scene.render.resolution_y = 384
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    if scene.world is None:
        scene.world = bpy.data.worlds.new("Sven_authored_world")
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes.get("Background")
    if background:
        background.inputs["Color"].default_value = (.08, .12, .18, 1)
        background.inputs["Strength"].default_value = .5
    target = (0, 0, .9)
    camera_data = bpy.data.cameras.new("Sven_authored_camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 2.36
    camera = bpy.data.objects.new("Sven_authored_camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (3, -5.3, 3)
    point_at(camera, target)
    scene.camera = camera
    lamp("key-blue", (2, 1, 3), target, 46, (.4, .6, 1))
    lamp("fill-amber", (-2, -2.8, 3), target, 62, (1, .7, .4))
    lamp("rim", (1, 3, 2.5), target, 35, (.65, .78, 1))
    return scene


def main():
    args = arguments()
    references = verify_original_art()
    candidate = audit_candidate(args.master_glb, args.sha256)
    root, model = load_master(args.master_glb)
    scene = setup_scene()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    renders = {}
    for number, direction in enumerate(DIRECTIONS):
        root.rotation_euler.z = number * math.pi / 4
        bpy.context.view_layer.update()
        file = args.output_dir / f"sven-owned-{direction}.png"
        scene.render.filepath = str(file)
        bpy.ops.render.render(write_still=True)
        blob = file.read_bytes()
        if len(blob) < 1024:
            raise RuntimeError("empty-render:" + direction)
        renders[direction] = {"file": file.name, "sha256": hashlib.sha256(blob).hexdigest()}
    if len({item["sha256"] for item in renders.values()}) != len(DIRECTIONS):
        raise RuntimeError("duplicate-directional-renders")
    manifest = {
        "identity": "chesscom-sven-owned-master-v40", "review_only": True,
        "NOT_a_production_sprite_bank": True, "design_references": references,
        "candidate": candidate, "geometry": model, "resolution": [256, 384],
        "blender": bpy.app.version_string, "directions": renders,
    }
    (args.output_dir / "candidate-manifest.json").write_text(
        json.dumps(manifest, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print("CHESSCOM_V40_OWNED_ART_REVIEW_ONLY", len(renders), candidate["source_sha256"])


if __name__ == "__main__":
    main()
