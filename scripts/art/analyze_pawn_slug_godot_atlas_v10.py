#!/usr/bin/env python3
"""Measure strict-v10 Matthias silhouette continuity before runtime promotion.

This is intentionally geometry-only. It does not try to judge art style; it
catches the class of visual discontinuity where one animation row suddenly
switches to a materially different silhouette, pivot, or costume mass.

A candidate may still be rendered and reviewed when this reports issues. The
hard failure is reserved for attempts to promote the candidate to production.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import statistics
import tempfile

from PIL import Image, ImageDraw

ALPHA_THRESHOLD = 30
MAX_BOTTOM_SPAN = 3.0
ACTION_LIMITS = {
    "walk": {"centroid_x_span": 40.0, "left_span": 45.0},
    "run": {"centroid_x_span": 45.0, "left_span": 50.0},
    "jump": {"centroid_x_span": 40.0, "left_span": 45.0},
    "crouch_walk": {"centroid_x_span": 28.0, "left_span": 30.0},
    "move_fire": {"centroid_x_span": 45.0, "left_span": 45.0},
}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--atlas", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--report", type=Path)
    p.add_argument("--require-promotable", action="store_true")
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def frame_metrics(cell: Image.Image) -> dict:
    alpha = cell.getchannel("A")
    box = alpha.point(lambda value: 255 if value > ALPHA_THRESHOLD else 0).getbbox()
    if box is None:
        raise ValueError("empty authored frame")
    x0, y0, x1, y1 = box
    pixels = alpha.load()
    xs: list[int] = []
    ys: list[int] = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            if pixels[x, y] > ALPHA_THRESHOLD:
                xs.append(x)
                ys.append(y)
    if not xs:
        raise ValueError("empty authored frame after alpha threshold")
    return {
        "left": x0,
        "top": y0,
        "right": x1 - 1,
        "bottom": y1 - 1,
        "width": x1 - x0,
        "height": y1 - y0,
        "area": len(xs),
        "centroid_x": sum(xs) / len(xs),
        "centroid_y": sum(ys) / len(ys),
    }


def span(values: list[float]) -> float:
    return max(values) - min(values) if values else 0.0


def coefficient_of_variation(values: list[float]) -> float:
    if not values:
        return 0.0
    mean = statistics.fmean(values)
    if abs(mean) < 1e-9:
        return 0.0
    return statistics.pstdev(values) / mean


def analyze(atlas: Image.Image, manifest: dict) -> dict:
    atlas_meta = manifest["atlas"]
    cell_size = int(atlas_meta["cell_size"])
    expected_size = (int(atlas_meta["width"]), int(atlas_meta["height"]))
    if atlas.size != expected_size:
        raise ValueError(f"atlas size drift: {atlas.size} != {expected_size}")

    actions_report = []
    issues: list[dict] = []
    for action in manifest["actions"]:
        name = str(action["name"])
        row = int(action["row"])
        frames = int(action["frames"])
        metrics = []
        for column in range(frames):
            cell = atlas.crop((
                column * cell_size,
                row * cell_size,
                (column + 1) * cell_size,
                (row + 1) * cell_size,
            ))
            try:
                item = frame_metrics(cell)
            except ValueError as exc:
                issues.append({
                    "action": name,
                    "kind": "empty_frame",
                    "frame": column,
                    "message": str(exc),
                })
                continue
            item["frame"] = column
            metrics.append(item)

        if not metrics:
            continue
        centroid_x_span = span([float(item["centroid_x"]) for item in metrics])
        left_span = span([float(item["left"]) for item in metrics])
        bottom_span = span([float(item["bottom"]) for item in metrics])
        width_span = span([float(item["width"]) for item in metrics])
        area_cv = coefficient_of_variation([float(item["area"]) for item in metrics])
        summary = {
            "name": name,
            "frames": frames,
            "centroid_x_span_px": round(centroid_x_span, 3),
            "left_edge_span_px": round(left_span, 3),
            "bottom_span_px": round(bottom_span, 3),
            "width_span_px": round(width_span, 3),
            "area_cv": round(area_cv, 5),
            "frames_meta": metrics,
        }
        actions_report.append(summary)

        if bottom_span > MAX_BOTTOM_SPAN:
            issues.append({
                "action": name,
                "kind": "ground_anchor_drift",
                "value": round(bottom_span, 3),
                "limit": MAX_BOTTOM_SPAN,
                "message": f"{name}: foot/bottom anchor spans {bottom_span:.1f}px",
            })

        limits = ACTION_LIMITS.get(name)
        if limits:
            if centroid_x_span > limits["centroid_x_span"]:
                issues.append({
                    "action": name,
                    "kind": "centroid_jump",
                    "value": round(centroid_x_span, 3),
                    "limit": limits["centroid_x_span"],
                    "message": (
                        f"{name}: horizontal silhouette centroid spans "
                        f"{centroid_x_span:.1f}px > {limits['centroid_x_span']:.1f}px"
                    ),
                })
            if left_span > limits["left_span"]:
                issues.append({
                    "action": name,
                    "kind": "left_edge_jump",
                    "value": round(left_span, 3),
                    "limit": limits["left_span"],
                    "message": (
                        f"{name}: left silhouette edge spans "
                        f"{left_span:.1f}px > {limits['left_span']:.1f}px"
                    ),
                })

    return {
        "schema": 1,
        "kind": "pawn-slug-matthias-silhouette-continuity",
        "promotable": not issues,
        "limits": {
            "max_bottom_span_px": MAX_BOTTOM_SPAN,
            "action_limits": ACTION_LIMITS,
        },
        "actions": actions_report,
        "issues": issues,
    }


def write_report(report: dict, path: Path | None) -> None:
    payload = json.dumps(report, indent=2, sort_keys=True) + "\n"
    if path:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(payload, encoding="utf-8")
    print(payload, end="")
    if os.environ.get("GITHUB_ACTIONS") == "true":
        for issue in report["issues"]:
            message = str(issue["message"]).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
            print(f"::warning title=Matthias silhouette continuity::{message}")


def self_test() -> None:
    cell = 64
    actions = [{"name": "run", "row": 0, "frames": 4}]
    manifest = {
        "atlas": {"cell_size": cell, "width": cell * 4, "height": cell},
        "actions": actions,
    }

    good = Image.new("RGBA", (cell * 4, cell), (0, 0, 0, 0))
    draw = ImageDraw.Draw(good)
    for col in range(4):
        x = col * cell + 20 + (col % 2)
        draw.rectangle((x, 18, x + 22, 54), fill=(40, 40, 40, 255))
    assert analyze(good, manifest)["promotable"] is True

    bad = good.copy()
    draw = ImageDraw.Draw(bad)
    draw.rectangle((3 * cell, 0, 4 * cell - 1, cell - 1), fill=(0, 0, 0, 0))
    draw.rectangle((3 * cell + 2, 18, 3 * cell + 24, 54), fill=(40, 40, 40, 255))
    result = analyze(bad, manifest)
    assert result["promotable"] is False
    assert any(issue["kind"] in {"centroid_jump", "left_edge_jump"} for issue in result["issues"])
    print("OK strict-v10 silhouette continuity self-test")


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.atlas or not args.manifest:
        raise SystemExit("--atlas and --manifest are required")
    atlas = Image.open(args.atlas).convert("RGBA")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    report = analyze(atlas, manifest)
    write_report(report, args.report)
    if args.require_promotable and not report["promotable"]:
        print("strict-v10 candidate is not visually promotable", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
