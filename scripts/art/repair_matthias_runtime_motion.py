#!/usr/bin/env python3
"""Deterministic 2D repair for Matthias runtime motion.

The current weapon-specific upper body/weapon remains authoritative. The
canonical pistol lower body supplies readable leg motion. Machinegun airborne
rows are also normalized to homologous pistol geometry before the lower-body
transplant. No new animation frames are invented.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

CELL = 416
COLS = 8
ROWS = 18
SIZE = (CELL * COLS, CELL * ROWS)
ALPHA_THRESHOLD = 8
MAX_REMOVABLE_DETACHED_AREA = 8
LOWER_SPLIT_FRACTION = 0.62
LOWER_SIGNATURE_FRACTION = 0.70
SIGNATURE_SIZE = (96, 64)
SIGNATURE_THRESHOLD = 64
RUN_MEDIAN_MIN = 0.15
RUN_PEAK_MIN = 0.25
CENTER_TOLERANCE = 6.0
CENTER_Y_TOLERANCE = 4.0
HEIGHT_RATIO = (0.98, 1.02)
FOOT_TOLERANCE = 1.0
MACHINEGUN_ROWS = (0, 2, 3, 4, 5)
AIR_ROWS = (3, 4, 5)
RUN_ROW = 2
ROW_NAMES = {0: "idle", 2: "run", 3: "jump", 4: "fall", 5: "land"}
WEAPONS = ("machinegun", "shotgun", "panzerfaust")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pistol", type=Path)
    parser.add_argument("--machinegun", type=Path)
    parser.add_argument("--shotgun", type=Path)
    parser.add_argument("--panzerfaust", type=Path)
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def components(image: Image.Image) -> list[dict]:
    alpha = image.convert("RGBA").getchannel("A")
    width, height = alpha.size
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


def primary(image: Image.Image, label: str) -> dict:
    found = components(image)
    if not found:
        raise ValueError(f"{label}: empty frame")
    return found[0]


def isolate_primary(image: Image.Image, label: str) -> tuple[Image.Image, dict]:
    rgba = image.convert("RGBA")
    component = primary(rgba, label)
    source = rgba.load()
    isolated = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    target = isolated.load()
    for x, y in component["points"]:
        target[x, y] = source[x, y]
    return isolated, component


def remove_tiny_detached(image: Image.Image, label: str) -> Image.Image:
    rgba = image.convert("RGBA").copy()
    found = components(rgba)
    if not found:
        raise ValueError(f"{label}: empty frame")
    removable = found[1:]
    too_large = [
        item for item in removable
        if int(item["area"]) > MAX_REMOVABLE_DETACHED_AREA
    ]
    if too_large:
        raise ValueError(
            f"{label}: detached components too large to clean safely: "
            f"{[int(item['area']) for item in too_large]}"
        )
    pixels = rgba.load()
    for item in removable:
        for x, y in item["points"]:
            pixels[x, y] = (0, 0, 0, 0)
    return rgba


def geometry(image: Image.Image, label: str) -> dict:
    found = components(image)
    if not found:
        raise ValueError(f"{label}: empty frame")
    left, top, right, bottom = found[0]["bbox"]
    return {
        "bbox": [left, top, right, bottom],
        "width": right - left,
        "height": bottom - top,
        "centerX": (left + right) / 2.0,
        "centerY": (top + bottom) / 2.0,
        "footY": bottom,
        "componentCount": len(found),
        "detachedAreas": [int(item["area"]) for item in found[1:]],
    }


def normalize_primary(source: Image.Image, reference: Image.Image, label: str) -> Image.Image:
    isolated, source_main = isolate_primary(source, label)
    ref_main = primary(reference, f"{label} reference")
    sx0, sy0, sx1, sy1 = source_main["bbox"]
    rx0, ry0, rx1, ry1 = ref_main["bbox"]
    source_height = sy1 - sy0
    target_height = ry1 - ry0
    if source_height <= 0 or target_height <= 0:
        raise ValueError(f"{label}: invalid geometry")
    scale = target_height / source_height
    if not 0.75 <= scale <= 1.30:
        raise ValueError(f"{label}: unsafe normalization scale {scale:.4f}")
    crop = isolated.crop(source_main["bbox"])
    scaled = crop.resize(
        (max(1, round(crop.width * scale)), max(1, round(crop.height * scale))),
        Image.Resampling.NEAREST,
    )
    target_center_x = (rx0 + rx1) / 2.0
    target_center_y = (ry0 + ry1) / 2.0
    dest_x = round(target_center_x - scaled.width / 2.0)
    dest_y = round(target_center_y - scaled.height / 2.0)
    if (
        dest_x < 0
        or dest_y < 0
        or dest_x + scaled.width > CELL
        or dest_y + scaled.height > CELL
    ):
        raise ValueError(f"{label}: normalized primary would clip")
    output = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    output.alpha_composite(scaled, (dest_x, dest_y))
    return output


def transplant_lower_body(source: Image.Image, reference: Image.Image, label: str) -> Image.Image:
    ref = primary(reference, f"{label} reference")
    _, top, _, bottom = ref["bbox"]
    split_y = top + max(1, int((bottom - top) * LOWER_SPLIT_FRACTION))
    output = source.convert("RGBA").copy()
    output.paste((0, 0, 0, 0), (0, split_y, CELL, CELL))
    output.alpha_composite(reference.crop((0, split_y, CELL, CELL)), (0, split_y))
    return remove_tiny_detached(output, label)


def lower_signature(image: Image.Image, label: str) -> bytes:
    left, top, right, bottom = primary(image, label)["bbox"]
    start_y = top + max(1, int((bottom - top) * LOWER_SIGNATURE_FRACTION))
    alpha = image.convert("RGBA").getchannel("A").crop((left, start_y, right, bottom))
    if alpha.getbbox() is None:
        raise ValueError(f"{label}: no lower-body silhouette")
    normalized = alpha.resize(SIGNATURE_SIZE, Image.Resampling.NEAREST)
    return bytes(
        1 if int(value) >= SIGNATURE_THRESHOLD else 0
        for value in normalized.get_flattened_data()
    )


def signature_delta(left: bytes, right: bytes) -> float:
    union = sum(1 for a, b in zip(left, right) if a or b)
    if union == 0:
        return 0.0
    changed = sum(1 for a, b in zip(left, right) if a != b)
    return changed / union


def run_motion(atlas: Image.Image, label: str) -> dict:
    signatures = [
        lower_signature(cell(atlas, RUN_ROW, col), f"{label} run c{col}")
        for col in range(COLS)
    ]
    deltas = [
        signature_delta(signatures[index], signatures[(index + 1) % len(signatures)])
        for index in range(len(signatures))
    ]
    return {
        "medianDelta": round(float(statistics.median(deltas)), 6),
        "maxDelta": round(float(max(deltas)), 6),
        "deltas": [round(float(value), 6) for value in deltas],
    }


def paste_cell(atlas: Image.Image, row: int, col: int, frame: Image.Image) -> None:
    atlas.paste(
        (0, 0, 0, 0),
        (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL),
    )
    atlas.alpha_composite(frame, (col * CELL, row * CELL))


def repair_machinegun(source: Image.Image, pistol: Image.Image) -> Image.Image:
    output = source.copy()
    for row in MACHINEGUN_ROWS:
        for col in range(COLS):
            current = cell(source, row, col)
            reference = cell(pistol, row, col)
            work = (
                normalize_primary(current, reference, f"machinegun {ROW_NAMES[row]} c{col}")
                if row in AIR_ROWS
                else current
            )
            repaired = transplant_lower_body(
                work, reference, f"machinegun {ROW_NAMES[row]} c{col}"
            )
            paste_cell(output, row, col, repaired)
    return output


def repair_run_only(source: Image.Image, pistol: Image.Image, weapon: str) -> Image.Image:
    output = source.copy()
    for col in range(COLS):
        repaired = transplant_lower_body(
            cell(source, RUN_ROW, col),
            cell(pistol, RUN_ROW, col),
            f"{weapon} run c{col}",
        )
        paste_cell(output, RUN_ROW, col, repaired)
    return output


def assert_untouched(
    source: Image.Image, output: Image.Image, modified_rows: set[int], weapon: str
) -> None:
    for row in range(ROWS):
        if row in modified_rows:
            continue
        source_row = source.crop((0, row * CELL, CELL * COLS, (row + 1) * CELL))
        output_row = output.crop((0, row * CELL, CELL * COLS, (row + 1) * CELL))
        if source_row.tobytes() != output_row.tobytes():
            raise ValueError(f"{weapon}: row {row} changed outside repair scope")


def validate_machinegun(output: Image.Image, pistol: Image.Image) -> dict:
    report: dict[str, list[dict]] = {}
    for row in MACHINEGUN_ROWS:
        action = ROW_NAMES[row]
        frames: list[dict] = []
        for col in range(COLS):
            actual = geometry(cell(output, row, col), f"machinegun repaired {action} c{col}")
            reference = geometry(cell(pistol, row, col), f"pistol reference {action} c{col}")
            if actual["componentCount"] != 1:
                raise ValueError(
                    f"machinegun {action} c{col}: detached components {actual['detachedAreas']}"
                )
            ratio = actual["height"] / reference["height"]
            if row in AIR_ROWS or row == 0:
                if not HEIGHT_RATIO[0] <= ratio <= HEIGHT_RATIO[1]:
                    raise ValueError(f"machinegun {action} c{col}: height ratio {ratio:.4f}")
                if abs(actual["centerX"] - reference["centerX"]) > CENTER_TOLERANCE:
                    raise ValueError(f"machinegun {action} c{col}: centerX drift")
                if abs(actual["centerY"] - reference["centerY"]) > CENTER_Y_TOLERANCE:
                    raise ValueError(f"machinegun {action} c{col}: centerY drift")
            if abs(actual["footY"] - reference["footY"]) > FOOT_TOLERANCE:
                raise ValueError(f"machinegun {action} c{col}: lower-body footline drift")
            frames.append(
                {
                    **actual,
                    "heightRatio": round(ratio, 6),
                    "centerXDrift": round(actual["centerX"] - reference["centerX"], 6),
                    "centerYDrift": round(actual["centerY"] - reference["centerY"], 6),
                }
            )
        report[action] = frames
    return report


def validate_run(output: Image.Image, pistol: Image.Image, weapon: str) -> dict:
    for col in range(COLS):
        actual = geometry(cell(output, RUN_ROW, col), f"{weapon} repaired run c{col}")
        reference = geometry(cell(pistol, RUN_ROW, col), f"pistol reference run c{col}")
        if actual["componentCount"] != 1:
            raise ValueError(
                f"{weapon} run c{col}: detached components {actual['detachedAreas']}"
            )
        if abs(actual["footY"] - reference["footY"]) > FOOT_TOLERANCE:
            raise ValueError(f"{weapon} run c{col}: footline drift")
    motion = run_motion(output, weapon)
    if motion["medianDelta"] < RUN_MEDIAN_MIN:
        raise ValueError(
            f"{weapon} run median leg motion {motion['medianDelta']:.4f} < {RUN_MEDIAN_MIN:.4f}"
        )
    if motion["maxDelta"] < RUN_PEAK_MIN:
        raise ValueError(
            f"{weapon} run peak leg motion {motion['maxDelta']:.4f} < {RUN_PEAK_MIN:.4f}"
        )
    return motion


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
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


def render_review(
    source: Image.Image,
    output: Image.Image,
    rows: tuple[int, ...],
    weapon: str,
    path: Path,
) -> None:
    label_h = 26
    width = CELL * COLS
    height = len(rows) * 2 * (CELL + label_h)
    board = Image.new("RGBA", (width, height), (22, 24, 28, 255))
    draw = ImageDraw.Draw(board)
    y = 0
    for row in rows:
        action = ROW_NAMES[row]
        for phase, atlas in (("BEFORE", source), ("AFTER", output)):
            draw.text(
                (8, y + 6),
                f"{weapon.upper()} · {action.upper()} · {phase}",
                fill=(240, 240, 240, 255),
            )
            strip = atlas.crop((0, row * CELL, width, (row + 1) * CELL))
            bg = checkerboard(strip.size)
            bg.alpha_composite(strip)
            board.alpha_composite(bg, (0, y + label_h))
            y += CELL + label_h
    path.parent.mkdir(parents=True, exist_ok=True)
    board.thumbnail((1600, 10000), Image.Resampling.NEAREST)
    board.save(path, "PNG", optimize=True)


def self_test() -> None:
    ref = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    src = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw_ref = ImageDraw.Draw(ref)
    draw_src = ImageDraw.Draw(src)
    draw_ref.rectangle((150, 90, 250, 380), fill=(30, 30, 30, 255))
    draw_ref.rectangle((120, 310, 170, 381), fill=(50, 50, 50, 255))
    draw_ref.rectangle((230, 310, 280, 381), fill=(50, 50, 50, 255))
    draw_src.rectangle((145, 110, 255, 370), fill=(70, 70, 70, 255))
    draw_src.rectangle((280, 120, 288, 128), fill=(255, 255, 255, 255))
    normalized = normalize_primary(src, ref, "self-test")
    repaired = transplant_lower_body(normalized, ref, "self-test")
    assert geometry(repaired, "self-test")["componentCount"] == 1
    noisy = repaired.copy()
    noisy.putpixel((10, 10), (255, 255, 255, 255))
    cleaned = remove_tiny_detached(noisy, "tiny-detached self-test")
    assert geometry(cleaned, "tiny-detached self-test")["componentCount"] == 1
    assert geometry(repaired, "self-test")["footY"] == geometry(ref, "ref")["footY"]

    frames = []
    for offset in (0, 16, 28, 12, -8, -24, -12, 8):
        frame = ref.copy()
        frame.paste((0, 0, 0, 0), (0, 300, CELL, CELL))
        draw = ImageDraw.Draw(frame)
        draw.rectangle((130 + offset, 300, 175 + offset, 381), fill=(255, 255, 255, 255))
        draw.rectangle((225 - offset, 300, 270 - offset, 381), fill=(255, 255, 255, 255))
        frames.append(frame)
    signatures = [lower_signature(frame, "motion self-test") for frame in frames]
    deltas = [
        signature_delta(signatures[i], signatures[(i + 1) % len(signatures)])
        for i in range(len(signatures))
    ]
    assert statistics.median(deltas) > RUN_MEDIAN_MIN
    assert max(deltas) > RUN_PEAK_MIN
    print("Matthias runtime motion repair self-test: OK")


def main() -> int:
    cfg = parse_args()
    if cfg.self_test:
        self_test()
        return 0
    required = (
        cfg.pistol,
        cfg.machinegun,
        cfg.shotgun,
        cfg.panzerfaust,
        cfg.output_dir,
    )
    if any(value is None for value in required):
        raise SystemExit(
            "--pistol --machinegun --shotgun --panzerfaust --output-dir required"
        )

    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    pistol = Image.open(cfg.pistol).convert("RGBA")
    if pistol.size != SIZE:
        raise ValueError(f"pistol reference size {pistol.size}, expected {SIZE}")

    sources = {
        "machinegun": cfg.machinegun,
        "shotgun": cfg.shotgun,
        "panzerfaust": cfg.panzerfaust,
    }
    report = {
        "schema": 1,
        "scope": "pawn-slug-matthias-runtime-motion-repair",
        "pistolSha256": sha256(cfg.pistol),
        "lowerSplitFraction": LOWER_SPLIT_FRACTION,
        "runThresholds": {
            "medianDeltaMin": RUN_MEDIAN_MIN,
            "peakDeltaMin": RUN_PEAK_MIN,
        },
        "weapons": {},
    }

    for weapon, source_path in sources.items():
        source = Image.open(source_path).convert("RGBA")
        if source.size != SIZE:
            raise ValueError(f"{weapon} source size {source.size}, expected {SIZE}")
        if weapon == "machinegun":
            output = repair_machinegun(source, pistol)
            modified_rows = set(MACHINEGUN_ROWS)
            critical = validate_machinegun(output, pistol)
            review_rows = MACHINEGUN_ROWS
        else:
            output = repair_run_only(source, pistol, weapon)
            modified_rows = {RUN_ROW}
            critical = {}
            review_rows = (RUN_ROW,)

        assert_untouched(source, output, modified_rows, weapon)
        motion_before = run_motion(source, f"{weapon} before")
        motion_after = validate_run(output, pistol, weapon)

        output_path = cfg.output_dir / f"{weapon}-full-motion-repaired.png"
        output.save(output_path, "PNG", optimize=True)
        review_path = cfg.output_dir / f"{weapon}-motion-review.png"
        render_review(source, output, review_rows, weapon, review_path)
        report["weapons"][weapon] = {
            "sourceSha256": sha256(source_path),
            "outputSha256": sha256(output_path),
            "output": output_path.name,
            "review": review_path.name,
            "modifiedRows": sorted(modified_rows),
            "runBefore": motion_before,
            "runAfter": motion_after,
            "criticalGeometry": critical,
        }
        source.close()
        output.close()

    (cfg.output_dir / "motion-repair-health.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    pistol.close()
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
