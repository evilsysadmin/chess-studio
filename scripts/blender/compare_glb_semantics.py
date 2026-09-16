#!/usr/bin/env python3
"""Compare two GLB files for runtime-semantic equivalence.

Blender's exporter can reorder triangle lists, introduce tiny float noise, and
non-deterministically share or duplicate identical accessors between primitives.
Byte/JSON identity is therefore too strict for generated canonical art.

This comparator remains intentionally strong: the scene graph and all non-buffer
JSON must match, every accessor reference must exist in the same semantic place,
accessor metadata must match, integer values must match exactly, float values
must stay within a small absolute tolerance, and triangle buffers may differ only
by triangle ordering or cyclic rotation (winding is preserved).
"""
from __future__ import annotations

import argparse
import copy
import json
import math
import struct
from pathlib import Path
from typing import Iterable

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
TRIANGLES = 4
FLOAT_TOLERANCE = 1e-6
_ACCESSOR_SENTINEL = "<accessor>"

_COMPONENTS = {
    5120: ("b", 1),
    5121: ("B", 1),
    5122: ("h", 2),
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
_TYPE_WIDTH = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def read_glb(path: Path) -> tuple[dict, bytes]:
    data = path.read_bytes()
    if len(data) < 12:
        raise ValueError(f"{path}: truncated GLB header")
    magic, version, total_length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or total_length != len(data):
        raise ValueError(f"{path}: invalid GLB header")

    document = None
    binary = None
    offset = 12
    while offset < total_length:
        if offset + 8 > total_length:
            raise ValueError(f"{path}: truncated GLB chunk header")
        chunk_length, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset: offset + chunk_length]
        if len(chunk) != chunk_length:
            raise ValueError(f"{path}: truncated GLB chunk")
        offset += chunk_length
        if chunk_type == JSON_CHUNK:
            document = json.loads(chunk.decode("utf-8").rstrip(" \t\r\n\0"))
        elif chunk_type == BIN_CHUNK:
            binary = chunk

    if document is None or binary is None:
        raise ValueError(f"{path}: expected JSON and BIN chunks")
    if document.get("buffers") != [{"byteLength": len(binary)}]:
        raise ValueError(f"{path}: unexpected external/multiple buffer layout")
    return document, binary


def decode_accessor(document: dict, binary: bytes, index: int) -> list[tuple[int | float, ...]]:
    accessor = document["accessors"][index]
    if "sparse" in accessor:
        raise ValueError(f"accessor {index}: sparse accessors are not supported")
    view = document["bufferViews"][accessor["bufferView"]]
    fmt, component_size = _COMPONENTS[accessor["componentType"]]
    width = _TYPE_WIDTH[accessor["type"]]
    packed_size = component_size * width
    stride = view.get("byteStride", packed_size)
    base = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    row_fmt = "<" + fmt * width

    return [
        struct.unpack_from(row_fmt, binary, base + row * stride)
        for row in range(accessor["count"])
    ]


def triangle_signature(values: Iterable[int]) -> list[tuple[int, int, int]]:
    values = list(values)
    if len(values) % 3:
        raise ValueError("triangle index accessor length is not divisible by three")
    triangles = []
    for offset in range(0, len(values), 3):
        a, b, c = values[offset: offset + 3]
        triangles.append(min((a, b, c), (b, c, a), (c, a, b)))
    return sorted(triangles)


def _accessor_shape(accessor: dict) -> dict:
    """Metadata that affects decoded runtime values, excluding buffer placement."""
    return {
        key: accessor[key]
        for key in ("componentType", "type", "count", "normalized")
        if key in accessor
    }


def _mask_accessor_references(document: dict) -> dict:
    """Return non-buffer JSON with accessor identity replaced by semantic slots.

    Accessor indices are allocation details. Blender may share one identical
    index accessor between two spheres in one run and duplicate it in another.
    The actual accessor payloads are compared separately for every semantic use.
    """
    masked = copy.deepcopy(document)
    masked.pop("accessors", None)
    masked.pop("bufferViews", None)
    masked.pop("buffers", None)

    for mesh in masked.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if "indices" in primitive:
                primitive["indices"] = _ACCESSOR_SENTINEL
            for key in list(primitive.get("attributes", {})):
                primitive["attributes"][key] = _ACCESSOR_SENTINEL
            for target in primitive.get("targets", []):
                for key in list(target):
                    target[key] = _ACCESSOR_SENTINEL

    for animation in masked.get("animations", []):
        for sampler in animation.get("samplers", []):
            sampler["input"] = _ACCESSOR_SENTINEL
            sampler["output"] = _ACCESSOR_SENTINEL

    for skin in masked.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = _ACCESSOR_SENTINEL

    return masked


def _accessor_uses(document: dict) -> list[tuple[str, int, bool, int]]:
    """Enumerate (semantic location, accessor index, is_indices, primitive mode)."""
    uses: list[tuple[str, int, bool, int]] = []

    for mesh_index, mesh in enumerate(document.get("meshes", [])):
        mesh_name = mesh.get("name", f"mesh-{mesh_index}")
        for primitive_index, primitive in enumerate(mesh.get("primitives", [])):
            prefix = f"mesh[{mesh_index}] {mesh_name!r}/primitive[{primitive_index}]"
            mode = primitive.get("mode", TRIANGLES)
            if "indices" in primitive:
                uses.append((f"{prefix}/indices", primitive["indices"], True, mode))
            for attribute in sorted(primitive.get("attributes", {})):
                uses.append((
                    f"{prefix}/attributes/{attribute}",
                    primitive["attributes"][attribute],
                    False,
                    mode,
                ))
            for target_index, target in enumerate(primitive.get("targets", [])):
                for attribute in sorted(target):
                    uses.append((
                        f"{prefix}/targets[{target_index}]/{attribute}",
                        target[attribute],
                        False,
                        mode,
                    ))

    for animation_index, animation in enumerate(document.get("animations", [])):
        name = animation.get("name", f"animation-{animation_index}")
        for sampler_index, sampler in enumerate(animation.get("samplers", [])):
            prefix = f"animation[{animation_index}] {name!r}/sampler[{sampler_index}]"
            uses.append((f"{prefix}/input", sampler["input"], False, -1))
            uses.append((f"{prefix}/output", sampler["output"], False, -1))

    for skin_index, skin in enumerate(document.get("skins", [])):
        if "inverseBindMatrices" in skin:
            uses.append((
                f"skin[{skin_index}]/inverseBindMatrices",
                skin["inverseBindMatrices"],
                False,
                -1,
            ))

    return uses


def _compare_rows(
    *,
    location: str,
    left_accessor: dict,
    right_accessor: dict,
    left_rows: list[tuple[int | float, ...]],
    right_rows: list[tuple[int | float, ...]],
    is_indices: bool,
    primitive_mode: int,
    tolerance: float,
) -> None:
    if len(left_rows) != len(right_rows):
        raise AssertionError(f"{location}: accessor row count differs")

    if is_indices:
        if primitive_mode != TRIANGLES:
            if left_rows != right_rows:
                raise AssertionError(
                    f"{location}: index values differ for unsupported primitive mode {primitive_mode}"
                )
            return
        left_indices = [int(row[0]) for row in left_rows]
        right_indices = [int(row[0]) for row in right_rows]
        if triangle_signature(left_indices) != triangle_signature(right_indices):
            raise AssertionError(f"{location}: triangle topology differs")
        return

    if left_accessor["componentType"] == 5126:
        for row_number, (left_row, right_row) in enumerate(zip(left_rows, right_rows)):
            if len(left_row) != len(right_row):
                raise AssertionError(f"{location}: accessor width differs at row {row_number}")
            for component, (left_value, right_value) in enumerate(zip(left_row, right_row)):
                if not math.isclose(left_value, right_value, rel_tol=0.0, abs_tol=tolerance):
                    raise AssertionError(
                        f"{location}: float differs at row {row_number} component {component}: "
                        f"{left_value!r} != {right_value!r} (tol={tolerance})"
                    )
    elif left_rows != right_rows:
        raise AssertionError(f"{location}: integer accessor values differ")


def compare(left_path: Path, right_path: Path, tolerance: float = FLOAT_TOLERANCE) -> None:
    left_doc, left_bin = read_glb(left_path)
    right_doc, right_bin = read_glb(right_path)

    if _mask_accessor_references(left_doc) != _mask_accessor_references(right_doc):
        raise AssertionError("GLB non-buffer JSON structure differs")

    left_uses = _accessor_uses(left_doc)
    right_uses = _accessor_uses(right_doc)
    if [item[0] for item in left_uses] != [item[0] for item in right_uses]:
        raise AssertionError("GLB accessor semantic locations differ")

    for left_use, right_use in zip(left_uses, right_uses):
        location, left_index, left_is_indices, left_mode = left_use
        right_location, right_index, right_is_indices, right_mode = right_use
        assert location == right_location
        if left_is_indices != right_is_indices or left_mode != right_mode:
            raise AssertionError(f"{location}: accessor usage differs")

        left_accessor = left_doc["accessors"][left_index]
        right_accessor = right_doc["accessors"][right_index]
        if _accessor_shape(left_accessor) != _accessor_shape(right_accessor):
            raise AssertionError(
                f"{location}: accessor metadata differs: "
                f"{_accessor_shape(left_accessor)!r} != {_accessor_shape(right_accessor)!r}"
            )

        _compare_rows(
            location=location,
            left_accessor=left_accessor,
            right_accessor=right_accessor,
            left_rows=decode_accessor(left_doc, left_bin, left_index),
            right_rows=decode_accessor(right_doc, right_bin, right_index),
            is_indices=left_is_indices,
            primitive_mode=left_mode,
            tolerance=tolerance,
        )


def self_test() -> None:
    assert triangle_signature([0, 1, 2, 3, 4, 5]) == triangle_signature([4, 5, 3, 1, 2, 0])
    assert triangle_signature([0, 1, 2]) != triangle_signature([0, 2, 1])

    # Accessor allocation/sharing is not semantic. These two documents describe
    # the same two primitives even though one reuses accessor 0 and the other
    # duplicates it as accessor 1.
    shared = {
        "buffers": [{"byteLength": 6}],
        "bufferViews": [{"buffer": 0, "byteLength": 6}],
        "accessors": [{"bufferView": 0, "componentType": 5123, "count": 3, "type": "SCALAR"}],
        "meshes": [{"primitives": [{"indices": 0}, {"indices": 0}]}],
    }
    duplicated = {
        "buffers": [{"byteLength": 12}],
        "bufferViews": [
            {"buffer": 0, "byteLength": 6},
            {"buffer": 0, "byteOffset": 6, "byteLength": 6},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5123, "count": 3, "type": "SCALAR"},
            {"bufferView": 1, "componentType": 5123, "count": 3, "type": "SCALAR"},
        ],
        "meshes": [{"primitives": [{"indices": 0}, {"indices": 1}]}],
    }
    assert _mask_accessor_references(shared) == _mask_accessor_references(duplicated)
    assert [item[0] for item in _accessor_uses(shared)] == [item[0] for item in _accessor_uses(duplicated)]
    print("GLB semantic comparator self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("left", nargs="?", type=Path)
    parser.add_argument("right", nargs="?", type=Path)
    parser.add_argument("--tolerance", type=float, default=FLOAT_TOLERANCE)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if args.left is None or args.right is None:
        parser.error("left and right GLB paths are required")

    compare(args.left, args.right, args.tolerance)
    print(f"GLB semantic match OK · tolerance={args.tolerance:g}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
