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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--preview", type=Path)
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
        source_height = sy1 - sy0
        reference_component = reference_components[col]
        rx0, ry0, rx1, ry1 = reference_component["bbox"]
        target_height = ry1 - ry0
        if source_height <= 0 or target_height <= 0:
            raise ValueError(f"machinegun idle c{col}: invalid body height")

        isolated = isolated_main(source_cell, primary)
        crop = isolated.crop(primary["bbox"])
        scale = target_height / source_height
        scaled_size = (
            max(1, round(crop.width * scale)),
            max(1, round(crop.height * scale)),
        )
        scaled = (
            crop.resize(scaled_size, Image.Resampling.BILINEAR)
            if scaled_size != crop.size
            else crop
        )

        dest_x = round(target_center - scaled.width / 2.0)
        dest_y = round(target_foot - scaled.height)
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
        repaired_height = repaired_bbox[3] - repaired_bbox[1]
        if abs(repaired_height - target_height) > 1:
            raise ValueError(
                f"machinegun idle c{col}: repaired height {repaired_height} "
                f"!= target {target_height}"
            )
        if abs(repaired_bbox[3] - target_foot) > 1:
            raise ValueError(
                f"machinegun idle c{col}: repaired foot {repaired_bbox[3]} "
                f"!= target {target_foot}"
            )

        output.paste(repaired, (col * CELL, IDLE_ROW * CELL))
        frames.append(
            {
                "column": col,
                "sourceMainBbox": list(primary["bbox"]),
                "sourceMainHeight": source_height,
                "targetReferenceBbox": list(reference_component["bbox"]),
                "targetHeight": target_height,
                "scale": round(scale, 6),
                "targetCenterX": target_center,
                "targetFootY": target_foot,
                "outputMainBbox": list(repaired_bbox),
                "removedDetached": [
                    {"area": int(item["area"]), "bbox": list(item["bbox"])}
                    for item in detached
                ],
            }
        )

    return output, {
        "schema": 1,
        "scope": "pawn-slug-matthias-machinegun-idle-reference-repair",
        "row": IDLE_ROW,
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
    for col, frame in enumerate(report["frames"]):
        repaired = main_component(cell(output, 0, col), f"self-test c{col}")
        target = main_component(cell(reference, 0, col), f"self-test reference c{col}")
        assert (
            repaired["bbox"][3] - repaired["bbox"][1]
            == target["bbox"][3] - target["bbox"][1]
        )
        assert len(components(cell(output, 0, col))) == 1

    print("Matthias machinegun idle reference repair self-test: OK")


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
        )
        if value is None
    ]
    if missing:
        raise SystemExit("missing required arguments: " + ", ".join(missing))

    source = Image.open(cfg.source).convert("RGBA")
    reference = Image.open(cfg.reference).convert("RGBA")
    output, report = repair(source, reference)

    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    cfg.report.parent.mkdir(parents=True, exist_ok=True)
    output.save(cfg.output, "PNG", optimize=True)
    cfg.report.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    render_preview(reference, source, output, cfg.preview)

    print(
        json.dumps(
            {
                "output": str(cfg.output),
                "preview": str(cfg.preview),
                "repairedFrames": len(report["frames"]),
                "removedDetachedComponents": sum(
                    len(frame["removedDetached"]) for frame in report["frames"]
                ),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
