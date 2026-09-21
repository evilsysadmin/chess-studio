#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import cv2
import numpy as np
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

# Only front-facing, weapon-integrated poses from the immutable approved v1
# master. Rear views, labels, portrait art and legacy runtime atlases are excluded.
# "polygon" is used where the silhouette is already cleanly isolated; "grabcut"
# is reserved for darker upright poses where clothing and background are close.
SOURCES = {
    "idle": [
        {"box": (90, 120, 190, 260), "guide": "idle", "matte": "grabcut"},
        {"box": (190, 120, 290, 260), "guide": "idle", "matte": "grabcut"},
        {"box": (290, 120, 390, 260), "guide": "idle", "matte": "grabcut"},
        {"box": (890, 120, 990, 260), "guide": "idle", "matte": "grabcut"},
    ],
    "shoot": [
        {"box": (100, 573, 191, 687), "guide": "aim", "matte": "polygon"},
        {"box": (200, 573, 291, 687), "guide": "aim", "matte": "polygon"},
    ],
    "walk": [
        {"box": (90, 276, 179, 403), "guide": "walk", "matte": "polygon"},
        {"box": (192, 276, 281, 403), "guide": "walk", "matte": "polygon"},
        {"box": (296, 276, 382, 403), "guide": "walk", "matte": "polygon"},
        {"box": (397, 276, 482, 403), "guide": "walk", "matte": "polygon"},
    ],
    "run": [
        {"box": (78, 419, 170, 546), "guide": "run", "matte": "polygon"},
        {"box": (181, 419, 275, 546), "guide": "run", "matte": "polygon"},
        {"box": (287, 419, 379, 546), "guide": "run", "matte": "polygon"},
        {"box": (388, 419, 480, 546), "guide": "run", "matte": "polygon"},
    ],
    "crouch": [
        {"box": (774, 755, 881, 883), "guide": "crouch", "matte": "polygon"},
    ],
    "reload": [
        {"box": (85, 700, 195, 840), "guide": "reload", "matte": "grabcut"},
        {"box": (195, 700, 305, 840), "guide": "reload", "matte": "grabcut"},
        {"box": (305, 700, 415, 840), "guide": "reload", "matte": "grabcut"},
        {"box": (415, 700, 525, 840), "guide": "reload", "matte": "grabcut"},
        {"box": (525, 700, 650, 840), "guide": "reload", "matte": "grabcut"},
    ],
    "hurt": [
        {"box": (1020, 760, 1145, 880), "guide": "hurt", "matte": "grabcut"},
    ],
}

GUIDES = {
    "aim": [(12,21),(26,10),(50,1),(66,1),(73,6),(71,19),(72,27),(65,29),(65,38),(94,38),(98,43),(96,48),(78,49),(75,56),(70,60),(64,63),(57,65),(58,76),(65,85),(65,91),(76,96),(76,99),(54,99),(51,91),(48,80),(42,81),(34,90),(26,94),(26,99),(6,99),(5,93),(10,88),(17,75),(22,71),(12,69),(8,59),(8,50),(13,43),(22,40),(17,35),(16,28)],
    "walk": [(24,20),(35,12),(54,4),(72,1),(84,2),(88,6),(85,18),(85,21),(89,26),(81,29),(79,37),(72,42),(67,45),(69,49),(68,54),(80,58),(81,63),(74,66),(68,65),(62,71),(73,78),(76,84),(85,85),(88,89),(77,95),(67,98),(63,94),(58,85),(50,79),(43,75),(35,82),(25,87),(23,92),(22,98),(15,100),(10,98),(6,90),(4,85),(6,80),(17,73),(24,68),(18,64),(16,60),(17,50),(22,45),(29,42),(36,40),(31,36),(30,28)],
    "run": [(23,22),(35,12),(57,3),(76,2),(84,6),(84,17),(88,25),(83,28),(79,38),(69,44),(73,49),(80,53),(82,60),(76,64),(66,63),(62,70),(69,75),(71,80),(84,84),(89,90),(77,98),(69,99),(64,94),(55,86),(45,81),(39,79),(26,84),(19,85),(18,94),(12,96),(8,93),(5,83),(7,76),(18,73),(26,65),(20,64),(16,59),(18,49),(26,44),(34,42),(33,35),(31,28)],
    "crouch": [(19,20),(35,10),(52,4),(64,3),(74,5),(78,11),(75,22),(76,26),(70,29),(69,40),(92,44),(97,48),(96,53),(79,54),(76,61),(70,65),(60,66),(60,76),(69,79),(70,86),(72,91),(78,94),(78,98),(56,98),(49,94),(39,96),(31,98),(8,97),(7,92),(11,86),(8,80),(10,68),(12,57),(19,50),(26,47),(23,40),(22,33)],
    "idle": [(17,18),(30,7),(50,1),(68,3),(76,9),(74,22),(78,28),(70,34),(70,44),(78,52),(76,62),(70,67),(67,78),(72,88),(80,94),(76,99),(58,99),(52,90),(48,80),(42,80),(36,90),(30,99),(14,98),(12,92),(18,84),(22,72),(14,68),(10,58),(12,48),(20,42),(26,38),(22,30)],
    "reload": [(15,18),(30,7),(50,1),(68,3),(76,9),(74,22),(78,28),(70,34),(70,43),(88,48),(96,55),(94,62),(76,64),(69,70),(66,80),(72,89),(80,95),(76,99),(58,99),(51,90),(46,80),(40,82),(34,92),(28,99),(14,98),(12,92),(18,84),(20,72),(12,68),(8,58),(10,48),(19,42),(25,38),(21,30)],
    "hurt": [(15,18),(30,7),(50,1),(68,3),(76,9),(74,22),(78,28),(70,34),(72,44),(82,52),(84,64),(76,72),(70,82),(75,91),(78,98),(58,99),(52,91),(46,82),(38,86),(31,96),(18,98),(12,91),(16,80),(14,70),(9,60),(12,48),(20,42),(26,38),(22,30)],
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


def _guide_mask(size: tuple[int, int], guide_name: str) -> np.ndarray:
    width, height = size
    points = np.array(
        [
            (
                round(x * (width - 1) / 100),
                round(y * (height - 1) / 100),
            )
            for x, y in GUIDES[guide_name]
        ],
        np.int32,
    )
    mask = np.zeros((height, width), np.uint8)
    cv2.fillPoly(mask, [points], 255)
    return mask


def _clean_transparent_rgb_array(rgba: np.ndarray) -> np.ndarray:
    rgba = rgba.copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return rgba


def _polygon_matte(source: Image.Image, box: tuple[int, int, int, int], guide_name: str) -> Image.Image:
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
    mask = mask.filter(ImageFilter.GaussianBlur(0.6))
    crop.putalpha(mask)
    pixels = np.array(crop)
    return Image.fromarray(_clean_transparent_rgb_array(pixels), "RGBA")


def _grabcut_matte(source: Image.Image, box: tuple[int, int, int, int], guide_name: str) -> Image.Image:
    crop = np.array(source.crop(box).convert("RGBA"))
    rgb = crop[:, :, :3]
    bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
    height, width = rgb.shape[:2]

    guide = _guide_mask((width, height), guide_name)
    outer = cv2.dilate(guide, np.ones((3, 3), np.uint8))

    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]], axis=0)
    background = np.median(border, axis=0)
    distance = np.linalg.norm(
        rgb.astype(np.float32) - background.astype(np.float32),
        axis=2,
    )
    luminance = rgb.mean(axis=2)

    mask = np.full((height, width), cv2.GC_BGD, np.uint8)
    mask[outer > 0] = cv2.GC_PR_FGD
    definite_foreground = (guide > 0) & ((distance > 38.0) | (luminance > 70.0))
    mask[definite_foreground] = cv2.GC_FGD
    likely_background = (outer > 0) & (distance < 12.0) & (luminance < 55.0)
    mask[likely_background] = cv2.GC_PR_BGD

    cv2.setRNGSeed(0)
    cv2.grabCut(
        bgr,
        mask,
        None,
        np.zeros((1, 65)),
        np.zeros((1, 65)),
        8,
        cv2.GC_INIT_WITH_MASK,
    )
    alpha = np.where(
        (mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD),
        255,
        0,
    ).astype(np.uint8)
    alpha = np.where(outer > 0, alpha, 0).astype(np.uint8)

    # Keep only the dominant connected silhouette. For these integrated upright
    # poses a detached blob is background dirt, never a valid gameplay element.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(
        (alpha > 0).astype(np.uint8),
        8,
    )
    if count <= 1:
        raise SystemExit(f"{guide_name} grabcut produced no foreground")
    areas = stats[1:, cv2.CC_STAT_AREA]
    largest = 1 + int(np.argmax(areas))
    alpha = np.where(labels == largest, 255, 0).astype(np.uint8)

    crop[:, :, 3] = alpha
    return Image.fromarray(_clean_transparent_rgb_array(crop), "RGBA")


def _matte(
    source: Image.Image,
    box: tuple[int, int, int, int],
    guide_name: str,
    mode: str,
) -> Image.Image:
    if mode == "polygon":
        return _polygon_matte(source, box, guide_name)
    if mode == "grabcut":
        return _grabcut_matte(source, box, guide_name)
    raise SystemExit(f"unknown matte mode: {mode}")


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
            raw = _matte(
                source,
                tuple(spec["box"]),
                str(spec["guide"]),
                str(spec["matte"]),
            )
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
                    "matte": spec["matte"],
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
            "missing jump/fall/land/directional/crouch-walk/death coverage",
            "death is intentionally excluded until action-specific geometry exists",
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
