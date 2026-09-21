#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

from sprite_forge import TemporalContract, build_bank, validate_sequence

CELL = 416
PART = "core"
ACTIONS = (
    ("walk", 4, 12.0, True),
    ("run", 4, 16.0, True),
    ("shoot", 1, 18.0, False),
    ("crouch", 1, 8.0, True),
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _load_frames(root: Path, action: str, count: int) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for index in range(count):
        path = root / action / f"{index:03d}.png"
        if not path.is_file():
            raise SystemExit(f"missing normalized seed frame: {path}")
        image = Image.open(path).convert("RGBA")
        if image.size != (CELL, CELL):
            raise SystemExit(f"bad normalized seed size {image.size}: {path}")
        frames.append(image)
    return frames


def _validate_temporal(root: Path) -> dict[str, dict]:
    results: dict[str, dict] = {}
    for action, count, _fps, loop in ACTIONS:
        frames = _load_frames(root, action, count)
        result = validate_sequence(
            frames,
            TemporalContract(
                expected_frames=count,
                max_foot_delta_px=3.0,
                max_centroid_delta_px=18.0,
                max_height_delta_px=4.0,
                # Canonical v1 run seam measures 35 px between the two extreme\n                # stride silhouettes. Keep one pixel of deterministic headroom;\n                # larger width jumps remain a hard failure.\n                max_width_delta_px=36.0,
                max_area_ratio_delta=0.24,
                loop=loop,
            ),
        )
        if not result.ok:
            raise SystemExit(
                f"{action} temporal QA failed: {','.join(result.errors)}"
            )
        results[action] = {
            "frame_count": result.frame_count,
            "unique_frames": result.unique_frames,
        }
    return results


def _write_contract(path: Path) -> dict:
    animations = []
    for row, (action, count, fps, loop) in enumerate(ACTIONS):
        animations.append(
            {
                "name": action,
                "part": PART,
                "row": row,
                "fps": fps,
                "loop": loop,
                "authored_frames": count,
                "slots": list(range(count)),
            }
        )
    contract = {
        "schema": 1,
        "quality_contract": "sprite-forge-v1",
        "actor": "matthias",
        "weapon": "pistol",
        "composition": "integrated",
        "cell": {"width": CELL, "height": CELL},
        "parts": {PART: {"columns": 4, "rows": len(ACTIONS)}},
        "animations": animations,
    }
    path.write_text(
        json.dumps(contract, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return contract


def _review(atlas: Image.Image, output: Path) -> None:
    tile_w = 300
    tile_h = 300
    sheet = Image.new(
        "RGBA",
        (4 * tile_w, len(ACTIONS) * tile_h),
        (17, 19, 23, 255),
    )
    draw = ImageDraw.Draw(sheet)
    for row, (action, count, _fps, _loop) in enumerate(ACTIONS):
        for column in range(4):
            x = column * tile_w
            y = row * tile_h
            if column < count:
                cell = atlas.crop(
                    (
                        column * CELL,
                        row * CELL,
                        (column + 1) * CELL,
                        (row + 1) * CELL,
                    )
                )
                cell.thumbnail((270, 255), Image.Resampling.LANCZOS)
                sheet.alpha_composite(
                    cell,
                    (x + (tile_w - cell.width) // 2, y + 8),
                )
                label = f"{action}/{column:03d}"
            else:
                label = f"{action}/—"
            draw.text((x + 10, y + 274), label, fill=(230, 233, 238, 255))
    sheet.save(output, "PNG", compress_level=9)


def build(frames_root: Path, output_dir: Path) -> dict:
    temporal = _validate_temporal(frames_root)
    output_dir.mkdir(parents=True, exist_ok=True)
    contract_path = output_dir / "contract.json"
    _write_contract(contract_path)

    bank_dir = output_dir / "bank"
    manifest = build_bank(contract_path, frames_root, bank_dir)
    atlas_path = bank_dir / f"{PART}.png"
    manifest_path = bank_dir / "manifest.json"
    review_path = output_dir / "matthias-pistol-v1-seed-bank-review.png"
    _review(Image.open(atlas_path).convert("RGBA"), review_path)

    report = {
        "schema": 1,
        "kind": "matthias-pistol-v1-seed-bank",
        "status": "validated-seed-not-accepted",
        "coverage": [action for action, *_ in ACTIONS],
        "missing_for_full_bank": [
            "idle",
            "jump",
            "fall",
            "land",
            "crouch_walk",
            "shoot_up",
            "shoot_down",
            "shoot_diag_up",
            "shoot_diag_up_alt",
            "shoot_diag_down",
            "shoot_crouch",
            "reload",
            "hurt",
            "die",
        ],
        "temporal": temporal,
        "contract_sha256": sha256(contract_path),
        "atlas_sha256": sha256(atlas_path),
        "manifest_sha256": sha256(manifest_path),
        "review_sha256": sha256(review_path),
        "manifest_kind": manifest["kind"],
    }
    (output_dir / "seed-bank-report.json").write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frames-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    report = build(args.frames_root.resolve(), args.output_dir.resolve())
    print(json.dumps(report, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
