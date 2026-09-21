#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

from sprite_forge import (
    GeometryContract,
    LintConfig,
    geometry_metrics,
    lint_frame,
    normalize_frame,
)

MASTER_SHA256 = "9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f"
MASTER_SIZE = (1536, 1024)
CANVAS = 416

# Seed poses deliberately come only from the immutable approved v1 master.
# Rear views, labels, portrait art and legacy runtime atlases are excluded.
SOURCES = {
    "shoot": [
        {"box": (100, 573, 191, 687), "guide": "aim"},
    ],
    "walk": [
        {"box": (90, 276, 179, 403), "guide": "walk"},
        {"box": (192, 276, 281, 403), "guide": "walk"},
        {"box": (296, 276, 382, 403), "guide": "walk"},
        {"box": (397, 276, 482, 403), "guide": "walk"},
    ],
    "run": [
        {"box": (78, 419, 170, 546), "guide": "run"},
        {"box": (181, 419, 275, 546), "guide": "run"},
        {"box": (287, 419, 379, 546), "guide": "run"},
        {"box": (388, 419, 480, 546), "guide": "run"},
    ],
    "crouch": [
        {"box": (774, 755, 881, 883), "guide": "crouch"},
    ],
}

GUIDES = {
    "aim": [(12,21),(26,10),(50,1),(66,1),(73,6),(71,19),(72,27),(65,29),(65,38),(94,38),(98,43),(96,48),(78,49),(75,56),(70,60),(64,63),(57,65),(58,76),(65,85),(65,91),(76,96),(76,99),(54,99),(51,91),(48,80),(42,81),(34,90),(26,94),(26,99),(6,99),(5,93),(10,88),(17,75),(22,71),(12,69),(8,59),(8,50),(13,43),(22,40),(17,35),(16,28)],
    "walk": [(24,20),(35,12),(54,4),(72,1),(84,2),(88,6),(85,18),(85,21),(89,26),(81,29),(79,37),(72,42),(67,45),(69,49),(68,54),(80,58),(81,63),(74,66),(68,65),(62,71),(73,78),(76,84),(85,85),(88,89),(77,95),(67,98),(63,94),(58,85),(50,79),(43,75),(35,82),(25,87),(23,92),(22,98),(15,100),(10,98),(6,90),(4,85),(6,80),(17,73),(24,68),(18,64),(16,60),(17,50),(22,45),(29,42),(36,40),(31,36),(30,28)],
    "run": [(23,22),(35,12),(57,3),(76,2),(84,6),(84,17),(88,25),(83,28),(79,38),(69,44),(73,49),(80,53),(82,60),(76,64),(66,63),(62,70),(69,75),(71,80),(84,84),(89,90),(77,98),(69,99),(64,94),(55,86),(45,81),(39,79),(26,84),(19,85),(18,94),(12,96),(8,93),(5,83),(7,76),(18,73),(26,65),(20,64),(16,59),(18,49),(26,44),(34,42),(33,35),(31,28)],
    "crouch": [(19,20),(35,10),(52,4),(64,3),(74,5),(78,11),(75,22),(76,26),(70,29),(69,40),(92,44),(97,48),(96,53),(79,54),(76,61),(70,65),(60,66),(60,76),(69,79),(70,86),(72,91),(78,94),(78,98),(56,98),(49,94),(39,96),(31,98),(8,97),(7,92),(11,86),(8,80),(10,68),(12,57),(19,50),(26,47),(23,40),(22,33)],
}

GEOMETRY = GeometryContract(
    canvas_size=(CANVAS, CANVAS),
    body_height=300,
    body_center_x=208.0,
    foot_y=382.0,
    alpha_centroid_x=208.0,
    safe_margin_px=10,
    foot_tolerance_px=2.0,
    height_tolerance_px=3.0,
    centroid_tolerance_px=38.0,
)
LINT = LintConfig(
    alpha_threshold=8,
    edge_guard_px=0,
    min_detached_area=6,
    allowed_detached_components=0,
    reject_hidden_rgb=True,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _matte(source: Image.Image, box: tuple[int, int, int, int], guide_name: str) -> Image.Image:
    crop = source.crop(box).convert("RGBA")
    width, height = crop.size
    mask = Image.new("L", crop.size, 0)
    points = [
        (
            round(x * (width - 1) / 100),
            round(y * (height - 1) / 100),
        )
        for x, y in GUIDES[guide_name]
    ]
    ImageDraw.Draw(mask).polygon(points, fill=255)
    # Fixed sub-pixel feathering avoids a jagged polygon edge without inventing
    # silhouette pixels outside the authored guide.
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    crop.putalpha(mask)

    pixels = crop.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if a == 0 and (r or g or b):
                pixels[x, y] = (0, 0, 0, 0)
    return crop


def _review(frames: list[tuple[str, int, Image.Image]], output: Path) -> None:
    columns = 4
    tile_w = 320
    tile_h = 320
    rows = (len(frames) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * tile_w, rows * tile_h), (18, 20, 24, 255))
    draw = ImageDraw.Draw(sheet)
    for cell, (action, index, frame) in enumerate(frames):
        x = (cell % columns) * tile_w
        y = (cell // columns) * tile_h
        preview = frame.copy()
        preview.thumbnail((280, 270), Image.Resampling.LANCZOS)
        sheet.alpha_composite(preview, (x + (tile_w - preview.width) // 2, y + 12))
        draw.text((x + 12, y + 292), f"{action}/{index:03d}", fill=(230, 233, 238, 255))
    sheet.save(output, "PNG", compress_level=9)


def ingest(master: Path, output_dir: Path) -> dict:
    if sha256(master) != MASTER_SHA256:
        raise SystemExit("approved Matthias master SHA-256 mismatch")
    source = Image.open(master).convert("RGBA")
    if source.size != MASTER_SIZE:
        raise SystemExit(f"approved Matthias master dimensions drift: {source.size}")

    raw_root = output_dir / "quarantine"
    normalized_root = output_dir / "normalized"
    raw_root.mkdir(parents=True, exist_ok=True)
    normalized_root.mkdir(parents=True, exist_ok=True)

    review_frames: list[tuple[str, int, Image.Image]] = []
    records: list[dict] = []
    for action, specs in SOURCES.items():
        for index, spec in enumerate(specs):
            raw = _matte(source, tuple(spec["box"]), str(spec["guide"]))
            raw_result = lint_frame(raw, LINT)
            if not raw_result.ok:
                raise SystemExit(
                    f"{action}/{index:03d} raw lint failed: {','.join(raw_result.errors)}"
                )

            normalized = normalize_frame(raw, GEOMETRY, LINT)
            raw_path = raw_root / action / f"{index:03d}.png"
            normalized_path = normalized_root / action / f"{index:03d}.png"
            raw_path.parent.mkdir(parents=True, exist_ok=True)
            normalized_path.parent.mkdir(parents=True, exist_ok=True)
            raw.save(raw_path, "PNG", compress_level=9)
            normalized.save(normalized_path, "PNG", compress_level=9)

            metrics = geometry_metrics(normalized, LINT.alpha_threshold)
            if metrics is None:
                raise SystemExit(f"{action}/{index:03d} normalized frame is empty")
            review_frames.append((action, index, normalized))
            records.append(
                {
                    "action": action,
                    "frame": index,
                    "source_box": list(spec["box"]),
                    "raw_sha256": sha256(raw_path),
                    "normalized_sha256": sha256(normalized_path),
                    "body_bbox": list(metrics.body_bbox),
                    "foot_y": metrics.foot_y,
                    "alpha_centroid_x": metrics.alpha_centroid_x,
                }
            )

    review_path = output_dir / "matthias-pistol-v1-seed-review.png"
    _review(review_frames, review_path)
    report = {
        "schema": 1,
        "kind": "matthias-pistol-v1-master-seed",
        "status": "quarantined-candidate",
        "master_sha256": MASTER_SHA256,
        "master_size": list(MASTER_SIZE),
        "frame_count": len(records),
        "actions": sorted(SOURCES),
        "review_sha256": sha256(review_path),
        "frames": records,
        "limitations": [
            "seed only; not an accepted Sprite Forge bank",
            "missing full idle/jump/fall/land/directional/crouch-walk/reload/hurt/die coverage",
            "no runtime promotion in this step",
        ],
    }
    (output_dir / "report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    report = ingest(args.master.resolve(), args.output_dir.resolve())
    print(json.dumps(
        {
            "frame_count": report["frame_count"],
            "review_sha256": report["review_sha256"],
            "status": report["status"],
        },
        sort_keys=True,
    ))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
