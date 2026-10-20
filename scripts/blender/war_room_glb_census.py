#!/usr/bin/env python3
"""Report potential static-shell geometry cost from the actual exported War Room GLB.

This is an offline geometry census, not a WebGL draw or FPS benchmark. It counts
only nodes reachable from the default glTF scene, including repeated mesh uses.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def _accessor_count(accessors, index: int) -> int:
    if type(index) is not int or not 0 <= index < len(accessors):
        raise ValueError(f"invalid glTF accessor index: {index!r}")
    count = accessors[index].get("count")
    if type(count) is not int or count < 0:
        raise ValueError(f"invalid glTF accessor count: {count!r}")
    return count


def _mesh_cost(mesh: dict, accessors: list[dict]) -> tuple[int, int, int]:
    triangles = vertices = 0
    primitives = mesh.get("primitives", [])
    for primitive in primitives:
        # Blender exports triangle primitives. Never label strips/lines as zero.
        if primitive.get("mode", 4) != 4:
            raise ValueError("non-triangle primitive; census would undercount")
        position = primitive.get("attributes", {}).get("POSITION")
        vertex_count = _accessor_count(accessors, position)
        index_count = (
            _accessor_count(accessors, primitive["indices"])
            if "indices" in primitive else vertex_count
        )
        if index_count % 3:
            raise ValueError("triangle primitive index/vertex count not divisible by 3")
        triangles += index_count // 3
        vertices += vertex_count
    return triangles, vertices, len(primitives)


def census_scene(document: dict, *, top: int = 12) -> dict:
    """Count triangles submitted *if all shell nodes were visible*, not actual GPU work."""
    scenes = document.get("scenes", [])
    scene_index = document.get("scene", 0)
    if type(scene_index) is not int or not 0 <= scene_index < len(scenes):
        raise ValueError("GLB has no valid default scene")
    nodes = document.get("nodes", [])
    meshes = document.get("meshes", [])
    accessors = document.get("accessors", [])
    costs = [_mesh_cost(mesh, accessors) for mesh in meshes]
    rows = []
    used_meshes = set()
    total_triangles = total_vertices = draw_primitives = 0

    def visit(index: int, parents: frozenset[int]) -> None:
        nonlocal total_triangles, total_vertices, draw_primitives
        if type(index) is not int or not 0 <= index < len(nodes):
            raise ValueError(f"invalid scene node: {index!r}")
        if index in parents:
            raise ValueError("cyclic glTF node graph")
        node = nodes[index]
        if "EXT_mesh_gpu_instancing" in node.get("extensions", {}):
            raise ValueError("GPU instancing needs a separate instance census")
        if "mesh" in node:
            mesh_id = node["mesh"]
            if type(mesh_id) is not int or not 0 <= mesh_id < len(meshes):
                raise ValueError(f"invalid mesh reference: {mesh_id!r}")
            triangles, vertices, primitives = costs[mesh_id]
            used_meshes.add(mesh_id)
            total_triangles += triangles
            total_vertices += vertices
            draw_primitives += primitives
            rows.append({
                "node": node.get("name") or f"node-{index}",
                "mesh": meshes[mesh_id].get("name") or f"mesh-{mesh_id}",
                "nodeIndex": index,
                "meshIndex": mesh_id,
                "triangles": triangles,
                "vertices": vertices,
                "primitives": primitives,
            })
        for child in node.get("children", []):
            visit(child, parents | {index})

    for root in scenes[scene_index].get("nodes", []):
        visit(root, frozenset())

    return {
        "scene": scenes[scene_index].get("name", str(scene_index)),
        "meshInstances": len(rows),
        "uniqueMeshes": len(used_meshes),
        "primitiveInstances": draw_primitives,
        "potentialTriangles": total_triangles,
        "uniqueMeshTriangles": sum(costs[i][0] for i in used_meshes),
        "vertexReferences": total_vertices,
        "topNodes": sorted(rows, key=lambda row: (-row["triangles"], row["nodeIndex"]))[:top],
    }


def render_census_markdown(reports: list[dict]) -> str:
    """CI geometry report: potential shell cost, not observed renderer work."""
    lines = [
        "### War Room · exported GLB geometry census", "",
        "Potential triangle/primitive counts assume every shell node is visible. "
        "**Not** actual GPU draw calls, shadows, culling or FPS.", "",
        "| GLB | SHA-256 | Potential triangles | Unique triangles | Mesh instances | Primitive instances | Bytes |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in reports:
        lines.append(
            f"| {Path(row['file']).name} | {row['sha256']} | "
            f"{row['potentialTriangles']:,} | {row['uniqueMeshTriangles']:,} | "
            f"{row['meshInstances']:,} | {row['primitiveInstances']:,} | {row['glbBytes']:,} |"
        )
        lines.extend([
            "", f"**Largest nodes — {Path(row['file']).name}**", "",
            "| Node | Mesh | Potential triangles |", "| --- | --- | ---: |",
        ])
        for node in row["topNodes"]:
            lines.append(f"| {node['node']} | {node['mesh']} | {node['triangles']:,} |")
    return "\n".join(lines) + "\n"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("glb", nargs="+", type=Path, help="exported War Room GLB(s)")
    parser.add_argument("--top", type=int, default=12, help="largest scene nodes (default 12)")
    parser.add_argument("--json", action="store_true", help="machine-readable JSON")
    parser.add_argument("--output-json", type=Path, help="write geometry JSON artifact")
    parser.add_argument("--summary-file", type=Path, help="append Markdown to CI step summary")
    args = parser.parse_args(argv)
    if args.top < 0:
        parser.error("--top cannot be negative")
    from compare_glb_semantics import read_glb  # reuse the strict existing GLB reader

    reports = []
    for path in args.glb:
        document, _ = read_glb(path)
        report = {"file": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                  "glbBytes": path.stat().st_size, **census_scene(document, top=args.top)}
        if report["meshInstances"] <= 0 or report["potentialTriangles"] <= 0:
            raise ValueError(f"{path}: exported War Room scene has no renderable geometry")
        reports.append(report)
    if args.output_json:
        args.output_json.write_text(json.dumps(reports, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    if args.summary_file:
        with args.summary_file.open("a", encoding="utf-8") as handle:
            handle.write(render_census_markdown(reports))
    if args.json:
        print(json.dumps(reports, indent=2, ensure_ascii=False))
    else:
        for row in reports:
            print(f"{row['file']}: {row['potentialTriangles']:,} potential triangles, "
                  f"{row['uniqueMeshTriangles']:,} unique mesh triangles; "
                  f"{row['meshInstances']} mesh instances, "
                  f"{row['primitiveInstances']} potential primitive submissions, "
                  f"{row['glbBytes']:,} GLB bytes")
            for node in row["topNodes"]:
                print(f"  {node['triangles']:>10,} tri  {node['node']}  [{node['mesh']}]")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
