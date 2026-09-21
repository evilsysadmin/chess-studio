#!/usr/bin/env python3
"""Export the canonical Blender Home scene as a browser-runtime GLB.

This deliberately reuses build_home_v2_blockout.py as the single scene source
of truth. Review renders stay owned by the Blender preview workflow; this
export only prepares a compact Three.js-consumable scene for R2.
"""
from __future__ import annotations

import argparse
import json
import os
import struct
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

import build_home_v2_blockout as home


LOGICAL_ID = "home.scene.runtime"
RUNTIME_CONTRACT = "home-blender-runtime-v1"


def argv_after_double_dash() -> list[str]:
    if "--" not in sys.argv:
        return []
    return sys.argv[sys.argv.index("--") + 1 :]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=home.DEFAULT_REFERENCE)
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--samples", type=int, default=16)
    parser.add_argument("--max-width", type=int, default=1000)
    return parser.parse_args(argv_after_double_dash())


def _gltf_safe_image_socket(socket, *, normal=False) -> bool:
    """Return True when a Principled input is driven by a glTF-safe image chain."""
    if socket is None or not socket.is_linked or len(socket.links) != 1:
        return False
    source = socket.links[0].from_node
    if not normal:
        return source is not None and source.type == "TEX_IMAGE"
    if source is None or source.type != "NORMAL_MAP":
        return False
    color = source.inputs.get("Color")
    if color is None or not color.is_linked or len(color.links) != 1:
        return False
    image_node = color.links[0].from_node
    return image_node is not None and image_node.type == "TEX_IMAGE"


def flatten_runtime_materials() -> None:
    """Strip Blender-only procedural links while preserving glTF image maps.

    Review materials may use Noise/Bump nodes that glTF cannot serialize.
    Runtime export falls back to authored scalar/base values for those chains,
    but keeps direct Image Texture inputs (and Image Texture -> Normal Map)
    intact so packed PBR textures survive into the GLB.
    """
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf is None:
            continue

        for input_name in ("Base Color", "Roughness", "Metallic"):
            socket = bsdf.inputs.get(input_name)
            if socket is None or _gltf_safe_image_socket(socket):
                continue
            for link in list(socket.links):
                mat.node_tree.links.remove(link)

        normal = bsdf.inputs.get("Normal")
        if normal is not None and not _gltf_safe_image_socket(normal, normal=True):
            for link in list(normal.links):
                mat.node_tree.links.remove(link)

        base = bsdf.inputs.get("Base Color")
        if base is not None and not base.is_linked:
            base.default_value = tuple(mat.diffuse_color)


def convert_curves_to_meshes() -> int:
    converted = 0
    for obj in list(bpy.data.objects):
        if obj.type != "CURVE":
            continue
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.convert(target="MESH")
        obj.select_set(False)
        converted += 1
    return converted


def consolidate_static_architecture() -> tuple[int, int]:
    """Batch HOME_ARCH meshes by material for browser draw-call efficiency.

    Runtime Home interaction is owned by DOM/UI overlays, while animated fire
    and authored props retain their individual HOME_PROP names. Only static
    architecture is eligible for consolidation.
    """
    candidates = [
        obj for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("HOME_ARCH_")
    ]
    original_count = len(candidates)
    groups: dict[tuple[str, ...], list] = {}

    for obj in candidates:
        # Joining would otherwise discard non-active modifiers. Converting a
        # mesh to mesh bakes its bevel/solidify stack before batching.
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        if obj.modifiers:
            bpy.ops.object.convert(target="MESH")
        signature = tuple(mat.name if mat else "" for mat in obj.data.materials)
        groups.setdefault(signature, []).append(obj)

    batch_index = 0
    for signature, group in groups.items():
        live = [obj for obj in group if obj.name in bpy.context.scene.objects]
        if len(live) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for obj in live:
            obj.select_set(True)
        active = live[0]
        bpy.context.view_layer.objects.active = active
        bpy.ops.object.join()
        material_label = signature[0].replace("HOME_MAT_", "").lower() if signature else "mixed"
        active.name = f"HOME_ARCH_BATCH_{batch_index}_{material_label}"
        batch_index += 1

    remaining = sum(
        1 for obj in bpy.context.scene.objects
        if obj.type == "MESH" and obj.name.startswith("HOME_ARCH_")
    )
    return original_count, remaining


def select_runtime_geometry() -> int:
    bpy.ops.object.select_all(action="DESELECT")
    count = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        obj.select_set(True)
        count += 1
    return count


MESH_COMPRESSION_EXTENSION = "EXT_meshopt_compression"


def meshopt_export_kwargs() -> dict:
    """Ask the glTF exporter for Meshopt compression when this Blender supports it.

    The Home runtime GLB is dominated by vertex data, and Meshopt shrinks that to
    roughly a third (the War Room shell goes 9.8 -> 3.4 MB). The runtime loader
    decodes it with MeshoptDecoder and still reads uncompressed files, so a Blender
    without the library (a distro build) simply exports the uncompressed GLB.
    """
    properties = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    required = {"export_meshopt_compression_enable", "export_meshopt_extension"}
    if not required <= properties:
        return {}
    return {
        "export_meshopt_compression_enable": True,
        "export_meshopt_extension": MESH_COMPRESSION_EXTENSION,
    }


def glb_extensions_used(path: Path) -> set:
    raw = Path(path).read_bytes()
    if len(raw) < 20 or raw[:4] != b"glTF":
        raise SystemExit(f"invalid GLB header: {path}")
    chunk_length, chunk_type = struct.unpack_from("<II", raw, 12)
    if chunk_type != 0x4E4F534A:
        raise SystemExit(f"GLB JSON chunk missing: {path}")
    document = json.loads(raw[20:20 + chunk_length].decode("utf-8").rstrip("\x00 \t\r\n"))
    return set(document.get("extensionsUsed", []))


def main() -> None:
    args = parse_args()
    root = Path.cwd()
    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    reference_source = (root / args.reference).resolve()
    if not reference_source.is_file():
        raise SystemExit(f"Canonical Home reference not found: {reference_source}")
    reference = home.materialize_reference(reference_source, out_dir)

    home.reset_scene()
    scene, camera, target, width, height, render_width, render_height = home.build_scene(
        reference,
        args.samples,
        args.max_width,
        "eevee",
    )

    flatten_runtime_materials()
    converted_curves = convert_curves_to_meshes()
    architecture_meshes_before, architecture_meshes_after = consolidate_static_architecture()
    mesh_count = select_runtime_geometry()
    if mesh_count < 80:
        raise SystemExit(f"Refusing suspicious Home runtime export with only {mesh_count} meshes")

    glb_path = out_dir / "home-v2-runtime.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(glb_path),
        export_format="GLB",
        use_selection=True,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_materials="EXPORT",
        **meshopt_export_kwargs(),
    )
    if not glb_path.is_file() or glb_path.stat().st_size < 100_000:
        raise SystemExit(f"Home runtime GLB missing or unexpectedly small: {glb_path}")

    meshopt = MESH_COMPRESSION_EXTENSION in glb_extensions_used(glb_path)
    if os.environ.get("HOME_RUNTIME_REQUIRE_MESHOPT") == "1" and not meshopt:
        raise SystemExit(
            f"Home runtime GLB was exported without {MESH_COMPRESSION_EXTENSION}; "
            "the CI Blender must support Meshopt"
        )

    metadata = {
        "contract": RUNTIME_CONTRACT,
        "source_contract": home.CONTRACT,
        "logical_id": LOGICAL_ID,
        "reference_contract": "user-approved-home-canon-2026-09-18",
        "reference_size": [width, height],
        "review_render_size": [render_width, render_height],
        "camera": {
            "position": [round(v, 6) for v in camera.location],
            "rotation_euler": [round(v, 6) for v in camera.rotation_euler],
            "target": list(target),
        },
        "mesh_count": mesh_count,
        "converted_curves": converted_curves,
        "architecture_meshes_before": architecture_meshes_before,
        "architecture_meshes_after": architecture_meshes_after,
        "materials": len(bpy.data.materials),
        "bytes": glb_path.stat().st_size,
        "meshopt": meshopt,
    }
    (out_dir / "home-v2-runtime.json").write_text(
        json.dumps(metadata, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
