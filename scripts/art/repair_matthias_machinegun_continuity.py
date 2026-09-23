#!/usr/bin/env python3
"""Deterministic Matthias SMG idle/airborne continuity repair.

Never invents poses. It reuses the existing 8x18 SMG atlas, normalizes only
idle/jump/fall/land against homologous canonical pistol geometry, drops only
bounded detached technical components, and preserves every other row bytewise.
"""
from __future__ import annotations

import argparse
import json
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
COLS = 8
ROWS = 18
SIZE = (CELL * COLS, CELL * ROWS)
ALPHA_THRESHOLD = 8
SAFE_MARGIN = 4
MAX_REMOVABLE_DETACHED_AREA = 1024
IDLE_ROW = 0
AIRBORNE_ROWS = (3, 4, 5)
REPAIRED_ROWS = (IDLE_ROW, *AIRBORNE_ROWS)
MIN_IDLE_X_SCALE = 0.90
MAX_IDLE_X_SCALE = 1.16
MIN_IDLE_Y_SCALE = 0.92
MAX_IDLE_Y_SCALE = 1.12
MIN_AIRBORNE_SCALE = 0.75
MAX_AIRBORNE_SCALE = 1.35


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
    pixels = alpha.load()
    seen = bytearray(width * height)
    found: list[dict] = []
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or pixels[x, y] < ALPHA_THRESHOLD:
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
                        if seen[nindex] or pixels[nx, ny] < ALPHA_THRESHOLD:
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


def validate_detached(found: list[dict], label: str) -> list[dict]:
    detached = found[1:]
    unsafe = [
        item
        for item in detached
        if int(item["area"]) > MAX_REMOVABLE_DETACHED_AREA
    ]
    if unsafe:
        raise ValueError(
            f"{label}: detached component too large to remove safely: "
            + json.dumps(
                [
                    {"area": item["area"], "bbox": item["bbox"]}
                    for item in unsafe
                ]
            )
        )
    return detached


def place_scaled(
    source_cell: Image.Image,
    source_main: dict,
    target_main: dict,
    *,
    scale_x: float,
    scale_y: float,
    label: str,
) -> tuple[Image.Image, dict]:
    crop = isolated_main(source_cell, source_main).crop(source_main["bbox"])
    scaled_size = (
        max(1, round(crop.width * scale_x)),
        max(1, round(crop.height * scale_y)),
    )
    scaled = (
        crop.resize(scaled_size, Image.Resampling.NEAREST)
        if scaled_size != crop.size
        else crop
    )
    tx0, _, tx1, ty1 = target_main["bbox"]
    target_center = (tx0 + tx1) / 2.0
    target_foot = float(ty1)
    dest_x = round(target_center - scaled.width / 2.0)
    dest_y = round(target_foot - scaled.height)
    placed = (dest_x, dest_y, dest_x + scaled.width, dest_y + scaled.height)
    if (
        placed[0] < SAFE_MARGIN
        or placed[1] < SAFE_MARGIN
        or placed[2] > CELL - SAFE_MARGIN
        or placed[3] > CELL - SAFE_MARGIN
    ):
        raise ValueError(f"{label}: repaired frame would clip: {placed}")
    repaired = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    repaired.alpha_composite(scaled, (dest_x, dest_y))
    repaired_components = components(repaired)
    if len(repaired_components) != 1:
        raise ValueError(f"{label}: repaired frame is not one connected component")
    return repaired, repaired_components[0]


def transplant_idle_lower_body(
    repaired: Image.Image,
    reference_cell: Image.Image,
    target_main: dict,
    label: str,
) -> tuple[Image.Image, dict, int]:
    _, top, _, bottom = target_main["bbox"]
    start_y = round(
        top
        + (bottom - top) * IDLE_CANONICAL_LOWER_BODY_START_FRACTION
    )
    polished = repaired.copy()
    canonical_lower = reference_cell.crop((0, start_y, CELL, CELL))
    polished.paste(canonical_lower, (0, start_y))
    polished_components = components(polished)
    if len(polished_components) != 1:
        raise ValueError(
            f"{label}: canonical lower-body transplant broke connectivity"
        )
    return polished, polished_components[0], start_y


def repair_idle(
    source: Image.Image,
    reference: Image.Image,
    output: Image.Image,
) -> list[dict]:
    reports: list[dict] = []
    for col in range(COLS):
        source_cell = cell(source, IDLE_ROW, col)
        found = components(source_cell)
        if not found:
            raise ValueError(f"machinegun idle c{col}: empty frame")
        primary = found[0]
        detached = validate_detached(found, f"machinegun idle c{col}")
        target = main_component(
            cell(reference, IDLE_ROW, col),
            f"reference idle c{col}",
        )
        sx0, sy0, sx1, sy1 = primary["bbox"]
        tx0, ty0, tx1, ty1 = target["bbox"]
        source_w, source_h = sx1 - sx0, sy1 - sy0
        target_w, target_h = tx1 - tx0, ty1 - ty0
        scale_x = target_w / source_w
        scale_y = target_h / source_h
        if not MIN_IDLE_X_SCALE <= scale_x <= MAX_IDLE_X_SCALE:
            raise ValueError(
                f"machinegun idle c{col}: x scale {scale_x:.4f} outside safe range"
            )
        if not MIN_IDLE_Y_SCALE <= scale_y <= MAX_IDLE_Y_SCALE:
            raise ValueError(
                f"machinegun idle c{col}: y scale {scale_y:.4f} outside safe range"
            )
        repaired, repaired_main = place_scaled(
            source_cell,
            primary,
            target,
            scale_x=scale_x,
            scale_y=scale_y,
            label=f"machinegun idle c{col}",
        )
        repaired, repaired_main, canonical_start_y = transplant_idle_lower_body(
            repaired,
            cell(reference, IDLE_ROW, col),
            target,
            f"machinegun idle c{col}",
        )
        output.paste(repaired, (col * CELL, IDLE_ROW * CELL))
        reports.append(
            {
                "row": IDLE_ROW,
                "column": col,
                "sourceMainBbox": list(primary["bbox"]),
                "targetReferenceBbox": list(target["bbox"]),
                "scaleX": round(scale_x, 6),
                "scaleY": round(scale_y, 6),
                "outputMainBbox": list(repaired_main["bbox"]),
                "canonicalLowerBodyStartY": canonical_start_y,
                "removedDetached": [
                    {"area": int(item["area"]), "bbox": list(item["bbox"])}
                    for item in detached
                ],
            }
        )
    return reports


def repair_airborne(
    source: Image.Image,
    reference: Image.Image,
    output: Image.Image,
) -> list[dict]:
    reports: list[dict] = []
    for row in AIRBORNE_ROWS:
        for col in range(COLS):
            source_cell = cell(source, row, col)
            found = components(source_cell)
            if not found:
                raise ValueError(f"machinegun row {row} c{col}: empty frame")
            primary = found[0]
            detached = validate_detached(
                found,
                f"machinegun row {row} c{col}",
            )
            target = main_component(
                cell(reference, row, col),
                f"reference row {row} c{col}",
            )
            sy0, sy1 = primary["bbox"][1], primary["bbox"][3]
            ty0, ty1 = target["bbox"][1], target["bbox"][3]
            scale = (ty1 - ty0) / (sy1 - sy0)
            if not MIN_AIRBORNE_SCALE <= scale <= MAX_AIRBORNE_SCALE:
                raise ValueError(
                    f"machinegun row {row} c{col}: scale {scale:.4f} outside "
                    f"[{MIN_AIRBORNE_SCALE:.2f}, {MAX_AIRBORNE_SCALE:.2f}]"
                )
            repaired, repaired_main = place_scaled(
                source_cell,
                primary,
                target,
                scale_x=scale,
                scale_y=scale,
                label=f"machinegun row {row} c{col}",
            )
            target_bbox = target["bbox"]
            output_bbox = repaired_main["bbox"]
            target_h = target_bbox[3] - target_bbox[1]
            output_h = output_bbox[3] - output_bbox[1]
            target_center = (target_bbox[0] + target_bbox[2]) / 2.0
            output_center = (output_bbox[0] + output_bbox[2]) / 2.0
            if abs(output_h - target_h) > 1:
                raise ValueError(
                    f"machinegun row {row} c{col}: height mismatch after repair"
                )
            if abs(output_bbox[3] - target_bbox[3]) > 1:
                raise ValueError(
                    f"machinegun row {row} c{col}: footline mismatch after repair"
                )
            if abs(output_center - target_center) > 1:
                raise ValueError(
                    f"machinegun row {row} c{col}: center mismatch after repair"
                )
            output.paste(repaired, (col * CELL, row * CELL))
            reports.append(
                {
                    "row": row,
                    "column": col,
                    "sourceMainBbox": list(primary["bbox"]),
                    "targetReferenceBbox": list(target["bbox"]),
                    "uniformScale": round(scale, 6),
                    "outputMainBbox": list(output_bbox),
                    "removedDetached": [
                        {
                            "area": int(item["area"]),
                            "bbox": list(item["bbox"]),
                        }
                        for item in detached
                    ],
                }
            )
    return reports


def repair(
    source: Image.Image,
    reference: Image.Image,
) -> tuple[Image.Image, dict]:
    if source.size != SIZE or reference.size != SIZE:
        raise ValueError(f"strict atlas geometry required: {SIZE}")
    output = source.copy()
    idle_frames = repair_idle(source, reference, output)
    airborne_frames = repair_airborne(source, reference, output)
    for row in range(ROWS):
        if row in REPAIRED_ROWS:
            continue
        bounds = (0, row * CELL, CELL * COLS, (row + 1) * CELL)
        if output.crop(bounds).tobytes() != source.crop(bounds).tobytes():
            raise ValueError(f"repair modified untouched row {row}")
    return output, {
        "schema": 1,
        "scope": "pawn-slug-matthias-machinegun-continuity-v4",
        "repairedRows": list(REPAIRED_ROWS),
        "idleCanonicalLowerBodyStartFraction": IDLE_CANONICAL_LOWER_BODY_START_FRACTION,
        "untouchedRowsPixelIdentical": True,
        "idleFrames": idle_frames,
        "airborneFrames": airborne_frames,
    }


def checkerboard(
    size: tuple[int, int],
    tile: int = 16,
) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle(
                    (x, y, x + tile - 1, y + tile - 1),
                    fill=(205, 205, 205, 255),
                )
    return image


def render_preview(
    reference: Image.Image,
    source: Image.Image,
    output: Image.Image,
    path: Path,
) -> None:
    review_rows = (
        ("IDLE", 0),
        ("JUMP", 3),
        ("FALL", 4),
        ("LAND", 5),
    )
    row_width = CELL * COLS
    layers: list[tuple[str, Image.Image]] = []
    for action, row in review_rows:
        for label, atlas in (
            (f"{action} · PISTOL REFERENCE", reference),
            (f"{action} · MACHINEGUN CURRENT", source),
            (f"{action} · MACHINEGUN REPAIRED", output),
        ):
            strip = atlas.crop(
                (0, row * CELL, row_width, (row + 1) * CELL)
            )
            bg = checkerboard(strip.size)
            bg.alpha_composite(strip)
            layers.append((label, bg.convert("RGB")))
    preview = Image.new(
        "RGB",
        (row_width, CELL * len(layers)),
        (255, 255, 255),
    )
    draw = ImageDraw.Draw(preview)
    for index, (label, layer) in enumerate(layers):
        y = index * CELL
        preview.paste(layer, (0, y))
        draw.text((8, y + 8), label, fill=(220, 35, 35))
    preview.thumbnail((1664, 2496), Image.Resampling.NEAREST)
    path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(path, "PNG", optimize=True)


def self_test() -> None:
    source = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    reference = Image.new("RGBA", SIZE, (0, 0, 0, 0))
    for row in REPAIRED_ROWS:
        for col in range(COLS):
            target_h = 175 + ((row + col) % 4) * 16
            target_w = 140 + (col % 3) * 4
            ref_left = 138 + (col % 2) * 4
            ref_top = 382 - target_h
            ImageDraw.Draw(reference).rectangle(
                (
                    col * CELL + ref_left,
                    row * CELL + ref_top,
                    col * CELL + ref_left + target_w - 1,
                    row * CELL + 381,
                ),
                fill=(20, 20, 20, 255),
            )
            if row == IDLE_ROW:
                src_w = target_w - 8
                src_h = target_h - 10
            else:
                factor = (0.80, 0.90, 1.15, 1.25)[(row + col) % 4]
                src_h = round(target_h / factor)
                src_w = target_w
            src_left = ref_left + (-10 if col % 2 == 0 else 8)
            src_top = 382 - src_h
            ImageDraw.Draw(source).rectangle(
                (
                    col * CELL + src_left,
                    row * CELL + src_top,
                    col * CELL + src_left + src_w - 1,
                    row * CELL + 381,
                ),
                fill=(30, 30, 30, 255),
            )
            if col in {0, 3}:
                ImageDraw.Draw(source).rectangle(
                    (
                        col * CELL + 100,
                        row * CELL + 120,
                        col * CELL + 104,
                        row * CELL + 123,
                    ),
                    fill=(255, 255, 255, 255),
                )
    ImageDraw.Draw(source).rectangle(
        (20, CELL * 2 + 20, 80, CELL * 2 + 80),
        fill=(10, 10, 10, 255),
    )
    output, report = repair(source, reference)
    assert report["repairedRows"] == [0, 3, 4, 5]
    assert report["untouchedRowsPixelIdentical"] is True
    assert len(report["idleFrames"]) == COLS
    assert len(report["airborneFrames"]) == len(AIRBORNE_ROWS) * COLS
    assert cell(output, 2, 0).tobytes() == cell(source, 2, 0).tobytes()
    for row in REPAIRED_ROWS:
        for col in range(COLS):
            repaired = main_component(
                cell(output, row, col),
                f"repaired {row}:{col}",
            )
            target = main_component(
                cell(reference, row, col),
                f"target {row}:{col}",
            )
            assert len(components(cell(output, row, col))) == 1
            assert abs(
                (repaired["bbox"][3] - repaired["bbox"][1])
                - (target["bbox"][3] - target["bbox"][1])
            ) <= 1
            assert abs(repaired["bbox"][3] - target["bbox"][3]) <= 1
            repaired_center = (
                repaired["bbox"][0] + repaired["bbox"][2]
            ) / 2.0
            target_center = (
                target["bbox"][0] + target["bbox"][2]
            ) / 2.0
            assert abs(repaired_center - target_center) <= 1
    print("Matthias SMG continuity v4 self-test: OK")


def main() -> int:
    cfg = parse_args()
    if cfg.self_test:
        self_test()
        return 0
    required = [
        cfg.source,
        cfg.reference,
        cfg.output,
        cfg.report,
        cfg.preview,
    ]
    if any(value is None for value in required):
        raise SystemExit(
            "--source --reference --output --report --preview are required"
        )
    source = Image.open(cfg.source).convert("RGBA")
    reference = Image.open(cfg.reference).convert("RGBA")
    output, report = repair(source, reference)
    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    cfg.report.parent.mkdir(parents=True, exist_ok=True)
    output.save(cfg.output, "PNG", optimize=True)
    cfg.report.write_text(
        json.dumps(report, indent=2) + "\n",
        encoding="utf-8",
    )
    render_preview(reference, source, output, cfg.preview)
    print(
        json.dumps(
            {
                "output": str(cfg.output),
                "repairedRows": report["repairedRows"],
                "repairedFrames": (
                    len(report["idleFrames"])
                    + len(report["airborneFrames"])
                ),
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
