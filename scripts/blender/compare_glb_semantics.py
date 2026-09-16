#!/usr/bin/env python3
"""Compare two GLB files for runtime-semantic equivalence.

Blender's exporter can reorder triangle lists and introduce tiny float noise
between otherwise identical renders, so byte equality is too strict for CI.
This comparator keeps the contract strong: JSON structure must match,
non-index integer accessors must match exactly, float accessors must match
within a small absolute tolerance, and triangle index buffers may differ only
by triangle ordering or cyclic rotation (winding is preserved).
"""
from __future__ import annotations

import argparse
import json
import math
import struct
from pathlib import Path
from typing import Iterable

JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942
TRIANGLES = 4
FLOAT_TOLERANCE = 1e-6

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


def index_accessor_modes(document: dict) -> dict[int, set[int]]:
    result: dict[int, set[int]] = {}
    for mesh in document.get("meshes", []):
        for primitive in mesh.get("primitives", []):
            if "indices" not in primitive:
                continue
            result.setdefault(primitive["indices"], set()).add(primitive.get("mode", TRIANGLES))
    return result


def compare(left_path: Path, right_path: Path, tolerance: float = FLOAT_TOLERANCE) -> None:
    left_doc, left_bin = read_glb(left_path)
    right_doc, right_bin = read_glb(right_path)

    if left_doc != right_doc:
        raise AssertionError("GLB JSON structure differs")

    index_modes = index_accessor_modes(left_doc)
    for index, accessor in enumerate(left_doc.get("accessors", [])):
        left_rows = decode_accessor(left_doc, left_bin, index)
        right_rows = decode_accessor(right_doc, right_bin, index)

        if index in index_modes:
            modes = index_modes[index]
            if modes != {TRIANGLES}:
                if left_rows != right_rows:
                    raise AssertionError(
                        f"index accessor {index} differs for unsupported primitive modes {sorted(modes)}"
                    )
                continue
            left_indices = [int(row[0]) for row in left_rows]
            right_indices = [int(row[0]) for row in right_rows]
            if triangle_signature(left_indices) != triangle_signature(right_indices):
                raise AssertionError(f"triangle topology differs in index accessor {index}")
            continue

        if accessor["componentType"] == 5126:
            for row_number, (left_row, right_row) in enumerate(zip(left_rows, right_rows)):
                for component, (left_value, right_value) in enumerate(zip(left_row, right_row)):
                    if not math.isclose(left_value, right_value, rel_tol=0.0, abs_tol=tolerance):
                        raise AssertionError(
                            f"float accessor {index} differs at row {row_number} component {component}: "
                            f"{left_value!r} != {right_value!r} (tol={tolerance})"
                        )
        elif left_rows != right_rows:
            raise AssertionError(f"integer accessor {index} differs")


def self_test() -> None:
    assert triangle_signature([0, 1, 2, 3, 4, 5]) == triangle_signature([4, 5, 3, 1, 2, 0])
    assert triangle_signature([0, 1, 2]) != triangle_signature([0, 2, 1])
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
