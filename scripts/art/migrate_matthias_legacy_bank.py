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
)

DEFAULT_CELL = 416
DEFAULT_COLS = 8
DEFAULT_ROW_COUNT = 18
DEFAULT_TARGET_ROWS = (2, 6)  # run, crouch
ROTATING_POSE_ROWS = {16, 17}  # hurt, die: height is not a stable scale proxy
ALPHA_THRESHOLD = 8
SAFE_MARGIN = 6
MIN_SCALE = 0.80
# Legacy weapon banks contain real body-scale regressions down to ~0.62x canon.
# Allow recovery up to ~1.61x while placement still fails closed on clipping,
# footline drift and center drift.
MAX_SCALE = 1.70
LEGACY_NOISE_MAX_ALPHA = 24  # <10% opacity; runtime perceptual QA starts above ~0.10 alpha.


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
) -> tuple[float, float, float, float]:
    heights: list[float] = []
    spans: list[float] = []
    centers: list[float] = []
    feet: list[float] = []
    for col in range(grid.columns):
        metrics = geometry_metrics(crop_cell(atlas, grid, row, col), ALPHA_THRESHOLD)
        if metrics is None:
            raise GeometryError(f"reference-empty:{row}:{col}")
        left, top, right, bottom = metrics.body_bbox
        heights.append(float(metrics.body_height))
        spans.append(float(max(right - left, bottom - top)))
        centers.append(float(metrics.body_center_x))
        feet.append(float(metrics.foot_y))
    return (
        float(statistics.median(heights)),
        float(statistics.median(spans)),
        float(statistics.median(centers)),
        float(statistics.median(feet)),
    )


def clean_legacy_detached_noise(
    image: Image.Image,
    allow_opaque_detached: bool = False,
) -> tuple[Image.Image, list[dict]]:
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
            if allow_opaque_detached:
                continue
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


def _foreground_bbox(image: Image.Image, alpha_threshold: int) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= alpha_threshold else 0)
    return mask.getbbox()


def place_legacy_frame(
    image: Image.Image,
    contract: PlacementContract,
    lint_config: LintConfig,
    allow_opaque_detached: bool = False,
) -> tuple[Image.Image, list[dict]]:
    raw = image.convert("RGBA")
    lint = lint_frame(raw, lint_config)
    if not lint.ok or lint.main_component is None:
        raise GeometryError("raw-lint:" + ",".join(lint.errors))
    if contract.scale <= 0:
        raise GeometryError("invalid-scale")

    foreground = _foreground_bbox(raw, lint_config.alpha_threshold)
    if foreground is None:
        raise GeometryError("empty-frame")
    fx0, fy0, _, _ = foreground
    crop = raw.crop(foreground)
    scaled_size = (
        max(1, round(crop.width * contract.scale)),
        max(1, round(crop.height * contract.scale)),
    )
    # Legacy v16/v22 atlases already contain antialiased/ringing edges. For
    # enlargement, BILINEAR avoids the extra lobes BICUBIC can manufacture.
    # This exception exists only in the migration compiler; accepted Sprite
    # Forge sources continue through the normal fail-closed placement path.
    scaled = crop.resize(scaled_size, Image.Resampling.BILINEAR)

    body = lint.main_component
    body_left = (body.bbox[0] - fx0) * contract.scale
    body_right = (body.bbox[2] - fx0) * contract.scale
    body_bottom = (body.bbox[3] - fy0) * contract.scale
    body_center_in_crop = (body_left + body_right) / 2.0

    dest_x = round(contract.body_center_x - body_center_in_crop)
    dest_y = round(contract.foot_y - body_bottom)
    placed_bbox = (
        dest_x,
        dest_y,
        dest_x + scaled.width,
        dest_y + scaled.height,
    )
    margin = max(0, contract.safe_margin_px)
    canvas_w, canvas_h = contract.canvas_size
    if (
        placed_bbox[0] < margin
        or placed_bbox[1] < margin
        or placed_bbox[2] > canvas_w - margin
        or placed_bbox[3] > canvas_h - margin
    ):
        raise GeometryError(
            f"would-clip:{placed_bbox} outside "
            f"canvas={contract.canvas_size} margin={margin}"
        )

    out = Image.new("RGBA", contract.canvas_size, (0, 0, 0, 0))
    out.alpha_composite(scaled, (dest_x, dest_y))
    out, removed_post_noise = clean_legacy_detached_noise(
        out, allow_opaque_detached=allow_opaque_detached
    )

    post = lint_frame(out, lint_config)
    if not post.ok:
        raise GeometryError("post-lint:" + ",".join(post.errors))
    metrics = geometry_metrics(out, lint_config.alpha_threshold)
    if metrics is None:
        raise GeometryError("post-empty")
    if abs(metrics.foot_y - contract.foot_y) > contract.foot_tolerance_px:
        raise GeometryError(
            f"foot:{metrics.foot_y:.2f}!={contract.foot_y:.2f}"
        )
    if abs(metrics.body_center_x - contract.body_center_x) > contract.center_tolerance_px:
        raise GeometryError(
            f"center:{metrics.body_center_x:.2f}!={contract.body_center_x:.2f}"
        )
    return out, removed_post_noise


def migrate(
    source: Image.Image,
    reference: Image.Image,
    grid: Grid,
    target_rows: tuple[int, ...],
    allow_opaque_detached: bool = False,
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
        "allow_opaque_detached": allow_opaque_detached,
    }
    lint = LintConfig(
        alpha_threshold=ALPHA_THRESHOLD,
        edge_guard_px=2,
        min_detached_area=4,
        allowed_detached_components=8 if allow_opaque_detached else 0,
        reject_hidden_rgb=True,
    )

    for row in target_rows:
        if row < 0 or row >= grid.rows:
            raise GeometryError(f"row-out-of-range:{row}")
        target_height, target_span, target_center_x, target_foot_y = row_reference_profile(
            reference, grid, row
        )

        prepared: list[tuple[Image.Image, list[dict], object]] = []
        source_heights: list[float] = []
        source_spans: list[float] = []
        for col in range(grid.columns):
            cell = crop_cell(source, grid, row, col)
            try:
                cell, removed_noise = clean_legacy_detached_noise(
                    cell, allow_opaque_detached=allow_opaque_detached
                )
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
            prepared.append((cell, removed_noise, metrics))
            source_heights.append(float(metrics.body_height))
            left, top, right, bottom = metrics.body_bbox
            source_spans.append(float(max(right - left, bottom - top)))

        source_median_height = float(statistics.median(source_heights))
        source_median_span = float(statistics.median(source_spans))
        scale_metric = "span" if row in ROTATING_POSE_ROWS else "height"
        row_scale = (
            target_span / source_median_span
            if row in ROTATING_POSE_ROWS
            else target_height / source_median_height
        )
        if not MIN_SCALE <= row_scale <= MAX_SCALE:
            raise GeometryError(
                f"row-scale-out-of-range:{row}:{row_scale:.4f}"
            )

        row_report: dict[str, object] = {
            "scale_metric": scale_metric,
            "target_height": target_height,
            "target_span": target_span,
            "source_median_height": source_median_height,
            "source_median_span": source_median_span,
            "scale": round(row_scale, 6),
            "resampling": "bilinear",
            "target_center_x": target_center_x,
            "target_foot_y": target_foot_y,
            "frames": [],
        }
        output_heights: list[float] = []

        for col, (cell, removed_noise, metrics) in enumerate(prepared):
            try:
                placed, removed_post_noise = place_legacy_frame(
                    cell,
                    PlacementContract(
                        canvas_size=(grid.cell, grid.cell),
                        scale=row_scale,
                        body_center_x=target_center_x,
                        foot_y=target_foot_y,
                        safe_margin_px=SAFE_MARGIN,
                        foot_tolerance_px=2.0,
                        center_tolerance_px=3.0,
                    ),
                    lint,
                    allow_opaque_detached=allow_opaque_detached,
                )
            except GeometryError as exc:
                raise GeometryError(
                    f"frame:{row}:{col}:source-height={metrics.body_height}:"
                    f"row-scale={row_scale:.4f}:{exc}"
                ) from exc
            post = geometry_metrics(placed, ALPHA_THRESHOLD)
            if post is None:
                raise GeometryError(f"post-empty:{row}:{col}")
            expected_height = float(metrics.body_height) * row_scale
            if abs(float(post.body_height) - expected_height) > 3.0:
                raise GeometryError(
                    f"post-height:{row}:{col}:{post.body_height}!="
                    f"{expected_height:.2f}"
                )
            output_heights.append(float(post.body_height))

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
                    "scale": round(row_scale, 6),
                    "output_height": post.body_height,
                    "foot_y": post.foot_y,
                    "center_x": post.body_center_x,
                    "removed_legacy_noise": {
                        "raw": removed_noise,
                        "post_resample": removed_post_noise,
                    },
                }
            )

        output_median_height = float(statistics.median(output_heights))
        if row not in ROTATING_POSE_ROWS and abs(output_median_height - target_height) > 3.0:
            raise GeometryError(
                f"row-median-height:{row}:{output_median_height:.2f}!="
                f"{target_height:.2f}"
            )
        row_report["output_median_height"] = output_median_height
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

    probe_grid = Grid(DEFAULT_CELL, DEFAULT_COLS, 1)
    probe_source, probe_reference = synthetic_atlas(
        probe_grid,
        target_height=220,
        source_height=180,
    )
    _, probe_report = migrate(probe_source, probe_reference, probe_grid, (0,))
    row_frames = probe_report["rows"]["0"]["frames"]
    assert len({frame["scale"] for frame in row_frames}) == 1

    fringe = Image.new("RGBA", (96, 96), (0, 0, 0, 0))
    fringe_draw = ImageDraw.Draw(fringe)
    fringe_draw.rectangle((30, 20, 60, 80), fill=(180, 120, 80, 255))
    fringe_draw.rectangle((20, 70, 23, 70), fill=(0, 0, 0, 24))
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

    preserved, removed = clean_legacy_detached_noise(
        opaque,
        allow_opaque_detached=True,
    )
    assert len(removed) == 1
    assert removed[0]["area"] == 4
    assert preserved.getpixel((20, 70))[3] == 0
    assert preserved.getpixel((72, 40))[3] == 32

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
    parser.add_argument("--allow-opaque-detached", action="store_true")
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
        allow_opaque_detached=args.allow_opaque_detached,
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    migrated.save(args.output, format="PNG", optimize=False, compress_level=9)
    args.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
