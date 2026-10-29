#!/usr/bin/env python3
"""Render a second, non-exported V4 Blender preview with the desktop hybrid camera.

The canonical Blender hero preview/GLB remains unchanged. Run against the
authored .blend in a separate Blender process and save only PNG + provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
CAMERA_PROFILES = REPO_ROOT / "frontend/src/components/Board3DCameraProfiles.js"
ORIGINAL_TARGET = (0.0, -0.16, 2.20)  # Blender coordinates


def js_number(pattern: str, source: str) -> float:
    match = re.search(pattern, source)
    if not match:
        raise RuntimeError(f"Hybrid camera contract unavailable: {pattern}")
    return float(match.group(1))


def read_camera_contract() -> dict:
    source = CAMERA_PROFILES.read_text(encoding="utf-8")
    fov = js_number(r"WAR_ROOM_CANONICAL_CAMERA_FOV\s*=\s*([\d.]+)\s*;", source)
    old_span = js_number(r"mode:\s*'canonical-wide',\s*halfSpan:\s*([\d.]+)", source)
    hybrid_span = js_number(r"halfSpan:\s*wide\s*\?\s*([\d.]+)\s*:\s*base\.halfSpan", source)
    target_y = js_number(r"targetY:\s*wide\s*\?\s*([\d.]+)\s*:\s*base\.targetY", source)
    pitch = re.search(
        r"WAR_ROOM_V4_HYBRID_PITCH\s*=\s*Object\.freeze\(\{\s*cameraY:\s*([\d.]+),\s*cameraZ:\s*([\d.]+)\s*\}\)",
        source,
    )
    version = re.search(r"WAR_ROOM_V4_HYBRID_CAMERA_VERSION\s*=\s*'([^']+)'", source)
    if not pitch or not version:
        raise RuntimeError("Hybrid V4 pitch/version not found; refuse to guess the angle")
    pitch_y, pitch_z = map(float, pitch.groups())
    if not (20 <= fov <= 24 and 4.5 < hybrid_span < old_span < 6.5 and 0.5 < target_y < 2.5):
        raise RuntimeError("Unexpected V4 optics; preview requires explicit review")
    degrees = math.degrees(math.atan2(pitch_y, pitch_z))
    if not (44 < degrees < 52):
        raise RuntimeError(f"Unexpected hybrid pitch: {degrees}")
    return {
        "version": version.group(1),
        "profile_source_sha256": hashlib.sha256(source.encode("utf-8")).hexdigest(),
        "fov_deg": fov,
        "canonical_half_span": old_span,
        "hybrid_half_span": hybrid_span,
        "target_y": target_y,
        "pitch_y": pitch_y,
        "pitch_z": pitch_z,
        "pitch_deg": round(degrees, 6),
    }


def main() -> None:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--check-contract", action="store_true")
    args = parser.parse_args(argv)
    optics = read_camera_contract()
    if args.check_contract:
        print(json.dumps(optics, sort_keys=True))
        return
    if not args.preview or not args.report:
        parser.error("--preview and --report required for a Blender render")

    import bpy  # Pure Python contract checks do not require Blender.
    from mathutils import Vector

    scene = bpy.context.scene
    hero = bpy.data.objects.get("WR_CAMERA_hero")
    if hero is None or hero.type != "CAMERA":
        raise RuntimeError("Authored V4 hero camera missing; no substitute accepted")
    if (scene.render.resolution_x, scene.render.resolution_y) != (1600, 900):
        raise RuntimeError("Expected original 16:9 hero preview resolution")
    # Blender angle_y can report the physical sensor's vertical angle rather
    # than the actual scene/aspect projection. Measure the rendered frustum.
    frame = hero.data.view_frame(scene=scene)
    vertical_tan = max(abs(vertex.y / vertex.z) for vertex in frame)
    actual_fov = math.degrees(2 * math.atan(vertical_tan))
    if abs(actual_fov - optics["fov_deg"]) > 0.35:
        raise RuntimeError(f"Blender vertical projection drift: {actual_fov:.3f} vs {optics['fov_deg']:.3f}")

    original_distance = (hero.location - Vector(ORIGINAL_TARGET)).length
    if not (25 < original_distance < 35):
        raise RuntimeError(f"Blender hero original distance drift: {original_distance}")
    # Same focal length and padding: scale baseline distance by half-span ratio.
    distance = original_distance * optics["hybrid_half_span"] / optics["canonical_half_span"]
    target = Vector((0.0, ORIGINAL_TARGET[1], optics["target_y"]))
    direction = Vector((0.0, -optics["pitch_z"], optics["pitch_y"])).normalized()
    view = hero.copy()
    view.data = hero.data.copy()
    view.name = "WR4_EXPERIMENT_hybrid_camera_NOT_EXPORTED"
    scene.collection.objects.link(view)
    view.location = target + direction * distance
    view.rotation_euler = (target - view.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = view
    scene.render.image_settings.file_format = "PNG"
    args.preview.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(args.preview.resolve())
    bpy.ops.render.render(write_still=True)
    if not args.preview.is_file() or args.preview.stat().st_size < 50_000:
        raise RuntimeError("Hybrid camera preview missing/empty")
    report = {
        "schema": 1,
        "experiment": "war-room-v4-hybrid-blender-camera-preview-only",
        "canonical_hero_preserved": True,
        "glb_unmodified": True,
        "camera": optics,
        "source_blender_camera": hero.name,
        "original_distance": round(original_distance, 6),
        "hybrid_distance": round(distance, 6),
        "blender_target": [round(v, 6) for v in target],
        "blender_position": [round(v, 6) for v in view.location],
        "image_sha256": hashlib.sha256(args.preview.read_bytes()).hexdigest(),
    }
    args.report.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
