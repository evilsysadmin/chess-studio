#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
from collections import deque
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw

from sprite_forge import (
    GeometryError,
    LintConfig,
    PlacementContract,
    geometry_metrics,
    lint_frame,
    place_frame_fixed_scale,
)

DEFAULT_CELL = 416
DEFAULT_COLS = 8
DEFAULT_ROW_COUNT = 18
DEFAULT_TARGET_ROWS = (2, 6)  # run, crouch
ALPHA_THRESHOLD = 8
SAFE_MARGIN = 6
MIN_SCALE = 0.80
MAX_SCALE = 1.25
LEGACY_NOISE_MAX_ALPHA = 16


@dataclass(frozen=True)
class Grid:
    cell: int
    columns: int
    rows: int

    @property
    def size(self) -> tuple[int, int]:
        return (self.cell * self.columns, self.cell * self.rows)


def crop_cell(atlas: Image.Image, grid: Grid, row: int, col: int) -> Image.Image:
    return atlas.crop(
        (
            col * grid.cell,
            row * grid.cell,
            (col + 1) * grid.cell,
            (row + 1) * grid.cell,
        )
    )


def row_reference_profile(
    atlas: Image.Image,
    grid: Grid,
    row: int,
) -> tuple[float, float, float]:
    heights: list[float] = []
    centers: list[float] = []
    feet: list[float] = []
    for col in range(grid.columns):
        metrics = geometry_metrics(crop_cell(atlas, grid, row, col), ALPHA_THRESHOLD)
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


def clean_legacy_detached_noise(image: Image.Image) -> tuple[Image.Image, list[dict]]:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    alpha_px = alpha.load()
    visited = bytearray(width * height)
    components: list[list[tuple[int, int]]] = []

    for y in range(height):
        for x in range(width):
            idx = y * width + x
            if visited[idx] or alpha_px[x, y] < ALPHA_THRESHOLD:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            visited[idx] = 1
            pixels: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                pixels.append((px, py))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = px + dx, py + dy
                        if not (0 <= nx < width and 0 <= ny < height):
                            continue
                        nidx = ny * width + nx
                        if visited[nidx] or alpha_px[nx, ny] < ALPHA_THRESHOLD:
                            continue
                        visited[nidx] = 1
                        queue.append((nx, ny))
            components.append(pixels)

    if not components:
        return rgba, []
    components.sort(key=len, reverse=True)
    cleaned = rgba.copy()
    cleaned_px = cleaned.load()
    removed: list[dict] = []

    for pixels in components[1:]:
        max_alpha = max(alpha_px[x, y] for x, y in pixels)
        xs = [x for x, _ in pixels]
        ys = [y for _, y in pixels]
        bbox = (min(xs), min(ys), max(xs) + 1, max(ys) + 1)
        if max_alpha > LEGACY_NOISE_MAX_ALPHA:
            raise GeometryError(
                f"detached-opaque:area={len(pixels)}:bbox={bbox}:max-alpha={max_alpha}"
            )
        for x, y in pixels:
            cleaned_px[x, y] = (0, 0, 0, 0)
        removed.append(
            {
                "area": len(pixels),
                "bbox": bbox,
                "max_alpha": max_alpha,
            }
        )

    return cleaned, removed


def migrate(
    source: Image.Image,
    reference: Image.Image,
    grid: Grid,
    target_rows: tuple[int, ...],
) -> tuple[Image.Image, dict]:
    source = source.convert("RGBA")
    reference = reference.convert("RGBA")
    if source.size != grid.size:
        raise GeometryError(f"source-size:{source.size}!={grid.size}")
    if reference.size != grid.size:
        raise GeometryError(f"reference-size:{reference.size}!={grid.size}")

    out = source.copy()
    report: dict[str, object] = {
        "ok": True,
        "grid": {
            "cell": grid.cell,
            "columns": grid.columns,
            "rows": grid.rows,
        },
        "rows": {},
    }
    lint = LintConfig(
        alpha_threshold=ALPHA_THRESHOLD,
        edge_guard_px=2,
        min_detached_area=4,
        allowed_detached_components=0,
        reject_hidden_rgb=True,
    )

    for row in target_rows:
        if row < 0 or row >= grid.rows:
            raise GeometryError(f"row-out-of-range:{row}")
        target_height, target_center_x, target_foot_y = row_reference_profile(
            reference, grid, row
        )
        row_report: dict[str, object] = {
            "target_height": target_height,
            "target_center_x": target_center_x,
            "target_foot_y": target_foot_y,
            "frames": [],
        }
        for col in range(grid.columns):
            cell = crop_cell(source, grid, row, col)
            try:
                cell, removed_noise = clean_legacy_detached_noise(cell)
            except GeometryError as exc:
                raise GeometryError(f"frame:{row}:{col}:{exc}") from exc
            raw_lint = lint_frame(cell, lint)
            if not raw_lint.ok:
                detached = [
                    {
                        "area": component.area,
                        "bbox": component.bbox,
                        "centroid": tuple(round(value, 2) for value in component.centroid),
                    }
                    for component in raw_lint.detached_components
                ]
                raise GeometryError(
                    f"frame:{row}:{col}:raw-lint={raw_lint.errors}:detached={detached}"
                )
            metrics = geometry_metrics(cell, ALPHA_THRESHOLD)
            if metrics is None:
                raise GeometryError(f"source-empty:{row}:{col}")
            scale = target_height / float(metrics.body_height)
            if not MIN_SCALE <= scale <= MAX_SCALE:
                raise GeometryError(
                    f"scale-out-of-range:{row}:{col}:{scale:.4f}"
                )
            try:
                placed = place_frame_fixed_scale(
                    cell,
                    PlacementContract(
                        canvas_size=(grid.cell, grid.cell),
                        scale=scale,
                        body_center_x=target_center_x,
                        foot_y=target_foot_y,
                        safe_margin_px=SAFE_MARGIN,
                        foot_tolerance_px=2.0,
                        center_tolerance_px=3.0,
                    ),
                    lint,
                )
            except GeometryError as exc:
                raise GeometryError(
                    f"frame:{row}:{col}:source-height={metrics.body_height}:"
                    f"scale={scale:.4f}:{exc}"
                ) from exc
            post = geometry_metrics(placed, ALPHA_THRESHOLD)
            if post is None:
                raise GeometryError(f"post-empty:{row}:{col}")
            if abs(float(post.body_height) - target_height) > 3.0:
                raise GeometryError(
                    f"post-height:{row}:{col}:{post.body_height}!={target_height:.2f}"
                )

            box = (
                col * grid.cell,
                row * grid.cell,
                (col + 1) * grid.cell,
                (row + 1) * grid.cell,
            )
            out.paste((0, 0, 0, 0), box)
            out.alpha_composite(placed, (box[0], box[1]))
            row_report["frames"].append(
                {
                    "frame": col,
                    "source_height": metrics.body_height,
                    "scale": round(scale, 6),
                    "output_height": post.body_height,
                    "foot_y": post.foot_y,
                    "center_x": post.body_center_x,
                    "removed_legacy_noise": removed_noise,
                }
            )
        report["rows"][str(row)] = row_report

    return out, report


def synthetic_atlas(grid: Grid, target_height: int, source_height: int) -> tuple[Image.Image, Image.Image]:
    source = Image.new("RGBA", grid.size, (0, 0, 0, 0))
    reference = Image.new("RGBA", grid.size, (0, 0, 0, 0))
    foot_y = grid.cell - 34
    for row in range(grid.rows):
        for col in range(grid.columns):
            x = col * grid.cell
            y = row * grid.cell
            src = Image.new("RGBA", (grid.cell, grid.cell), (0, 0, 0, 0))
            ref = Image.new("RGBA", (grid.cell, grid.cell), (0, 0, 0, 0))
            ImageDraw.Draw(src).rectangle(
                (grid.cell // 2 - 44, foot_y - source_height, grid.cell // 2 + 43, foot_y - 1),
                fill=(180, 120, 80, 255),
            )
            ImageDraw.Draw(ref).rectangle(
                (grid.cell // 2 - 54, foot_y - target_height, grid.cell // 2 + 53, foot_y - 1),
                fill=(180, 120, 80, 255),
            )
            source.alpha_composite(src, (x, y))
            reference.alpha_composite(ref, (x, y))
    return source, reference


def assert_grid_case(grid: Grid, rows: tuple[int, ...]) -> None:
    source, reference = synthetic_atlas(grid, target_height=220, source_height=180)
    migrated, report = migrate(source, reference, grid, rows)
    for row in rows:
        for col in range(grid.columns):
            metrics = geometry_metrics(crop_cell(migrated, grid, row, col), ALPHA_THRESHOLD)
            assert metrics is not None
            assert abs(metrics.body_height - 220) <= 3
            assert abs(metrics.foot_y - (grid.cell - 34)) <= 2
    assert report["ok"] is True


def self_test() -> None:
    assert_grid_case(Grid(DEFAULT_CELL, DEFAULT_COLS, DEFAULT_ROW_COUNT), DEFAULT_TARGET_ROWS)
    assert_grid_case(Grid(DEFAULT_CELL, 12, 1), (0,))

    fringe = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    fringe_draw = ImageDraw.Draw(fringe)
    fringe_draw.rectangle((30, 20, 60, 80), fill=(180, 120, 80, 255))
    fringe_draw.rectangle((20, 70, 23, 70), fill=(0, 0, 0, 12))
    cleaned, removed = clean_legacy_detached_noise(fringe)
    assert len(removed) == 1
    assert removed[0]["area"] == 4
    assert lint_frame(cleaned, LintConfig(edge_guard_px=0)).ok

    opaque = fringe.copy()
    ImageDraw.Draw(opaque).rectangle((72, 40, 75, 40), fill=(255, 220, 120, 32))
    try:
        clean_legacy_detached_noise(opaque)
    except GeometryError as exc:
        assert "detached-opaque" in str(exc)
    else:
        raise AssertionError("opaque detached content must fail closed")

    print("OK legacy bank canonical-scale self-test: full atlas + run strip + alpha-noise policy")


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
    parser.add_argument("--rows", type=parse_rows, default=DEFAULT_TARGET_ROWS)
    parser.add_argument("--cell", type=int, default=DEFAULT_CELL)
    parser.add_argument("--columns", type=int, default=DEFAULT_COLS)
    parser.add_argument("--row-count", type=int, default=DEFAULT_ROW_COUNT)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    required = [args.source, args.reference, args.output, args.report]
    if any(value is None for value in required):
        parser.error("--source, --reference, --output and --report are required")
    if args.cell <= 0 or args.columns <= 0 or args.row_count <= 0:
        parser.error("--cell, --columns and --row-count must be positive")

    grid = Grid(args.cell, args.columns, args.row_count)
    migrated, report = migrate(
        Image.open(args.source),
        Image.open(args.reference),
        grid,
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
