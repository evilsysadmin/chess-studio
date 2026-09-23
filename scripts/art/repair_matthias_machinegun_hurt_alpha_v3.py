#!/usr/bin/env python3
"""Build Matthias SMG hurt alpha v3 by pruning tiny detached hurt islands."""

from __future__ import annotations

import argparse
import hashlib
import json
import tempfile
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw

ALPHA_THRESHOLD = 8
HURT_ROW = 16
DONOR_COLUMN = 4
DX = (0, 13, 6, 2, 0, -17, -17, -17)
PATCH = (80, 110, 305, 220)
MAX_RGB_MEAN = 165.0
MIN_COVERAGE = 0.985
MAX_DETACHED_AREA = 128


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def components(image: Image.Image) -> list[list[tuple[int, int]]]:
    alpha = image.convert("RGBA").getchannel("A")
    opaque = {
        (x, y)
        for y in range(alpha.height)
        for x in range(alpha.width)
        if alpha.getpixel((x, y)) >= ALPHA_THRESHOLD
    }
    found: list[list[tuple[int, int]]] = []
    while opaque:
        start = opaque.pop()
        queue = deque([start])
        group = [start]
        while queue:
            x, y = queue.popleft()
            for point in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if point in opaque:
                    opaque.remove(point)
                    queue.append(point)
                    group.append(point)
        found.append(group)
    return sorted(found, key=len, reverse=True)


def dark_support(image: Image.Image) -> list[tuple[int, int]]:
    rgba = image.convert("RGBA")
    pixels = rgba.load()
    x0, y0, x1, y1 = PATCH
    support: list[tuple[int, int]] = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b, a = pixels[x, y]
            if a >= ALPHA_THRESHOLD and (r + g + b) / 3.0 <= MAX_RGB_MEAN:
                support.append((x, y))
    if not support:
        raise ValueError("machinegun hurt donor has no dark cap support")
    return support


def coverage(image: Image.Image, support: list[tuple[int, int]], dx: int) -> float:
    alpha = image.convert("RGBA").getchannel("A")
    total = covered = 0
    for x, y in support:
        tx = x + dx
        if 0 <= tx < alpha.width:
            total += 1
            if alpha.getpixel((tx, y)) >= ALPHA_THRESHOLD:
                covered += 1
    if total == 0:
        raise ValueError("translated donor support is empty")
    return covered / total


def render_proof(atlas: Image.Image, columns: int, cell_size: int, output: Path) -> None:
    strip = atlas.crop(
        (0, HURT_ROW * cell_size, columns * cell_size, (HURT_ROW + 1) * cell_size)
    )
    panels: list[Image.Image] = []
    for label, bg in (("LIGHT", (242, 242, 242, 255)), ("DARK", (28, 30, 34, 255))):
        base = Image.new("RGBA", strip.size, bg)
        base.alpha_composite(strip)
        reduced = base.resize(
            (round(base.width * 0.5), round(base.height * 0.5)),
            Image.Resampling.NEAREST,
        )
        panel = Image.new("RGBA", (reduced.width, reduced.height + 28), (18, 20, 24, 255))
        ImageDraw.Draw(panel).text(
            (8, 7),
            f"MACHINEGUN HURT ALPHA V3 · {label}",
            fill=(240, 240, 240, 255),
        )
        panel.alpha_composite(reduced, (0, 28))
        panels.append(panel)

    proof = Image.new(
        "RGBA",
        (max(panel.width for panel in panels), sum(panel.height for panel in panels)),
        (12, 14, 18, 255),
    )
    y = 0
    for panel in panels:
        proof.alpha_composite(panel, (0, y))
        y += panel.height
    save_png(proof, output)


def repair(
    frames_root: Path,
    candidate_path: Path,
    output_dir: Path,
    *,
    columns: int,
    cell_size: int,
    min_coverage: float,
    max_detached_area: int,
) -> dict:
    candidate = Image.open(candidate_path).convert("RGBA")
    if candidate.width != columns * cell_size or candidate.height < 17 * cell_size:
        raise ValueError(f"unexpected atlas size: {candidate.size}")
    if columns != len(DX):
        raise ValueError("column count must match canonical hurt offsets")

    repaired = candidate.copy()
    reports: list[dict] = []
    hurt_y = HURT_ROW * cell_size

    for column in range(columns):
        box = (
            column * cell_size,
            hurt_y,
            (column + 1) * cell_size,
            hurt_y + cell_size,
        )
        frame = repaired.crop(box)
        groups = components(frame)
        if not groups:
            raise ValueError(f"machinegun hurt c{column}: empty frame")

        source_path = (
            frames_root
            / "machinegun"
            / "frames"
            / f"matthias_machinegun_r{HURT_ROW:02d}_c{column:02d}.png"
        )
        source = Image.open(source_path).convert("RGBA")
        source_alpha = source.getchannel("A")

        removed: list[dict] = []
        pixels = frame.load()
        for group in groups[1:]:
            area = len(group)
            if area > max_detached_area:
                raise ValueError(
                    f"machinegun hurt c{column}: detached component {area}px "
                    f"> max {max_detached_area}px"
                )
            preexisting = sum(
                1 for x, y in group if source_alpha.getpixel((x, y)) >= ALPHA_THRESHOLD
            )
            for x, y in group:
                pixels[x, y] = (0, 0, 0, 0)
            removed.append(
                {
                    "area": area,
                    "preexistingOpaque": preexisting,
                    "v2AddedOpaque": area - preexisting,
                }
            )

        if removed:
            remaining = components(frame)
            if len(remaining) != 1:
                raise ValueError(
                    f"machinegun hurt c{column}: pruning left {len(remaining)} components"
                )
            repaired.paste(frame, box)

        reports.append(
            {
                "column": column,
                "componentCountBefore": len(groups),
                "removed": removed,
            }
        )

    donor_box = (
        DONOR_COLUMN * cell_size,
        hurt_y,
        (DONOR_COLUMN + 1) * cell_size,
        hurt_y + cell_size,
    )
    support = dark_support(repaired.crop(donor_box))
    for report in reports:
        column = report["column"]
        box = (
            column * cell_size,
            hurt_y,
            (column + 1) * cell_size,
            hurt_y + cell_size,
        )
        value = coverage(repaired.crop(box), support, DX[column])
        report["coverage"] = round(value, 6)
        if value < min_coverage:
            raise ValueError(
                f"machinegun hurt c{column}: cap coverage {value:.6f} "
                f"< {min_coverage:.6f}"
            )

    for row in range(candidate.height // cell_size):
        if row == HURT_ROW:
            continue
        y0 = row * cell_size
        y1 = min(candidate.height, y0 + cell_size)
        if candidate.crop((0, y0, candidate.width, y1)).tobytes() != repaired.crop(
            (0, y0, repaired.width, y1)
        ).tobytes():
            raise ValueError(f"non-hurt row changed: {row}")

    atlas_path = output_dir / "machinegun-hurt-alpha-v3.png"
    proof_path = output_dir / "machinegun-hurt-alpha-v3-proof.png"
    health_path = output_dir / "machinegun-hurt-alpha-v3-health.json"
    save_png(repaired, atlas_path)
    render_proof(repaired, columns, cell_size, proof_path)

    report = {
        "schema": 1,
        "kind": "matthias-machinegun-hurt-alpha-v3",
        "source": candidate_path.name,
        "hurtRow": HURT_ROW,
        "donorColumn": DONOR_COLUMN,
        "minCoverage": min_coverage,
        "maxDetachedArea": max_detached_area,
        "nonHurtRowsPixelIdentical": True,
        "frames": reports,
        "sha256": sha256(atlas_path),
    }
    health_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n")
    return report


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        frames_root = root / "frames"
        hurt_dir = frames_root / "machinegun" / "frames"
        hurt_dir.mkdir(parents=True)
        atlas = Image.new("RGBA", (8 * 416, 17 * 416), (0, 0, 0, 0))
        hurt_y = HURT_ROW * 416

        for column in range(8):
            source = Image.new("RGBA", (416, 416), (0, 0, 0, 0))
            draw = ImageDraw.Draw(source)
            draw.rectangle((100, 120, 260, 300), fill=(40, 40, 40, 255))
            save_png(
                source,
                hurt_dir / f"matthias_machinegun_r{HURT_ROW:02d}_c{column:02d}.png",
            )
            candidate = source.copy()
            if column == 3:
                ImageDraw.Draw(candidate).rectangle(
                    (290, 130, 294, 134), fill=(35, 35, 35, 255)
                )
            atlas.paste(candidate, (column * 416, hurt_y))

        source_atlas = root / "v2.png"
        save_png(atlas, source_atlas)
        report = repair(
            frames_root,
            source_atlas,
            root / "out",
            columns=8,
            cell_size=416,
            min_coverage=0.5,
            max_detached_area=128,
        )
        removed = report["frames"][3]["removed"]
        if removed != [{"area": 25, "preexistingOpaque": 0, "v2AddedOpaque": 25}]:
            raise AssertionError(f"unexpected prune: {removed}")
        if not (root / "out" / "machinegun-hurt-alpha-v3-proof.png").is_file():
            raise AssertionError("proof missing")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("frames_root", type=Path, nargs="?")
    parser.add_argument("candidate", type=Path, nargs="?")
    parser.add_argument("output_dir", type=Path, nargs="?")
    parser.add_argument("--columns", type=int, default=8)
    parser.add_argument("--cell-size", type=int, default=416)
    parser.add_argument("--min-coverage", type=float, default=MIN_COVERAGE)
    parser.add_argument("--max-detached-area", type=int, default=MAX_DETACHED_AREA)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        print("Matthias SMG hurt alpha v3 self-test: OK")
        return 0
    if args.frames_root is None or args.candidate is None or args.output_dir is None:
        raise SystemExit("frames_root, candidate and output_dir are required")
    report = repair(
        args.frames_root,
        args.candidate,
        args.output_dir,
        columns=args.columns,
        cell_size=args.cell_size,
        min_coverage=args.min_coverage,
        max_detached_area=args.max_detached_area,
    )
    print(
        json.dumps(
            {
                "status": "ok",
                "sha256": report["sha256"],
                "removed": [
                    frame for frame in report["frames"] if frame["removed"]
                ],
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
