#!/usr/bin/env python3
"""Fail closed on Matthias weapon-bank scale/placement discontinuities."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import statistics
import tempfile
import time
import urllib.parse
import urllib.request
from collections import deque
from pathlib import Path

from PIL import Image

CELL = 416
IDLE_COLUMNS = 8
ALPHA_THRESHOLD = 8
WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
IDLE_WIDTH_RATIO = (0.90, 1.20)
IDLE_HEIGHT_RATIO = (0.92, 1.10)
RUN_WIDTH_RATIO = (0.96, 1.20)
RUN_HEIGHT_RATIO = (0.96, 1.05)
FOOT_TOLERANCE_PX = 1.0
CENTER_TOLERANCE_PX = 6.0
AIR_CENTER_TOLERANCE_PX = 10.0
AIR_HEIGHT_RATIO = (0.90, 1.10)
LOWER_BODY_START_FRACTION = 0.55
RUN_LEG_START_FRACTION = 0.70
LOWER_BODY_ALPHA_MIN_RATIO = 0.90
LOWER_BODY_INTERIOR_ALPHA_MIN_RATIO = 0.94
LOWER_BODY_SEMI_ALPHA_MAX_DELTA = 0.12
LOWER_BODY_OPAQUE_FRACTION_MAX_DELTA = 0.06
LOWER_BODY_SIGNATURE_SIZE = (96, 64)
LOWER_BODY_SIGNATURE_THRESHOLD = 64
RUN_LOWER_BODY_MEDIAN_DELTA_MIN = 0.07
RUN_LOWER_BODY_MAX_DELTA_MIN = 0.15
RUN_SOURCE_MIN_DIFF = 0.025
RUN_SOURCE_RELATIVE_GAIN = 1.08
RUN_SOURCE_MIN_SCORE = 0.045
RUN_UNIQUE_PHASES_MIN = 6
AIR_ACTION_ROWS = {"jump": 3, "fall": 4, "land": 5}
AIRBORNE_FAIL_CLOSED_WEAPONS = ("machinegun",)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path)
    parser.add_argument("--sprite-smoke-dir", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    return parser.parse_args()


def dict_block(text: str, name: str) -> str:
    match = re.search(
        rf"const\s+{re.escape(name)}\s*:=\s*\{{(?P<body>.*?)\n\s*\}}",
        text,
        re.S,
    )
    if not match:
        raise ValueError(f"missing GDScript dictionary: {name}")
    return match.group("body")


def parse_string_dict(text: str, name: str) -> dict[str, str]:
    body = dict_block(text, name)
    values = dict(
        re.findall(
            r'^\s*"([a-z0-9_-]+)"\s*:\s*"([^"]+)"\s*,?\s*$',
            body,
            re.M | re.I,
        )
    )
    missing = sorted(set(WEAPONS) - values.keys())
    if missing:
        raise ValueError(f"{name} missing weapons: {', '.join(missing)}")
    return values


def parse_int_dict(text: str, name: str) -> dict[str, int]:
    body = dict_block(text, name)
    values = {
        key: int(value)
        for key, value in re.findall(
            r'^\s*"([a-z0-9_-]+)"\s*:\s*(\d+)\s*,?\s*$',
            body,
            re.M | re.I,
        )
    }
    missing = sorted(set(WEAPONS) - values.keys())
    if missing:
        raise ValueError(f"{name} missing weapons: {', '.join(missing)}")
    return values


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
                }
            )
    found.sort(key=lambda item: int(item["area"]), reverse=True)
    return found


def frame_metrics(image: Image.Image, label: str) -> dict:
    found = components(image)
    if not found:
        raise ValueError(f"{label}: empty frame")
    primary = found[0]
    left, top, right, bottom = primary["bbox"]
    return {
        "bbox": list(primary["bbox"]),
        "width": right - left,
        "height": bottom - top,
        "footY": bottom,
        "centerX": (left + right) / 2.0,
        "componentCount": len(found),
        "detachedAreas": [int(item["area"]) for item in found[1:]],
    }


def lower_body_alpha_metrics(image: Image.Image, label: str) -> dict:
    rgba = image.convert("RGBA")
    found = components(rgba)
    if not found:
        raise ValueError(f"{label}: empty frame")
    left, top, right, bottom = found[0]["bbox"]
    start_y = top + max(1, int((bottom - top) * LOWER_BODY_START_FRACTION))
    alpha = rgba.getchannel("A")
    values = [
        int(alpha.getpixel((x, y)))
        for y in range(start_y, bottom)
        for x in range(left, right)
        if alpha.getpixel((x, y)) >= ALPHA_THRESHOLD
    ]
    if not values:
        raise ValueError(f"{label}: lower body has no opaque mass")
    semi = sum(value < 200 for value in values) / len(values)
    opaque = sum(value >= 224 for value in values) / len(values)
    pix = alpha.load()
    interior_values = []
    for y in range(start_y + 1, bottom - 1):
        for x in range(left + 1, right - 1):
            value = int(pix[x, y])
            if value < ALPHA_THRESHOLD:
                continue
            if (
                pix[x - 1, y] >= ALPHA_THRESHOLD
                and pix[x + 1, y] >= ALPHA_THRESHOLD
                and pix[x, y - 1] >= ALPHA_THRESHOLD
                and pix[x, y + 1] >= ALPHA_THRESHOLD
            ):
                interior_values.append(value)
    if not interior_values:
        interior_values = values
    return {
        "meanAlpha": sum(values) / len(values),
        "interiorMeanAlpha": sum(interior_values) / len(interior_values),
        "semiTransparentFraction": semi,
        "opaqueFraction": opaque,
    }


def lower_body_signature(image: Image.Image, label: str) -> bytes:
    rgba = image.convert("RGBA")
    found = components(rgba)
    if not found:
        raise ValueError(f"{label}: empty frame")
    left, top, right, bottom = found[0]["bbox"]
    start_y = top + max(1, int((bottom - top) * RUN_LEG_START_FRACTION))
    alpha = rgba.getchannel("A").crop((left, start_y, right, bottom))
    if alpha.getbbox() is None:
        raise ValueError(f"{label}: lower body has no silhouette")
    normalized = alpha.resize(LOWER_BODY_SIGNATURE_SIZE, Image.Resampling.NEAREST)
    return bytes(
        1 if int(value) >= LOWER_BODY_SIGNATURE_THRESHOLD else 0
        for value in normalized.get_flattened_data()
    )


def signature_delta(left: bytes, right: bytes) -> float:
    if len(left) != len(right):
        raise ValueError("lower-body signatures have different sizes")
    union = sum(1 for a, b in zip(left, right) if a or b)
    if union == 0:
        return 0.0
    changed = sum(1 for a, b in zip(left, right) if a != b)
    return changed / union


def validate_lower_body_motion(frames: list[dict], label: str) -> dict:
    signatures = [frame["_lowerBodySignature"] for frame in frames]
    if len(signatures) < 2:
        raise ValueError(f"{label}: not enough frames for locomotion QA")
    deltas = [
        signature_delta(signatures[index], signatures[(index + 1) % len(signatures)])
        for index in range(len(signatures))
    ]
    median_delta = float(statistics.median(deltas))
    max_delta = float(max(deltas))
    if median_delta < RUN_LOWER_BODY_MEDIAN_DELTA_MIN:
        raise ValueError(
            f"{label}: lower body is effectively frozen; median silhouette delta "
            f"{median_delta:.4f} < {RUN_LOWER_BODY_MEDIAN_DELTA_MIN:.4f}"
        )
    if max_delta < RUN_LOWER_BODY_MAX_DELTA_MIN:
        raise ValueError(
            f"{label}: no meaningful stride phase; max silhouette delta "
            f"{max_delta:.4f} < {RUN_LOWER_BODY_MAX_DELTA_MIN:.4f}"
        )
    return {
        "medianDelta": round(median_delta, 6),
        "maxDelta": round(max_delta, 6),
        "deltas": [round(value, 6) for value in deltas],
    }


def unique_lower_body_phases(frames: list[dict], threshold: float = 0.04) -> int:
    representatives: list[bytes] = []
    for frame in frames:
        signature = frame["_lowerBodySignature"]
        if all(signature_delta(signature, known) >= threshold for known in representatives):
            representatives.append(signature)
    return len(representatives)


def raw_lower_body_motion_score(images: list[Image.Image]) -> float:
    if len(images) <= 1:
        return 0.0
    changed = 0
    sampled = 0
    y_start = int(round(CELL * 0.55))
    y_end = CELL - 12
    x_start = 18
    x_end = CELL - 18
    step = 6
    for index in range(1, len(images)):
        previous = images[index - 1].convert("RGBA")
        current = images[index].convert("RGBA")
        for y in range(y_start, y_end, step):
            for x in range(x_start, x_end, step):
                left = previous.getpixel((x, y))
                right = current.getpixel((x, y))
                if max(left[3], right[3]) <= 26:
                    continue
                pixel_diff = sum(abs(a - b) for a, b in zip(left, right)) / 255.0
                if pixel_diff >= 0.20:
                    changed += 1
                sampled += 1
    return changed / sampled if sampled else 0.0


def min_ratio(
    value: float,
    reference: float,
    minimum: float,
    label: str,
) -> float:
    if reference <= 0:
        raise ValueError(f"{label}: invalid reference {reference}")
    ratio = value / reference
    if ratio < minimum:
        raise ValueError(
            f"{label}: ratio {ratio:.4f} below minimum {minimum:.2f}"
        )
    return ratio


def ratio_in(
    value: float,
    reference: float,
    bounds: tuple[float, float],
    label: str,
) -> float:
    if reference <= 0:
        raise ValueError(f"{label}: invalid reference {reference}")
    ratio = value / reference
    if not bounds[0] <= ratio <= bounds[1]:
        raise ValueError(
            f"{label}: ratio {ratio:.4f} outside "
            f"[{bounds[0]:.2f}, {bounds[1]:.2f}]"
        )
    return ratio


def validate_idle(sprite_dir: Path) -> dict:
    metrics: dict[str, list[dict]] = {}
    violations: list[str] = []
    for weapon in WEAPONS:
        frames: list[dict] = []
        for col in range(IDLE_COLUMNS):
            path = (
                sprite_dir
                / weapon
                / "frames"
                / f"matthias_{weapon}_r00_c{col:02d}.png"
            )
            if not path.is_file():
                raise ValueError(f"missing exported idle frame: {path}")
            image = Image.open(path).convert("RGBA")
            frame = frame_metrics(image, f"{weapon} idle c{col}")
            frame["lowerBodyAlpha"] = lower_body_alpha_metrics(
                image, f"{weapon} idle c{col}"
            )
            if frame["componentCount"] != 1:
                violations.append(
                    f"{weapon} idle c{col}: detached opaque components are "
                    f"forbidden: {frame['detachedAreas']}"
                )
            frames.append(frame)
        metrics[weapon] = frames

    pistol = metrics["pistol"]
    report: dict[str, list[dict]] = {"pistol": pistol}
    for weapon in WEAPONS[1:]:
        validated: list[dict] = []
        for col, frame in enumerate(metrics[weapon]):
            ref = pistol[col]
            try:
                width_ratio = ratio_in(
                    frame["width"],
                    ref["width"],
                    IDLE_WIDTH_RATIO,
                    f"{weapon} idle c{col} width",
                )
            except ValueError as exc:
                violations.append(str(exc))
                width_ratio = float("nan")
            try:
                height_ratio = ratio_in(
                    frame["height"],
                    ref["height"],
                    IDLE_HEIGHT_RATIO,
                    f"{weapon} idle c{col} height",
                )
            except ValueError as exc:
                violations.append(str(exc))
                height_ratio = float("nan")
            if abs(frame["footY"] - ref["footY"]) > FOOT_TOLERANCE_PX:
                violations.append(
                    f"{weapon} idle c{col}: footline drift "
                    f"{frame['footY']} vs {ref['footY']}"
                )
            if abs(frame["centerX"] - ref["centerX"]) > CENTER_TOLERANCE_PX:
                violations.append(
                    f"{weapon} idle c{col}: center drift "
                    f"{frame['centerX']} vs {ref['centerX']}"
                )
            try:
                alpha_ratio = min_ratio(
                    frame["lowerBodyAlpha"]["meanAlpha"],
                    ref["lowerBodyAlpha"]["meanAlpha"],
                    LOWER_BODY_ALPHA_MIN_RATIO,
                    f"{weapon} idle c{col} lower-body alpha",
                )
            except ValueError as exc:
                violations.append(str(exc))
                alpha_ratio = float("nan")
            try:
                interior_alpha_ratio = min_ratio(
                    frame["lowerBodyAlpha"]["interiorMeanAlpha"],
                    ref["lowerBodyAlpha"]["interiorMeanAlpha"],
                    LOWER_BODY_INTERIOR_ALPHA_MIN_RATIO,
                    f"{weapon} idle c{col} lower-body interior alpha",
                )
            except ValueError as exc:
                violations.append(str(exc))
                interior_alpha_ratio = float("nan")
            semi_delta = (
                frame["lowerBodyAlpha"]["semiTransparentFraction"]
                - ref["lowerBodyAlpha"]["semiTransparentFraction"]
            )
            opaque_drop = (
                ref["lowerBodyAlpha"]["opaqueFraction"]
                - frame["lowerBodyAlpha"]["opaqueFraction"]
            )
            if semi_delta > LOWER_BODY_SEMI_ALPHA_MAX_DELTA:
                violations.append(
                    f"{weapon} idle c{col}: lower-body semi-transparent mass "
                    f"drift {semi_delta:.4f} > {LOWER_BODY_SEMI_ALPHA_MAX_DELTA:.4f}"
                )
            if opaque_drop > LOWER_BODY_OPAQUE_FRACTION_MAX_DELTA:
                violations.append(
                    f"{weapon} idle c{col}: lower-body opaque fraction dropped "
                    f"{opaque_drop:.4f} > {LOWER_BODY_OPAQUE_FRACTION_MAX_DELTA:.4f}"
                )
            validated.append(
                {
                    **frame,
                    "widthRatio": round(width_ratio, 6),
                    "heightRatio": round(height_ratio, 6),
                    "lowerBodyAlphaRatio": round(alpha_ratio, 6),
                    "lowerBodyInteriorAlphaRatio": round(interior_alpha_ratio, 6),
                    "lowerBodySemiAlphaDelta": round(semi_delta, 6),
                    "lowerBodyOpaqueDrop": round(opaque_drop, 6),
                }
            )
        report[weapon] = validated
    if violations:
        raise ValueError("idle continuity violations:\n- " + "\n- ".join(violations))
    return report


def validate_airborne(sprite_dir: Path) -> dict:
    by_action: dict[str, dict[str, list[dict]]] = {}
    violations: list[str] = []
    for action, row in AIR_ACTION_ROWS.items():
        by_weapon: dict[str, list[dict]] = {}
        for weapon in WEAPONS:
            frames: list[dict] = []
            for col in range(IDLE_COLUMNS):
                path = (
                    sprite_dir
                    / weapon
                    / "frames"
                    / f"matthias_{weapon}_r{row:02d}_c{col:02d}.png"
                )
                if not path.is_file():
                    raise ValueError(f"missing exported {action} frame: {path}")
                image = Image.open(path).convert("RGBA")
                frame = frame_metrics(image, f"{weapon} {action} c{col}")
                if frame["componentCount"] != 1:
                    violations.append(
                        f"{weapon} {action} c{col}: detached opaque components are "
                        f"forbidden: {frame['detachedAreas']}"
                    )
                frame["lowerBodyAlpha"] = lower_body_alpha_metrics(
                    image, f"{weapon} {action} c{col}"
                )
                frames.append(frame)
            by_weapon[weapon] = frames

        pistol = by_weapon["pistol"]
        report: dict[str, list[dict]] = {"pistol": pistol}
        for weapon in AIRBORNE_FAIL_CLOSED_WEAPONS:
            validated: list[dict] = []
            for col, frame in enumerate(by_weapon[weapon]):
                ref = pistol[col]
                try:
                    height_ratio = ratio_in(
                        frame["height"],
                        ref["height"],
                        AIR_HEIGHT_RATIO,
                        f"{weapon} {action} c{col} height",
                    )
                except ValueError as exc:
                    violations.append(str(exc))
                    height_ratio = float("nan")
                if abs(frame["centerX"] - ref["centerX"]) > AIR_CENTER_TOLERANCE_PX:
                    violations.append(
                        f"{weapon} {action} c{col}: center drift "
                        f"{frame['centerX']} vs {ref['centerX']}"
                    )
                try:
                    alpha_ratio = min_ratio(
                        frame["lowerBodyAlpha"]["meanAlpha"],
                        ref["lowerBodyAlpha"]["meanAlpha"],
                        LOWER_BODY_ALPHA_MIN_RATIO,
                        f"{weapon} {action} c{col} lower-body alpha",
                    )
                except ValueError as exc:
                    violations.append(str(exc))
                    alpha_ratio = float("nan")
                validated.append(
                    {
                        **frame,
                        "heightRatio": round(height_ratio, 6),
                        "lowerBodyAlphaRatio": round(alpha_ratio, 6),
                    }
                )
            report[weapon] = validated
        by_action[action] = report
    if violations:
        raise ValueError(
            "airborne continuity violations:\n- " + "\n- ".join(violations)
        )
    return by_action


def acquire(url: str, temp_dir: Path, label: str) -> Path:
    parsed = urllib.parse.urlparse(url)
    target = temp_dir / (Path(parsed.path).name or f"{label}.png")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "ChessStudio-Matthias-Continuity/1"},
    )
    last_error: Exception | None = None
    for attempt in range(1, 4):
        try:
            with (
                urllib.request.urlopen(request, timeout=25) as response,
                target.open("wb") as stream,
            ):
                shutil.copyfileobj(response, stream)
            return target
        except Exception as exc:
            last_error = exc
            target.unlink(missing_ok=True)
            if attempt < 3:
                time.sleep(attempt)
    raise ValueError(f"{label}: failed to download {url}: {last_error}")


def _runtime_run_row(
    sprite_dir: Path,
    weapon: str,
    row: int,
    label: str,
) -> tuple[list[Image.Image], list[dict]]:
    images: list[Image.Image] = []
    frames: list[dict] = []
    for col in range(IDLE_COLUMNS):
        path = (
            sprite_dir
            / weapon
            / "frames"
            / f"matthias_{weapon}_r{row:02d}_c{col:02d}.png"
        )
        if not path.is_file():
            raise ValueError(f"missing exported {label} frame: {path}")
        image = Image.open(path).convert("RGBA")
        frame = frame_metrics(image, f"{weapon} {label} c{col}")
        frame["_lowerBodySignature"] = lower_body_signature(
            image, f"{weapon} {label} c{col}"
        )
        images.append(image)
        frames.append(frame)
    return images, frames


def validate_run(gdscript: Path, sprite_dir: Path) -> dict:
    text = gdscript.read_text(encoding="utf-8")
    if "const RUN12_RUNTIME_PROMOTION_ENABLED := false" not in text:
        raise ValueError(
            "run12/run13 overlays must stay candidate-only until their "
            "game-scale leg motion beats the full-bank runtime stride"
        )

    by_weapon: dict[str, dict] = {}
    for weapon in WEAPONS:
        walk_images, walk_frames = _runtime_run_row(sprite_dir, weapon, 1, "walk")
        run_images, run_frames = _runtime_run_row(sprite_dir, weapon, 2, "run")
        walk_score = raw_lower_body_motion_score(walk_images)
        run_score = raw_lower_body_motion_score(run_images)
        use_walk = (
            walk_score > run_score + RUN_SOURCE_MIN_DIFF
            and (
                walk_score > run_score * RUN_SOURCE_RELATIVE_GAIN
                or run_score < RUN_SOURCE_MIN_SCORE
            )
        )
        selected = walk_frames if use_walk else run_frames
        selected_source = "walk" if use_walk else "run"
        for col, frame in enumerate(selected):
            if frame["componentCount"] != 1:
                raise ValueError(
                    f"{weapon} selected runtime {selected_source} c{col}: "
                    f"detached opaque components are forbidden: "
                    f"{frame['detachedAreas']}"
                )
        motion = validate_lower_body_motion(
            selected, f"{weapon} selected runtime run"
        )
        unique_phases = unique_lower_body_phases(selected)
        if unique_phases < RUN_UNIQUE_PHASES_MIN:
            raise ValueError(
                f"{weapon} selected runtime run: only {unique_phases} meaningful "
                f"lower-body phases; need >= {RUN_UNIQUE_PHASES_MIN}"
            )
        by_weapon[weapon] = {
            "selectedRow": 1 if use_walk else 2,
            "selectedSource": selected_source,
            "walkRawMotionScore": round(walk_score, 6),
            "runRawMotionScore": round(run_score, 6),
            "lowerBodyMotion": motion,
            "uniqueLowerBodyPhases": unique_phases,
            "medianHeight": float(
                statistics.median(frame["height"] for frame in selected)
            ),
            "medianFootY": float(
                statistics.median(frame["footY"] for frame in selected)
            ),
            "medianCenterX": float(
                statistics.median(frame["centerX"] for frame in selected)
            ),
        }

    pistol = by_weapon["pistol"]
    for weapon in WEAPONS[1:]:
        item = by_weapon[weapon]
        item["heightRatio"] = round(
            ratio_in(
                item["medianHeight"],
                pistol["medianHeight"],
                RUN_HEIGHT_RATIO,
                f"{weapon} selected runtime run median height",
            ),
            6,
        )
        if abs(item["medianFootY"] - pistol["medianFootY"]) > FOOT_TOLERANCE_PX:
            raise ValueError(f"{weapon} selected runtime run: median footline drift")
        if (
            abs(item["medianCenterX"] - pistol["medianCenterX"])
            > CENTER_TOLERANCE_PX
        ):
            raise ValueError(f"{weapon} selected runtime run: median center drift")
    return by_weapon


def self_test() -> None:
    text = """const RUN12_ATLAS_URLS := {
        "pistol": "https://example.invalid/p.png",
        "machinegun": "https://example.invalid/m.png",
        "shotgun": "https://example.invalid/s.png",
        "panzerfaust": "https://example.invalid/z.png",
    }
    const RUN_OVERLAY_COLUMNS := {
        "pistol": 12,
        "machinegun": 13,
        "shotgun": 12,
        "panzerfaust": 12,
    }"""
    assert parse_string_dict(text, "RUN12_ATLAS_URLS")["machinegun"].endswith(
        "m.png"
    )
    assert parse_int_dict(text, "RUN_OVERLAY_COLUMNS")["machinegun"] == 13
    assert ratio_in(96, 100, RUN_WIDTH_RATIO, "lower edge") == 0.96

    try:
        ratio_in(95, 100, RUN_WIDTH_RATIO, "too narrow")
    except ValueError:
        pass
    else:
        raise AssertionError("run width below continuity floor must fail")

    frame = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    for x in range(8, 24):
        for y in range(6, 28):
            frame.putpixel((x, y), (255, 255, 255, 255))
    metrics = frame_metrics(frame, "self-test")
    assert metrics["width"] == 16 and metrics["height"] == 22
    assert metrics["componentCount"] == 1
    solid_alpha = lower_body_alpha_metrics(frame, "solid")

    translucent = frame.copy()
    for x in range(8, 24):
        for y in range(18, 28):
            translucent.putpixel((x, y), (255, 255, 255, 96))
    translucent_alpha = lower_body_alpha_metrics(translucent, "translucent")
    assert translucent_alpha["meanAlpha"] < solid_alpha["meanAlpha"]
    assert (
        translucent_alpha["semiTransparentFraction"]
        > solid_alpha["semiTransparentFraction"]
    )

    moving = []
    for offset in (0, 4, 8, 4):
        image = Image.new("RGBA", (48, 48), (0, 0, 0, 0))
        for x in range(14, 34):
            for y in range(8, 30):
                image.putpixel((x, y), (255, 255, 255, 255))
        for x in range(10 + offset, 18 + offset):
            for y in range(30, 44):
                image.putpixel((x, y), (255, 255, 255, 255))
        moving.append({"_lowerBodySignature": lower_body_signature(image, "moving")})
    validate_lower_body_motion(moving, "moving self-test")
    assert unique_lower_body_phases(moving) >= 3

    frozen = [moving[0], moving[0], moving[0], moving[0]]
    try:
        validate_lower_body_motion(frozen, "frozen self-test")
    except ValueError:
        pass
    else:
        raise AssertionError("frozen run lower body must fail")
    print("Matthias sprite continuity self-test: OK")


def main() -> int:
    cfg = parse_args()
    if cfg.self_test:
        self_test()
        return 0
    if not cfg.gdscript or not cfg.sprite_smoke_dir or not cfg.output:
        raise SystemExit(
            "--gdscript, --sprite-smoke-dir and --output are required"
        )

    report = {
        "schema": 2,
        "scope": "pawn-slug-matthias-runtime-continuity",
        "thresholds": {
            "idleWidthRatio": IDLE_WIDTH_RATIO,
            "idleHeightRatio": IDLE_HEIGHT_RATIO,
            "runWidthRatio": RUN_WIDTH_RATIO,
            "runHeightRatio": RUN_HEIGHT_RATIO,
            "footTolerancePx": FOOT_TOLERANCE_PX,
            "centerTolerancePx": CENTER_TOLERANCE_PX,
            "airCenterTolerancePx": AIR_CENTER_TOLERANCE_PX,
            "airHeightRatio": AIR_HEIGHT_RATIO,
            "lowerBodyAlphaMinRatio": LOWER_BODY_ALPHA_MIN_RATIO,
            "lowerBodyInteriorAlphaMinRatio": LOWER_BODY_INTERIOR_ALPHA_MIN_RATIO,
            "lowerBodySemiAlphaMaxDelta": LOWER_BODY_SEMI_ALPHA_MAX_DELTA,
            "lowerBodyOpaqueFractionMaxDelta": LOWER_BODY_OPAQUE_FRACTION_MAX_DELTA,
            "runLowerBodyMedianDeltaMin": RUN_LOWER_BODY_MEDIAN_DELTA_MIN,
            "runLowerBodyMaxDeltaMin": RUN_LOWER_BODY_MAX_DELTA_MIN,
            "runSourceMinDiff": RUN_SOURCE_MIN_DIFF,
            "runSourceRelativeGain": RUN_SOURCE_RELATIVE_GAIN,
            "runSourceMinScore": RUN_SOURCE_MIN_SCORE,
            "runUniquePhasesMin": RUN_UNIQUE_PHASES_MIN,
            "airborneFailClosedWeapons": AIRBORNE_FAIL_CLOSED_WEAPONS,
        },
    }
    failures: list[str] = []
    for label, check in (
        ("idle", lambda: validate_idle(cfg.sprite_smoke_dir)),
        ("airborne", lambda: validate_airborne(cfg.sprite_smoke_dir)),
        ("run", lambda: validate_run(cfg.gdscript, cfg.sprite_smoke_dir)),
    ):
        try:
            report[label] = check()
        except ValueError as exc:
            failures.append(f"{label}: {exc}")
            report[label] = {"ok": False, "error": str(exc)}
    cfg.output.parent.mkdir(parents=True, exist_ok=True)
    cfg.output.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    if failures:
        raise ValueError(
            "Matthias continuity gate failed:\n- " + "\n- ".join(failures)
        )
    print(
        "OK Matthias continuity gate: idle opacity + airborne scale + run "
        "lower-body motion stay inside canonical envelope"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
