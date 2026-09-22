#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

CELL = 416
COLS = 8
ROWS = 18
SIZE = (CELL * COLS, CELL * ROWS)
ALPHA_THRESHOLD = 24
EXPECTED_FOOT = 382
FOOT_TOLERANCE = 2

PARITY_ROWS = {
    0: "idle",
    1: "walk",
    2: "run",
    6: "crouch",
    7: "crouch_walk",
}

# Rear/core band: deliberately avoids most forward weapon geometry and catches
# perceptual body-volume changes that a full-atlas bbox cannot see.
CORE_X0 = 90
CORE_X1 = 220
CORE_MEDIAN_RATIO_MIN = 0.80
CORE_MEDIAN_RATIO_MAX = 1.30
CORE_FRAME_RATIO_MIN = 0.58
CORE_FRAME_RATIO_MAX = 1.60

# Semantic body pixels explicitly remove skin, weapon and fire. This is the
# cross-weapon scale authority; unlike whole-alpha area it cannot be inflated
# by a launcher or long barrel.
BODY_AREA_MEDIAN_RATIO_MIN = 0.78
BODY_AREA_MEDIAN_RATIO_MAX = 1.28
BODY_AREA_FRAME_RATIO_MIN = 0.58
BODY_AREA_FRAME_RATIO_MAX = 1.55

# Upper envelope catches "same outer height, smaller Matthias": a hat/weapon can
# keep the total bbox canonical while head/body mass shrinks.
UPPER_X0 = 100
UPPER_X1 = 300
UPPER_FRACTION = 0.40
UPPER_WIDTH_RATIO_MIN = 0.90
UPPER_WIDTH_RATIO_MAX = 1.18
UPPER_AREA_RATIO_MIN = 0.60
UPPER_AREA_RATIO_MAX = 1.45

IDLE_BODY_MAX_MIN_RATIO = 1.18

# Distant detached material is almost always worksheet labels, matte scraps or
# accidental debris. Nearby disconnected details are allowed; firing FX has one
# explicit forward-only exception.
ORPHAN_MIN_AREA = 12
ORPHAN_MAX_GAP_PX = 10.0
SHOOT_ROWS = set(range(8, 15))
FORWARD_FX_X_MIN = 260

WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")


def alpha_mask(image: Image.Image) -> np.ndarray:
    return np.array(image.convert("RGBA"))[:, :, 3] >= ALPHA_THRESHOLD


def frame(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop(
        (col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL)
    ).convert("RGBA")


def bbox_from_mask(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(mask)
    if not len(xs):
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def connected_components(image: Image.Image) -> list[dict]:
    mask = alpha_mask(image).astype(np.uint8)
    count, _labels, stats, centroids = cv2.connectedComponentsWithStats(mask, 8)
    out = []
    for index in range(1, count):
        x, y, width, height, area = (int(value) for value in stats[index])
        out.append(
            {
                "area": area,
                "bbox": [x, y, x + width, y + height],
                "centroid": [
                    float(centroids[index][0]),
                    float(centroids[index][1]),
                ],
            }
        )
    out.sort(key=lambda component: component["area"], reverse=True)
    return out


def bbox_gap(a: list[int], b: list[int]) -> float:
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    dx = max(bx0 - ax1, ax0 - bx1, 0)
    dy = max(by0 - ay1, ay0 - by1, 0)
    return float((dx * dx + dy * dy) ** 0.5)


def semantic_masks(image: Image.Image) -> tuple[np.ndarray, np.ndarray]:
    rgba = np.array(image.convert("RGBA"))
    alpha = rgba[..., 3]
    rgb = rgba[..., :3].astype(np.float32)
    r, g, b = [rgb[..., index] for index in range(3)]
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b

    skin = (
        (alpha > 32)
        & (r > 125)
        & (g > 55)
        & (g < r * 0.90)
        & (b < r * 0.74)
        & (b < 170)
    )
    weapon = (
        (alpha > 32)
        & (luma > 18)
        & (luma < 150)
        & (g > r * 0.68)
        & (g > b * 1.04)
        & ((g - b) > 3)
    )
    fire = (
        (alpha > 32)
        & (r > 175)
        & (g > 70)
        & (b < 90)
        & ((r - g) > 45)
    )
    body = (
        (alpha > 40)
        & (~skin)
        & (~weapon)
        & (~fire)
        & (r < 120)
        & (g < 125)
        & (b < 130)
    )
    return skin, body


def body_area(image: Image.Image) -> int:
    _skin, body = semantic_masks(image)
    return int(body.sum())


def core_metrics(image: Image.Image) -> dict | None:
    mask = alpha_mask(image)[:, CORE_X0:CORE_X1]
    box = bbox_from_mask(mask)
    if box is None:
        return None
    _x0, y0, _x1, y1 = box
    return {"area": int(mask.sum()), "height": int(y1 - y0)}


def upper_metrics(
    reference: Image.Image,
    candidate: Image.Image,
) -> tuple[dict | None, dict | None]:
    ref_components = connected_components(reference)
    if not ref_components:
        return None, None
    _left, top, _right, bottom = ref_components[0]["bbox"]
    upper_bottom = max(
        top + 1,
        int(round(top + (bottom - top) * UPPER_FRACTION)),
    )

    def measure(image: Image.Image) -> dict | None:
        mask = alpha_mask(image)[top:upper_bottom, UPPER_X0:UPPER_X1]
        box = bbox_from_mask(mask)
        if box is None:
            return None
        x0, y0, x1, y1 = box
        return {
            "area": int(mask.sum()),
            "width": int(x1 - x0),
            "height": int(y1 - y0),
        }

    return measure(reference), measure(candidate)


def footline(image: Image.Image) -> int | None:
    box = bbox_from_mask(alpha_mask(image))
    return None if box is None else box[3]


def detached_violations(image: Image.Image, row: int) -> list[dict]:
    components = connected_components(image)
    if len(components) < 2:
        return []
    main = components[0]
    violations = []
    for component in components[1:]:
        if component["area"] < ORPHAN_MIN_AREA:
            continue
        gap = bbox_gap(main["bbox"], component["bbox"])
        if gap <= ORPHAN_MAX_GAP_PX:
            continue
        if row in SHOOT_ROWS and component["bbox"][0] >= FORWARD_FX_X_MIN:
            continue
        violations.append({**component, "gap": round(gap, 2)})
    return violations


def ratio(numerator: float, denominator: float) -> float:
    return numerator / denominator if denominator else 0.0


def validate_family(atlases: dict[str, Image.Image]) -> dict:
    errors: list[str] = []
    weapons: dict[str, dict] = {}

    for weapon, atlas in atlases.items():
        if atlas.size != SIZE:
            errors.append(f"{weapon}: atlas size {atlas.size} != {SIZE}")

    pistol = atlases["pistol"]
    for weapon, atlas in atlases.items():
        report = {
            "parity": {},
            "idle_body_max_min_ratio": None,
            "distant_orphans": [],
            "footline_errors": [],
        }
        weapons[weapon] = report

        for row in range(ROWS):
            for col in range(COLS):
                image = frame(atlas, row, col)
                foot = footline(image)
                if foot is None:
                    report["footline_errors"].append(
                        {"row": row, "frame": col, "foot": None}
                    )
                    continue
                if abs(foot - EXPECTED_FOOT) > FOOT_TOLERANCE:
                    report["footline_errors"].append(
                        {"row": row, "frame": col, "foot": foot}
                    )
                hits = detached_violations(image, row)
                if hits:
                    report["distant_orphans"].append(
                        {"row": row, "frame": col, "components": hits}
                    )

        if weapon != "pistol":
            for row, action in PARITY_ROWS.items():
                core_ratios: list[float] = []
                body_ratios: list[float] = []
                upper_width_ratios: list[float] = []
                upper_area_ratios: list[float] = []
                for col in range(COLS):
                    reference = frame(pistol, row, col)
                    candidate = frame(atlas, row, col)
                    ref_core = core_metrics(reference)
                    candidate_core = core_metrics(candidate)
                    ref_upper, candidate_upper = upper_metrics(reference, candidate)
                    if (
                        not ref_core
                        or not candidate_core
                        or not ref_upper
                        or not candidate_upper
                    ):
                        errors.append(
                            f"{weapon}:{action}:{col}: missing perceptual metrics"
                        )
                        continue
                    core_ratios.append(
                        ratio(candidate_core["area"], ref_core["area"])
                    )
                    ref_body_area = body_area(reference)
                    candidate_body_area = body_area(candidate)
                    body_ratios.append(ratio(candidate_body_area, ref_body_area))
                    upper_width_ratios.append(
                        ratio(candidate_upper["width"], ref_upper["width"])
                    )
                    upper_area_ratios.append(
                        ratio(candidate_upper["area"], ref_upper["area"])
                    )

                if not core_ratios:
                    continue
                core_median = statistics.median(core_ratios)
                body_median = statistics.median(body_ratios)
                width_median = statistics.median(upper_width_ratios)
                area_median = statistics.median(upper_area_ratios)
                report["parity"][action] = {
                    "core_area_median_ratio": round(core_median, 4),
                    "core_area_min_ratio": round(min(core_ratios), 4),
                    "core_area_max_ratio": round(max(core_ratios), 4),
                    "body_area_median_ratio": round(body_median, 4),
                    "body_area_min_ratio": round(min(body_ratios), 4),
                    "body_area_max_ratio": round(max(body_ratios), 4),
                    "upper_width_median_ratio": round(width_median, 4),
                    "upper_area_diagnostic_ratio": round(area_median, 4),
                }
                if not BODY_AREA_MEDIAN_RATIO_MIN <= body_median <= BODY_AREA_MEDIAN_RATIO_MAX:
                    errors.append(
                        f"{weapon}:{action}: body area median ratio={body_median:.4f}"
                    )
                if (
                    min(body_ratios) < BODY_AREA_FRAME_RATIO_MIN
                    or max(body_ratios) > BODY_AREA_FRAME_RATIO_MAX
                ):
                    errors.append(
                        f"{weapon}:{action}: body area frame range="
                        f"{min(body_ratios):.4f}..{max(body_ratios):.4f}"
                    )
                if not UPPER_WIDTH_RATIO_MIN <= width_median <= UPPER_WIDTH_RATIO_MAX:
                    errors.append(
                        f"{weapon}:{action}: upper width ratio={width_median:.4f}"
                    )

            idle_values = [
                body_area(frame(atlas, 0, col))
                for col in range(COLS)
            ]
            idle_spread = max(idle_values) / min(idle_values)
            report["idle_body_max_min_ratio"] = round(idle_spread, 4)
            if idle_spread > IDLE_BODY_MAX_MIN_RATIO:
                errors.append(
                    f"{weapon}:idle body jitter={idle_spread:.4f}"
                )

        if report["footline_errors"]:
            errors.append(
                f"{weapon}: footline errors={report['footline_errors'][:4]}"
            )
        if report["distant_orphans"]:
            errors.append(
                f"{weapon}: distant orphans={report['distant_orphans'][:4]}"
            )

    return {
        "ok": not errors,
        "errors": errors,
        "contract": {
            "cell": CELL,
            "grid": [COLS, ROWS],
            "alpha_threshold": ALPHA_THRESHOLD,
            "expected_foot": EXPECTED_FOOT,
            "parity_rows": PARITY_ROWS,
            "core_x": [CORE_X0, CORE_X1],
            "core_median_ratio": [
                CORE_MEDIAN_RATIO_MIN,
                CORE_MEDIAN_RATIO_MAX,
            ],
            "core_frame_ratio": [
                CORE_FRAME_RATIO_MIN,
                CORE_FRAME_RATIO_MAX,
            ],
            "upper_x": [UPPER_X0, UPPER_X1],
            "upper_width_ratio": [
                UPPER_WIDTH_RATIO_MIN,
                UPPER_WIDTH_RATIO_MAX,
            ],
            "body_area_median_ratio": [
                BODY_AREA_MEDIAN_RATIO_MIN,
                BODY_AREA_MEDIAN_RATIO_MAX,
            ],
            "body_area_frame_ratio": [
                BODY_AREA_FRAME_RATIO_MIN,
                BODY_AREA_FRAME_RATIO_MAX,
            ],
            "upper_area_ratio_diagnostic_only": [
                UPPER_AREA_RATIO_MIN,
                UPPER_AREA_RATIO_MAX,
            ],
            "idle_body_max_min_ratio": IDLE_BODY_MAX_MIN_RATIO,
            "orphan_min_area": ORPHAN_MIN_AREA,
            "orphan_max_gap_px": ORPHAN_MAX_GAP_PX,
        },
        "weapons": weapons,
    }


def self_test() -> None:
    def synthetic(scale: float = 1.0, footer: bool = False) -> Image.Image:
        image = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
        width = round(112 * scale)
        height = round(220 * scale)
        left = 190 - width // 2
        top = EXPECTED_FOOT - height
        array = np.array(image)
        array[top:EXPECTED_FOOT, left:left + width] = (80, 90, 100, 255)
        if footer:
            array[400:405, 195:210] = (255, 255, 255, 255)
        return Image.fromarray(array, "RGBA")

    reference = synthetic()
    small = synthetic(0.75)
    assert (
        ratio(core_metrics(small)["area"], core_metrics(reference)["area"])
        < CORE_MEDIAN_RATIO_MIN
    )
    assert ratio(body_area(small), body_area(reference)) < BODY_AREA_MEDIAN_RATIO_MIN
    assert not detached_violations(reference, 0)
    assert detached_violations(synthetic(1.0, footer=True), 0)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pistol", type=Path)
    parser.add_argument("--machinegun", type=Path)
    parser.add_argument("--shotgun", type=Path)
    parser.add_argument("--panzerfaust", type=Path)
    parser.add_argument("--report", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        print("OK Matthias family perceptual self-test")
        return

    required = {weapon: getattr(args, weapon) for weapon in WEAPONS}
    missing = [weapon for weapon, path in required.items() if path is None]
    if missing or args.report is None:
        parser.error(
            "family validation requires all four weapon atlases and --report"
        )

    atlases = {
        weapon: Image.open(path).convert("RGBA")
        for weapon, path in required.items()
    }
    result = validate_family(atlases)
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {"ok": result["ok"], "errors": result["errors"][:8]},
            sort_keys=True,
        )
    )
    if not result["ok"]:
        raise SystemExit("\n".join(result["errors"]))


if __name__ == "__main__":
    main()
