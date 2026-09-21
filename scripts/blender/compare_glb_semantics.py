#!/usr/bin/env python3
"""Compare two GLB files for runtime-semantic equivalence.

Blender's exporter can reorder triangle lists, reuse or duplicate identical
accessors, and introduce tiny float noise between otherwise identical renders,
so byte or raw JSON equality is too strict for CI. This comparator dereferences
accessors while keeping the contract strong: scene structure must match,
non-index integer values must match exactly, float values must match within a
small absolute tolerance, and triangle lists may differ only by triangle order
or cyclic rotation (winding is preserved).
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
# Blender 5.2.x can recalculate otherwise identical split normals with roughly
# 3e-5 absolute drift between clean software renders. 1e-4 remains far below a
# visible mesh or animation change while keeping CI stable across runner CPUs.
FLOAT_TOLERANCE = 1e-4

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


def _accessor_payload(
    document: dict,
    binary: bytes,
    index: int,
    *,
    triangles: bool = False,
) -> dict:
    """Dereference an accessor so exporter allocation order is not semantic.

    Blender may either reuse or duplicate an identical accessor between two
    exports.  The numeric accessor id and the backing buffer offsets therefore
    are storage details, not runtime semantics.
    """
    accessor = document["accessors"][index]
    metadata = {
        key: value
        for key, value in accessor.items()
        if key not in {"bufferView", "byteOffset", "min", "max"}
    }
    rows = decode_accessor(document, binary, index)
    if triangles:
        values = [int(row[0]) for row in rows]
        rows = triangle_signature(values)
    return {
        "metadata": metadata,
        "rows": [list(row) for row in rows],
    }


def semantic_document(document: dict, binary: bytes) -> dict:
    """Return a document with every accessor reference replaced by its data."""
    result = copy.deepcopy(document)
    cache: dict[tuple[int, bool], dict] = {}

    def payload(index: int, *, triangles: bool = False) -> dict:
        key = (index, triangles)
        if key not in cache:
            cache[key] = _accessor_payload(
                document,
                binary,
                index,
                triangles=triangles,
            )
        return cache[key]

    for mesh in result.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            mode = primitive.get("mode", TRIANGLES)
            if "indices" in primitive:
                primitive["indices"] = payload(
                    primitive["indices"],
                    triangles=mode == TRIANGLES,
                )
            primitive["attributes"] = {
                name: payload(index)
                for name, index in primitive.get("attributes", {}).items()
            }
            primitive["targets"] = [
                {name: payload(index) for name, index in target.items()}
                for target in primitive.get("targets", [])
            ]

    for skin in result.get("skins", []):
        if "inverseBindMatrices" in skin:
            skin["inverseBindMatrices"] = payload(skin["inverseBindMatrices"])

    for animation in result.get("animations", []):
        for sampler in animation.get("samplers", []):
            sampler["input"] = payload(sampler["input"])
            sampler["output"] = payload(sampler["output"])

    # No Home Matthias asset embeds images. Fail explicitly if a future asset
    # introduces another bufferView consumer that this comparator must learn.
    for image in result.get("images", []):
        if "bufferView" in image:
            raise ValueError("embedded image bufferViews are not supported")

    result.pop("accessors", None)
    result.pop("bufferViews", None)
    result.pop("buffers", None)
    return result


def assert_equivalent(left, right, tolerance: float, path: str = "$") -> None:
    if isinstance(left, bool) or isinstance(right, bool):
        if left is not right:
            raise AssertionError(f"{path}: {left!r} != {right!r}")
        return
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        if isinstance(left, float) or isinstance(right, float):
            if not math.isclose(left, right, rel_tol=0.0, abs_tol=tolerance):
                raise AssertionError(
                    f"{path}: {left!r} != {right!r} (tol={tolerance})"
                )
        elif left != right:
            raise AssertionError(f"{path}: {left!r} != {right!r}")
        return
    if type(left) is not type(right):
        raise AssertionError(
            f"{path}: type {type(left).__name__} != {type(right).__name__}"
        )
    if isinstance(left, dict):
        if left.keys() != right.keys():
            raise AssertionError(f"{path}: object keys differ")
        for key in left:
            assert_equivalent(left[key], right[key], tolerance, f"{path}.{key}")
        return
    if isinstance(left, list):
        if len(left) != len(right):
            raise AssertionError(f"{path}: length {len(left)} != {len(right)}")
        for index, (left_value, right_value) in enumerate(zip(left, right)):
            assert_equivalent(
                left_value,
                right_value,
                tolerance,
                f"{path}[{index}]",
            )
        return
    if left != right:
        raise AssertionError(f"{path}: {left!r} != {right!r}")


def compare(left_path: Path, right_path: Path, tolerance: float = FLOAT_TOLERANCE) -> None:
    left_doc, left_bin = read_glb(left_path)
    right_doc, right_bin = read_glb(right_path)
    assert_equivalent(
        semantic_document(left_doc, left_bin),
        semantic_document(right_doc, right_bin),
        tolerance,
    )


def self_test() -> None:
    assert triangle_signature([0, 1, 2, 3, 4, 5]) == triangle_signature([4, 5, 3, 1, 2, 0])
    assert triangle_signature([0, 1, 2]) != triangle_signature([0, 2, 1])
    assert_equivalent(1.0, 1.0 + (FLOAT_TOLERANCE / 2), FLOAT_TOLERANCE)

    position = struct.pack("<fff", 1.0, 2.0, 3.0)
    shared = {
        "buffers": [{"byteLength": len(position)}],
        "bufferViews": [{"buffer": 0, "byteLength": len(position)}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 1, "type": "VEC3"}],
        "meshes": [
            {"primitives": [{"attributes": {"POSITION": 0}}]},
            {"primitives": [{"attributes": {"POSITION": 0}}]},
        ],
    }
    duplicated = copy.deepcopy(shared)
    duplicated["buffers"] = [{"byteLength": len(position) * 2}]
    duplicated["bufferViews"].append(
        {"buffer": 0, "byteOffset": len(position), "byteLength": len(position)}
    )
    duplicated["accessors"].append(
        {"bufferView": 1, "componentType": 5126, "count": 1, "type": "VEC3"}
    )
    duplicated["meshes"][1]["primitives"][0]["attributes"]["POSITION"] = 1
    assert_equivalent(
        semantic_document(shared, position),
        semantic_document(duplicated, position + position),
        FLOAT_TOLERANCE,
    )
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
