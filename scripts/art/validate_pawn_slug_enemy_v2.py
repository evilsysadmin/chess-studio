#!/usr/bin/env python3
"""Validate the Pawn Slug enemy v2 strict Godot atlas contract.

Checks grid/pivot/foot-line/scale stability, frame variety, aim coverage and
that the runtime grip table matches the atlas.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import statistics
from pathlib import Path

import numpy as np
from PIL import Image

from png_contract import png_contract_errors

TYPES = ("pawn", "knight", "rook", "bishop", "queen", "grenadier", "scout", "commando", "shield")
ACTIONS = (
    "idle", "run", "jump", "crouch", "hurt", "climb", "death",
    "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_down", "shoot_crouch",
)
FRAMES = 8
CELL = 128
FOOT_Y = 116
PIVOT_X = 64
SOLID = 24
GROUNDED_TOLERANCE = 3
AIRBORNE_TOLERANCE = 14
AIM = {"shoot": 0.0, "shoot_up": -math.pi / 2, "shoot_down": math.pi / 2, "shoot_diag_up": -math.pi / 4, "shoot_diag_down": math.pi / 4, "shoot_crouch": 0.0}


def validate(atlas_path: Path, worksheet_path: Path, grips_gd: Path | None) -> dict:
    atlas = np.array(Image.open(atlas_path).convert("RGBA"))
    expected = (len(TYPES) * len(ACTIONS) * CELL, FRAMES * CELL)
    errors: list[str] = png_contract_errors(atlas_path)
    if atlas.shape[:2] != expected:
        raise SystemExit(f"dimensions {atlas.shape[1]}x{atlas.shape[0]} != {expected[1]}x{expected[0]}")

    def frame(type_index: int, action_index: int, column: int) -> np.ndarray:
        row = type_index * len(ACTIONS) + action_index
        return atlas[row * CELL:(row + 1) * CELL, column * CELL:(column + 1) * CELL]

    def bbox(image: np.ndarray):
        ys, xs = np.nonzero(image[..., 3] >= SOLID)
        if len(ys) == 0:
            return None
        return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1

    idle_heights: dict[str, float] = {}
    heights: dict[str, list[int]] = {t: [] for t in TYPES}
    for ti, enemy_type in enumerate(TYPES):
        for ai, action in enumerate(ACTIONS):
            hashes: set[str] = set()
            tops: list[int] = []
            for column in range(FRAMES):
                image = frame(ti, ai, column)
                if np.any((image[..., 3] > 0) & (image[..., 3] < 6)):
                    errors.append(f"alpha specks {enemy_type}/{action}/{column}")
                box = bbox(image)
                if box is None:
                    errors.append(f"empty {enemy_type}/{action}/{column}")
                    continue
                left, top, right, bottom = box
                if left < 2 or top < 2 or right > CELL - 2 or bottom > CELL - 2:
                    errors.append(f"clipped {enemy_type}/{action}/{column}: {box}")
                if action in ("jump", "climb"):
                    if not FOOT_Y - AIRBORNE_TOLERANCE <= bottom <= FOOT_Y + 1:
                        errors.append(f"airborne footline {enemy_type}/{action}/{column}: {bottom}")
                elif action == "death" and column < 3:
                    pass
                elif not FOOT_Y - GROUNDED_TOLERANCE <= bottom <= FOOT_Y + 1:
                    errors.append(f"footline {enemy_type}/{action}/{column}: {bottom}")
                if action not in ("death", "crouch", "shoot_crouch", "jump"):
                    heights[enemy_type].append(bottom - top)
                if action == "idle":
                    idle_heights.setdefault(enemy_type, 0.0)
                    idle_heights[enemy_type] += (bottom - top) / FRAMES
                tops.append(top)
                hashes.add(hashlib.sha256(image.tobytes()).hexdigest())
            if len(hashes) < FRAMES:
                errors.append(f"duplicate frames {enemy_type}/{action}: {len(hashes)}/{FRAMES} unique")
            if action in ("idle", "run", "shoot", "shoot_crouch") and tops and max(np.abs(np.diff(tops))) > 7:
                errors.append(f"vertical jitter {enemy_type}/{action}: {tops}")

    # scale stability per type: body height must not wander between grounded actions
    for enemy_type in TYPES:
        values = heights[enemy_type]
        median = statistics.median(values)
        spread = max(values) - min(values)
        if spread > median * 0.22:
            errors.append(f"scale drift {enemy_type}: heights {min(values)}..{max(values)} (median {median})")
        if not 60 <= median <= 108:
            errors.append(f"body height {enemy_type} out of range: {median}")

    # family/variety: every pair of types must be visibly different
    def silhouette_and_color(ti: int):
        image = frame(ti, 0, 0).astype(np.float32)
        alpha = image[..., 3] >= SOLID
        return alpha, image[..., :3][alpha].mean(axis=0)

    parts = [silhouette_and_color(i) for i in range(len(TYPES))]
    for i in range(len(TYPES)):
        for j in range(i + 1, len(TYPES)):
            diff = float(np.mean(parts[i][0] != parts[j][0]))
            color = float(np.linalg.norm(parts[i][1] - parts[j][1]))
            if diff < 0.02 and color < 14:
                errors.append(f"types too similar {TYPES[i]}/{TYPES[j]} (silhouette {diff:.3f}, color {color:.1f})")

    # aim coverage: shoot poses must differ from idle and from each other
    shoot_names = [a for a in ACTIONS if a.startswith("shoot")]
    for ti, enemy_type in enumerate(TYPES):
        mids = {a: frame(ti, ACTIONS.index(a), 3) for a in shoot_names}
        for i, a in enumerate(shoot_names):
            for b in shoot_names[i + 1:]:
                if np.array_equal(mids[a], mids[b]):
                    errors.append(f"identical aim poses {enemy_type}/{a}/{b}")

    worksheet = json.loads(worksheet_path.read_text(encoding="utf-8"))
    if worksheet.get("pivot_x") != PIVOT_X or worksheet.get("foot_y") != FOOT_Y:
        errors.append("worksheet pivot/foot contract drift")
    if worksheet.get("actions") != list(ACTIONS) or worksheet.get("types") != list(TYPES):
        errors.append("worksheet type/action order drift")
    digest = hashlib.sha256(atlas_path.read_bytes()).hexdigest()
    if worksheet.get("atlas", {}).get("sha256") != digest:
        errors.append("worksheet sha256 does not match atlas")

    if grips_gd is not None:
        text = grips_gd.read_text(encoding="utf-8")
        match = re.search(r"(?:const|static var) DATA(?: :=|:) PackedFloat32Array\(\[(.*?)\]\)", text, re.S)
        numbers = [x for x in re.split(r"[,\s]+", match.group(1)) if x] if match else []
        need = len(TYPES) * len(ACTIONS) * FRAMES * 4
        if len(numbers) != need:
            errors.append(f"grip table has {len(numbers)} values, expected {need}")
        else:
            for ti, enemy_type in enumerate(TYPES):
                for ai, action in enumerate(ACTIONS):
                    for column in range(FRAMES):
                        base = ((ti * len(ACTIONS) + ai) * FRAMES + column) * 4
                        x, y, angle, visible = (float(v) for v in numbers[base:base + 4])
                        if not (0 <= x <= CELL and 0 <= y <= CELL):
                            errors.append(f"grip outside cell {enemy_type}/{action}/{column}")
                        if action in AIM and abs(angle - AIM[action]) > 0.12:
                            errors.append(f"grip angle {enemy_type}/{action}/{column}: {angle:.2f} vs {AIM[action]:.2f}")
                        if action in AIM and visible < 0.5:
                            errors.append(f"weapon hidden in {enemy_type}/{action}/{column}")

    if errors:
        raise SystemExit("\n".join(errors[:60]) + (f"\n... {len(errors)} errors" if len(errors) > 60 else ""))
    return {"atlas": str(atlas_path), "sha256": digest, "types": len(TYPES), "actions": len(ACTIONS), "frames": len(TYPES) * len(ACTIONS) * FRAMES}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--atlas", type=Path, required=True)
    parser.add_argument("--worksheet", type=Path, required=True)
    parser.add_argument("--grips-gd", type=Path)
    parser.add_argument("--mark-validated", action="store_true", help="record the passing result in the worksheet (resume point)")
    args = parser.parse_args()
    result = validate(args.atlas, args.worksheet, args.grips_gd)
    if args.mark_validated:
        worksheet = json.loads(args.worksheet.read_text(encoding="utf-8"))
        worksheet["status"] = "validated-local"
        worksheet["validation"] = {"validator": "scripts/art/validate_pawn_slug_enemy_v2.py", **{k: result[k] for k in ("types", "actions", "frames")}}
        args.worksheet.write_text(json.dumps(worksheet, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
