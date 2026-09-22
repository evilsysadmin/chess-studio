#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

from PIL import Image, ImageDraw

from sprite_forge import (
    GeometryError,
    LintConfig,
    PlacementContract,
    geometry_metrics,
    place_frame_fixed_scale,
)

CELL = 416
COLS = 8
ROWS = 18
ATLAS_SIZE = (CELL * COLS, CELL * ROWS)
DEFAULT_ROWS = (2, 6)  # run, crouch
ALPHA_THRESHOLD = 8
SAFE_MARGIN = 6
MIN_SCALE = 0.80
MAX_SCALE = 1.25


def crop_cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def row_reference_profile(atlas: Image.Image, row: int) -> tuple[float, float, float]:
    heights: list[float] = []
    centers: list[float] = []
    feet: list[float] = []
    for col in range(COLS):
        metrics = geometry_metrics(crop_cell(atlas, row, col), ALPHA_THRESHOLD)
        if metrics is None:
            raise GeometryError(f"reference-empty:{row}:{col}")
        heights.append(float(metrics.body_height))
        centers.append(float(metrics.body_center_x))
        feet.append(float(metrics.foot_y))
    return (
        float(statistics.median(heights)),
        float(statistics.median(centers)),
        float(statistics.median(feet)),
    )


def migrate(source: Image.Image, reference: Image.Image, rows: tuple[int, ...]) -> tuple[Image.Image, dict]:
    source = source.convert("RGBA")
    reference = reference.convert("RGBA")
    if source.size != ATLAS_SIZE:
        raise GeometryError(f"source-size:{source.size}!={ATLAS_SIZE}")
    if reference.size != ATLAS_SIZE:
        raise GeometryError(f"reference-size:{reference.size}!={ATLAS_SIZE}")

    out = source.copy()
    report: dict[str, object] = {"rows": {}, "ok": True}
    lint = LintConfig(
        alpha_threshold=ALPHA_THRESHOLD,
        edge_guard_px=2,
        min_detached_area=4,
        allowed_detached_components=0,
        reject_hidden_rgb=True,
    )

    for row in rows:
        if row < 0 or row >= ROWS:
            raise GeometryError(f"row-out-of-range:{row}")
        target_height, target_center_x, target_foot_y = row_reference_profile(reference, row)
        row_report: dict[str, object] = {
            "target_height": target_height,
            "target_center_x": target_center_x,
            "target_foot_y": target_foot_y,
            "frames": [],
        }
        for col in range(COLS):
            cell = crop_cell(source, row, col)
            metrics = geometry_metrics(cell, ALPHA_THRESHOLD)
            if metrics is None:
                raise GeometryError(f"source-empty:{row}:{col}")
            scale = target_height / float(metrics.body_height)
            if not MIN_SCALE <= scale <= MAX_SCALE:
                raise GeometryError(
                    f"scale-out-of-range:{row}:{col}:{scale:.4f}"
                )
            placed = place_frame_fixed_scale(
                cell,
                PlacementContract(
                    canvas_size=(CELL, CELL),
                    scale=scale,
                    body_center_x=target_center_x,
                    foot_y=target_foot_y,
                    safe_margin_px=SAFE_MARGIN,
                    foot_tolerance_px=2.0,
                    center_tolerance_px=3.0,
                ),
                lint,
            )
            post = geometry_metrics(placed, ALPHA_THRESHOLD)
            if post is None:
                raise GeometryError(f"post-empty:{row}:{col}")
            if abs(float(post.body_height) - target_height) > 3.0:
                raise GeometryError(
                    f"post-height:{row}:{col}:{post.body_height}!={target_height:.2f}"
                )
            out.paste(
                (0, 0, 0, 0),
                (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL),
            )
            out.alpha_composite(placed, (col * CELL, row * CELL))
            row_report["frames"].append(
                {
                    "frame": col,
                    "source_height": metrics.body_height,
                    "scale": round(scale, 6),
                    "output_height": post.body_height,
                    "foot_y": post.foot_y,
                    "center_x": post.body_center_x,
                }
            )
        report["rows"][str(row)] = row_report

    return out, report


def self_test() -> None:
    source = Image.new("RGBA", ATLAS_SIZE, (0, 0, 0, 0))
    reference = Image.new("RGBA", ATLAS_SIZE, (0, 0, 0, 0))
    for row in range(ROWS):
        for col in range(COLS):
            x = col * CELL
            y = row * CELL
            src = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            ref = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
            src_h = 180 if row in DEFAULT_ROWS else 220
            ref_h = 220
            ImageDraw.Draw(src).rectangle(
                (164, 382 - src_h, 251, 381),
                fill=(180, 120, 80, 255),
            )
            ImageDraw.Draw(ref).rectangle(
                (154, 382 - ref_h, 261, 381),
                fill=(180, 120, 80, 255),
            )
            source.alpha_composite(src, (x, y))
            reference.alpha_composite(ref, (x, y))

    migrated, report = migrate(source, reference, DEFAULT_ROWS)
    for row in DEFAULT_ROWS:
        for col in range(COLS):
            metrics = geometry_metrics(crop_cell(migrated, row, col), ALPHA_THRESHOLD)
            assert metrics is not None
            assert abs(metrics.body_height - 220) <= 3
            assert abs(metrics.foot_y - 382.0) <= 2
    assert report["ok"] is True
    print("OK legacy bank canonical-scale self-test")


def parse_rows(value: str) -> tuple[int, ...]:
    rows = tuple(int(part.strip()) for part in value.split(",") if part.strip())
    if not rows:
        raise argparse.ArgumentTypeError("at least one row is required")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--rows", type=parse_rows, default=DEFAULT_ROWS)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    required = [args.source, args.reference, args.output, args.report]
    if any(value is None for value in required):
        parser.error("--source, --reference, --output and --report are required")

    migrated, report = migrate(
        Image.open(args.source),
        Image.open(args.reference),
        tuple(args.rows),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    migrated.save(args.output, format="PNG", optimize=False, compress_level=9)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
