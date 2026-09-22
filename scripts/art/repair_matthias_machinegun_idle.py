#!/usr/bin/env python3
"""Repair Matthias machinegun idle geometry against the canonical pistol row.

This is a deterministic 2D migration helper. It never invents frames: only the
machinegun idle row is cleaned/repacked against homologous pistol geometry.
"""
from __future__ import annotations

import argparse
import json
import statistics
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
COLS = 8
ROWS = 18
IDLE_ROW = 0
ALPHA_THRESHOLD = 8
MAX_REMOVABLE_DETACHED_AREA = 1024
SAFE_MARGIN = 4
MIN_REPAIR_SCALE = 0.92
MAX_REPAIR_SCALE = 1.12
MIN_IDLE_X_SCALE = 0.90
MAX_IDLE_X_SCALE = 1.16
RUN_SOURCE_COLS = 13
RUN_REFERENCE_COLS = 12
MIN_RUN_X_SCALE = 0.85
MAX_RUN_X_SCALE = 1.15
MIN_RUN_Y_SCALE = 0.95
MAX_RUN_Y_SCALE = 1.05


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--run-source", type=Path)
    parser.add_argument("--run-reference", type=Path)
    parser.add_argument("--run-output", type=Path)
    parser.add_argument("--run-report", type=Path)
    parser.add_argument("--run-preview", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def components(image: Image.Image) -> list[dict]:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    pix = alpha.load()
    seen = bytearray(width * height)
    found: list[dict] = []

    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pix[x, y] < ALPHA_THRESHOLD:
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            seen[index] = 1
            points: list[tuple[int, int]] = []
            while queue:
                px, py = queue.popleft()
                points.append((px, py))
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        nx, ny = px + dx, py + dy
                        if not (0 <= nx < width and 0 <= ny < height):
                            continue
                        nindex = ny * width + nx
                        if seen[nindex] or pix[nx, ny] < ALPHA_THRESHOLD:
                            continue
                        seen[nindex] = 1
                        queue.append((nx, ny))
            xs = [point[0] for point in points]
            ys = [point[1] for point in points]
            found.append(
                {
                    "area": len(points),
                    "bbox": (min(xs), min(ys), max(xs) + 1, max(ys) + 1),
                    "points": points,
                }
            )
    found.sort(key=lambda item: int(item["area"]), reverse=True)
    return found


def cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def main_component(image: Image.Image, label: str) -> dict:
    found = components(image)
    if not found:
        raise ValueError(f"{label}: empty frame")
    return found[0]


def isolated_main(image: Image.Image, component: dict) -> Image.Image:
    rgba = image.convert("RGBA")
    source = rgba.load()
    isolated = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    target = isolated.load()
    for x, y in component["points"]:
        target[x, y] = source[x, y]
    return isolated


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, x + tile - 1, y + tile - 1), fill=(205, 205, 205, 255))
    return image


def render_preview(reference: Image.Image, source: Image.Image, output: Image.Image, path: Path) -> None:
    row_width = CELL * COLS
    layers: list[tuple[str, Image.Image]] = []
    for label, atlas in (
        ("PISTOL REFERENCE", reference),
        ("MACHINEGUN CURRENT", source),
        ("MACHINEGUN REPAIRED", output),
    ):
        row = atlas.crop((0, 0, row_width, CELL))
        bg = checkerboard(row.size)
        bg.alpha_composite(row)
        layers.append((label, bg.convert("RGB")))

    preview = Image.new("RGB", (row_width, CELL * len(layers)), (255, 255, 255))
    draw = ImageDraw.Draw(preview)
    for index, (label, image) in enumerate(layers):
        y = index * CELL
        preview.paste(image, (0, y))
        draw.text((8, y + 8), label, fill=(220, 35, 35))
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(path, "PNG", optimize=True)


def repair(source: Image.Image, reference: Image.Image) -> tuple[Image.Image, dict]:
    expected = (CELL * COLS, CELL * ROWS)
    if source.size != expected or reference.size != expected:
        raise ValueError(
            f"strict atlas geometry required: {expected}, got "
            f"source={source.size} reference={reference.size}"
        )

    reference_components = [
        main_component(cell(reference, IDLE_ROW, col), f"reference idle c{col}")
        for col in range(COLS)
    ]
    reference_centers = [
        (component["bbox"][0] + component["bbox"][2]) / 2.0
        for component in reference_components
    ]
    reference_feet = [component["bbox"][3] for component in reference_components]
    target_center = float(statistics.median(reference_centers))
    target_foot = float(statistics.median(reference_feet))

    output = source.copy()
    frames: list[dict] = []
    for col in range(COLS):
        source_cell = cell(source, IDLE_ROW, col)
        found = components(source_cell)
        if not found:
            raise ValueError(f"machinegun idle c{col}: empty frame")
        primary = found[0]
        detached = found[1:]
        too_large = [
            item for item in detached
            if int(item["area"]) > MAX_REMOVABLE_DETACHED_AREA
        ]
        if too_large:
            raise ValueError(
                f"machinegun idle c{col}: detached component too large to remove safely: "
                + json.dumps(
                    [{"area": item["area"], "bbox": item["bbox"]} for item in too_large]
                )
            )

        sx0, sy0, sx1, sy1 = primary["bbox"]
        source_width = sx1 - sx0
        source_height = sy1 - sy0
        reference_component = reference_components[col]
        rx0, ry0, rx1, ry1 = reference_component["bbox"]
        target_width = rx1 - rx0
        target_height = ry1 - ry0
        if min(source_width, source_height, target_width, target_height) <= 0:
            raise ValueError(f"machinegun idle c{col}: invalid body geometry")

        isolated = isolated_main(source_cell, primary)
        crop = isolated.crop(primary["bbox"])
        scale_x = target_width / source_width
        scale_y = target_height / source_height
        if not MIN_IDLE_X_SCALE <= scale_x <= MAX_IDLE_X_SCALE:
            raise ValueError(
                f"machinegun idle c{col}: x scale {scale_x:.4f} outside "
                f"[{MIN_IDLE_X_SCALE:.2f}, {MAX_IDLE_X_SCALE:.2f}]"
            )
        if not MIN_REPAIR_SCALE <= scale_y <= MAX_REPAIR_SCALE:
            raise ValueError(
                f"machinegun idle c{col}: y scale {scale_y:.4f} outside "
                f"[{MIN_REPAIR_SCALE:.2f}, {MAX_REPAIR_SCALE:.2f}]"
            )
        scaled_size = (
            max(1, round(crop.width * scale_x)),
            max(1, round(crop.height * scale_y)),
        )
        scaled = (
            crop.resize(scaled_size, Image.Resampling.BILINEAR)
            if scaled_size != crop.size
            else crop
        )

        target_frame_center = (rx0 + rx1) / 2.0
        target_frame_foot = float(ry1)
        dest_x = round(target_frame_center - scaled.width / 2.0)
        dest_y = round(target_frame_foot - scaled.height)
        if (
            dest_x < SAFE_MARGIN
            or dest_y < SAFE_MARGIN
            or dest_x + scaled.width > CELL - SAFE_MARGIN
            or dest_y + scaled.height > CELL - SAFE_MARGIN
        ):
            raise ValueError(
                f"machinegun idle c{col}: repaired frame would clip: "
                f"{(dest_x, dest_y, dest_x + scaled.width, dest_y + scaled.height)}"
            )

        repaired = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        repaired.alpha_composite(scaled, (dest_x, dest_y))
        repaired_components = components(repaired)
        if len(repaired_components) != 1:
            raise ValueError(
                f"machinegun idle c{col}: repair did not collapse to one component"
            )
        repaired_bbox = repaired_components[0]["bbox"]
        repaired_width = repaired_bbox[2] - repaired_bbox[0]
        repaired_height = repaired_bbox[3] - repaired_bbox[1]
        if abs(repaired_width - target_width) > 1:
            raise ValueError(
                f"machinegun idle c{col}: repaired width {repaired_width} "
                f"!= target {target_width}"
            )
        if abs(repaired_height - target_height) > 1:
            raise ValueError(
                f"machinegun idle c{col}: repaired height {repaired_height} "
                f"!= target {target_height}"
            )
        if abs(repaired_bbox[3] - target_frame_foot) > 1:
            raise ValueError(
                f"machinegun idle c{col}: repaired foot {repaired_bbox[3]} "
                f"!= target {target_frame_foot}"
            )

        output.paste(repaired, (col * CELL, IDLE_ROW * CELL))
        frames.append(
            {
                "column": col,
                "sourceMainBbox": list(primary["bbox"]),
                "sourceMainWidth": source_width,
                "sourceMainHeight": source_height,
                "targetReferenceBbox": list(reference_component["bbox"]),
                "targetWidth": target_width,
                "targetHeight": target_height,
                "scaleX": round(scale_x, 6),
                "scaleY": round(scale_y, 6),
                "targetCenterX": target_frame_center,
                "targetFootY": target_frame_foot,
                "outputMainBbox": list(repaired_bbox),
                "removedDetached": [
                    {"area": int(item["area"]), "bbox": list(item["bbox"])}
                    for item in detached
                ],
            }
        )

    untouched_box = (0, CELL, CELL * COLS, CELL * ROWS)
    if output.crop(untouched_box).tobytes() != source.crop(untouched_box).tobytes():
        raise ValueError("repair modified rows outside machinegun idle")

    return output, {
        "schema": 1,
        "untouchedRowsPixelIdentical": True,
        "scope": "pawn-slug-matthias-machinegun-idle-reference-repair",
        "row": IDLE_ROW,
        "targetCenterX": target_center,
        "targetFootY": target_foot,
        "frames": frames,
    }



def foreground_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    alpha = image.convert("RGBA").getchannel("A")
    mask = alpha.point(lambda value: 255 if value >= ALPHA_THRESHOLD else 0)
    return mask.getbbox()


def render_run_preview(
    reference: Image.Image,
    source: Image.Image,
    output: Image.Image,
    path: Path,
) -> None:
    width = CELL * RUN_SOURCE_COLS
    layers: list[tuple[str, Image.Image]] = []
    for label, strip in (
        ("PISTOL RUN REFERENCE", reference),
        ("MACHINEGUN RUN13 CURRENT", source),
        ("MACHINEGUN RUN13 REPAIRED", output),
    ):
        padded = Image.new("RGBA", (width, CELL), (0, 0, 0, 0))
        padded.alpha_composite(strip, (0, 0))
        bg = checkerboard(padded.size)
        bg.alpha_composite(padded)
        layers.append((label, bg.convert("RGB")))

    preview = Image.new("RGB", (width, CELL * len(layers)), (255, 255, 255))
    draw = ImageDraw.Draw(preview)
    for index, (label, image) in enumerate(layers):
        y = index * CELL
        preview.paste(image, (0, y))
        draw.text((8, y + 8), label, fill=(220, 35, 35))
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(path, "PNG", optimize=True)


def repair_run_strip(source: Image.Image, reference: Image.Image) -> tuple[Image.Image, dict]:
    source_expected = (CELL * RUN_SOURCE_COLS, CELL)
    reference_expected = (CELL * RUN_REFERENCE_COLS, CELL)
    if source.size != source_expected or reference.size != reference_expected:
        raise ValueError(
            "strict run-strip geometry required: "
            f"source={source_expected}, reference={reference_expected}; "
            f"got source={source.size}, reference={reference.size}"
        )

    source_components = [
        main_component(cell(source, 0, col), f"machinegun run13 c{col}")
        for col in range(RUN_SOURCE_COLS)
    ]
    reference_components = [
        main_component(cell(reference, 0, col), f"pistol run12 c{col}")
        for col in range(RUN_REFERENCE_COLS)
    ]

    source_widths = [
        component["bbox"][2] - component["bbox"][0]
        for component in source_components
    ]
    source_heights = [
        component["bbox"][3] - component["bbox"][1]
        for component in source_components
    ]
    reference_widths = [
        component["bbox"][2] - component["bbox"][0]
        for component in reference_components
    ]
    reference_heights = [
        component["bbox"][3] - component["bbox"][1]
        for component in reference_components
    ]
    source_median_width = float(statistics.median(source_widths))
    source_median_height = float(statistics.median(source_heights))
    target_median_width = float(statistics.median(reference_widths))
    target_median_height = float(statistics.median(reference_heights))
    scale_x = target_median_width / source_median_width
    scale_y = target_median_height / source_median_height
    if not MIN_RUN_X_SCALE <= scale_x <= MAX_RUN_X_SCALE:
        raise ValueError(
            f"machinegun run13 x scale {scale_x:.4f} outside "
            f"[{MIN_RUN_X_SCALE:.2f}, {MAX_RUN_X_SCALE:.2f}]"
        )
    if not MIN_RUN_Y_SCALE <= scale_y <= MAX_RUN_Y_SCALE:
        raise ValueError(
            f"machinegun run13 y scale {scale_y:.4f} outside "
            f"[{MIN_RUN_Y_SCALE:.2f}, {MAX_RUN_Y_SCALE:.2f}]"
        )

    target_center = float(statistics.median(
        [
            (component["bbox"][0] + component["bbox"][2]) / 2.0
            for component in reference_components
        ]
    ))
    target_foot = float(statistics.median(
        [component["bbox"][3] for component in reference_components]
    ))

    output = Image.new("RGBA", source.size, (0, 0, 0, 0))
    frames: list[dict] = []
    for col, primary in enumerate(source_components):
        source_cell = cell(source, 0, col)
        bbox = foreground_bbox(source_cell)
        if bbox is None:
            raise ValueError(f"machinegun run13 c{col}: empty foreground")
        crop = source_cell.crop(bbox)
        scaled_size = (
            max(1, round(crop.width * scale_x)),
            max(1, round(crop.height * scale_y)),
        )
        scaled = (
            crop.resize(scaled_size, Image.Resampling.BILINEAR)
            if scaled_size != crop.size
            else crop
        )

        fx0, fy0, _, _ = bbox
        px0, _, px1, py1 = primary["bbox"]
        primary_center_in_crop = (((px0 + px1) / 2.0) - fx0) * scale_x
        primary_foot_in_crop = (py1 - fy0) * scale_y
        dest_x = round(target_center - primary_center_in_crop)
        dest_y = round(target_foot - primary_foot_in_crop)
        placed_bbox = (
            dest_x,
            dest_y,
            dest_x + scaled.width,
            dest_y + scaled.height,
        )
        if (
            placed_bbox[0] < SAFE_MARGIN
            or placed_bbox[1] < SAFE_MARGIN
            or placed_bbox[2] > CELL - SAFE_MARGIN
            or placed_bbox[3] > CELL - SAFE_MARGIN
        ):
            raise ValueError(
                f"machinegun run13 c{col}: repaired frame would clip: {placed_bbox}"
            )

        repaired = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        repaired.alpha_composite(scaled, (dest_x, dest_y))
        repaired_primary = main_component(repaired, f"machinegun repaired run13 c{col}")
        repaired_foot = repaired_primary["bbox"][3]
        if abs(repaired_foot - target_foot) > 1:
            raise ValueError(
                f"machinegun run13 c{col}: repaired foot {repaired_foot} "
                f"!= target {target_foot}"
            )
        output.alpha_composite(repaired, (col * CELL, 0))
        frames.append(
            {
                "column": col,
                "sourceMainBbox": list(primary["bbox"]),
                "sourceMainHeight": primary["bbox"][3] - primary["bbox"][1],
                "sourceComponentCount": len(components(source_cell)),
                "outputMainBbox": list(repaired_primary["bbox"]),
                "outputComponentCount": len(components(repaired)),
            }
        )

    output_widths = [
        frame["outputMainBbox"][2] - frame["outputMainBbox"][0]
        for frame in frames
    ]
    output_heights = [
        frame["outputMainBbox"][3] - frame["outputMainBbox"][1]
        for frame in frames
    ]
    output_median_width = float(statistics.median(output_widths))
    output_median_height = float(statistics.median(output_heights))
    if abs(output_median_width - target_median_width) > 1.0:
        raise ValueError(
            f"machinegun run13 median width {output_median_width} "
            f"!= pistol target {target_median_width}"
        )
    if abs(output_median_height - target_median_height) > 1.0:
        raise ValueError(
            f"machinegun run13 median height {output_median_height} "
            f"!= pistol target {target_median_height}"
        )

    return output, {
        "schema": 1,
        "scope": "pawn-slug-matthias-machinegun-run13-reference-repair",
        "sourceColumns": RUN_SOURCE_COLS,
        "referenceColumns": RUN_REFERENCE_COLS,
        "uniformScaleX": round(scale_x, 6),
        "uniformScaleY": round(scale_y, 6),
        "sourceMedianWidth": source_median_width,
        "sourceMedianHeight": source_median_height,
        "targetMedianWidth": target_median_width,
        "targetMedianHeight": target_median_height,
        "outputMedianWidth": output_median_width,
        "outputMedianHeight": output_median_height,
        "targetCenterX": target_center,
        "targetFootY": target_foot,
        "frames": frames,
    }

def self_test() -> None:
    atlas_size = (CELL * COLS, CELL * ROWS)
    source = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
    reference = Image.new("RGBA", atlas_size, (0, 0, 0, 0))
    for col in range(COLS):
        ref = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        src = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        target_h = 220 + (col % 3) * 4
        src_h = target_h - 12 if col == 0 else target_h
        ImageDraw.Draw(ref).rectangle(
            (140, 382 - target_h, 280, 381), fill=(20, 20, 20, 255)
        )
        ImageDraw.Draw(src).rectangle(
            (145, 382 - src_h, 285, 381), fill=(30, 30, 30, 255)
        )
        if col in {0, 3}:
            ImageDraw.Draw(src).rectangle(
                (100, 120, 104, 123), fill=(255, 255, 255, 255)
            )
        reference.alpha_composite(ref, (col * CELL, 0))
        source.alpha_composite(src, (col * CELL, 0))

    output, report = repair(source, reference)
    assert len(report["frames"]) == COLS
    assert report["frames"][0]["removedDetached"]
    assert report["untouchedRowsPixelIdentical"] is True
    for col, frame in enumerate(report["frames"]):
        repaired = main_component(cell(output, 0, col), f"self-test c{col}")
        target = main_component(cell(reference, 0, col), f"self-test reference c{col}")
        assert (
            repaired["bbox"][3] - repaired["bbox"][1]
            == target["bbox"][3] - target["bbox"][1]
        )
        assert len(components(cell(output, 0, col))) == 1

    run_reference = Image.new(
        "RGBA", (CELL * RUN_REFERENCE_COLS, CELL), (0, 0, 0, 0)
    )
    run_source = Image.new(
        "RGBA", (CELL * RUN_SOURCE_COLS, CELL), (0, 0, 0, 0)
    )
    for col in range(RUN_REFERENCE_COLS):
        ref = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        ImageDraw.Draw(ref).rectangle(
            (145, 162, 275, 381), fill=(20, 20, 20, 255)
        )
        run_reference.alpha_composite(ref, (col * CELL, 0))
    for col in range(RUN_SOURCE_COLS):
        src = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        ImageDraw.Draw(src).rectangle(
            (150, 162, 270, 381), fill=(30, 30, 30, 255)
        )
        ImageDraw.Draw(src).rectangle(
            (275, 245, 315, 258), fill=(90, 90, 90, 255)
        )
        run_source.alpha_composite(src, (col * CELL, 0))

    repaired_run, run_report = repair_run_strip(run_source, run_reference)
    assert RUN_SOURCE_COLS == len(run_report["frames"])
    assert 1.05 < run_report["uniformScaleX"] < 1.15
    assert 0.99 < run_report["uniformScaleY"] < 1.01
    assert abs(
        run_report["outputMedianHeight"] - run_report["targetMedianHeight"]
    ) <= 1.0
    for col in range(RUN_SOURCE_COLS):
        assert len(components(cell(run_source, 0, col))) == 2
        assert len(components(cell(repaired_run, 0, col))) == 2

    print("Matthias machinegun idle + run13 reference repair self-test: OK")


def main() -> int:
    cfg = parse_args()
    if cfg.self_test:
        self_test()
        return 0

    missing = [
        name
        for name, value in (
            ("--source", cfg.source),
            ("--reference", cfg.reference),
            ("--output", cfg.output),
            ("--report", cfg.report),
            ("--preview", cfg.preview),
            ("--run-source", cfg.run_source),
            ("--run-reference", cfg.run_reference),
            ("--run-output", cfg.run_output),
            ("--run-report", cfg.run_report),
            ("--run-preview", cfg.run_preview),
        )
        if value is None
    ]
    if missing:
        raise SystemExit("missing required arguments: " + ", ".join(missing))

    source = Image.open(cfg.source).convert("RGBA")
    reference = Image.open(cfg.reference).convert("RGBA")
    output, report = repair(source, reference)
    run_source = Image.open(cfg.run_source).convert("RGBA")
    run_reference = Image.open(cfg.run_reference).convert("RGBA")
    run_output, run_report = repair_run_strip(run_source, run_reference)

    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    cfg.run_output.parent.mkdir(parents=True, exist_ok=True)
    cfg.run_report.parent.mkdir(parents=True, exist_ok=True)
    cfg.run_preview.parent.mkdir(parents=True, exist_ok=True)
    cfg.report.parent.mkdir(parents=True, exist_ok=True)
    output.save(cfg.output, "PNG", optimize=True)
    cfg.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    render_preview(reference, source, output, cfg.preview)
    run_output.save(cfg.run_output, "PNG", optimize=True)
    cfg.run_report.write_text(json.dumps(run_report, indent=2) + "\n", encoding="utf-8")
    render_run_preview(run_reference, run_source, run_output, cfg.run_preview)

    print(
        json.dumps(
            {
                "output": str(cfg.output),
                "preview": str(cfg.preview),
                "repairedFrames": len(report["frames"]),
                "removedDetachedComponents": sum(
                    len(frame["removedDetached"]) for frame in report["frames"]
                ),
                "runOutput": str(cfg.run_output),
                "runPreview": str(cfg.run_preview),
                "runRepairedFrames": len(run_report["frames"]),
                "runUniformScaleX": run_report["uniformScaleX"],
                "runUniformScaleY": run_report["uniformScaleY"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
