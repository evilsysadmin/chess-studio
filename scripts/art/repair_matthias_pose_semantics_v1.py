#!/usr/bin/env python3
"""Deterministically repair Matthias crouch semantics and frozen hurt tails.

The repair is intentionally surgical and source-preserving:
- crouch/crouch_walk/shoot_crouch keep original upper-body pixels at original scale,
  translating that upper half downward over untouched grounded legs;
- panzerfaust crouch_walk borrows only the accepted pistol leg cycle;
- three frozen hurt tails hand off to the weapon's own idle recovery frames;
- panzerfaust alternate diagonal-up keeps its upper pose/weapon and borrows only
  a tiny idle-foot stance so the alternate is genuinely distinct.
All unrelated frames remain byte-for-byte identical to the exported runtime bank.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import statistics
import tempfile
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

WEAPONS = ("pistol", "machinegun", "shotgun", "panzerfaust")
COLUMNS = 8
ROWS = 18
CELL = 416
IDLE_ROW = 0
CROUCH_ROWS = (6, 7, 14)
HURT_ROW = 16
PANZER_ALT_ROW = 12
BODY_BAND = (0.30, 0.64)
UPPER_SPLIT_Y = 305
CROUCH_TARGET_HEIGHT_RATIO = 0.83
LEG_BOX = (95, 310, 285, CELL)
ALT_FEET_BOX = (95, 335, 285, CELL)


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=False, compress_level=9)


def frame_path(root: Path, weapon: str, row: int, column: int) -> Path:
    return root / weapon / "frames" / f"matthias_{weapon}_r{row:02d}_c{column:02d}.png"


def body_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.convert("RGBA").getchannel("A").point(lambda v: 255 if v >= 32 else 0)
    x0 = round(BODY_BAND[0] * image.width)
    x1 = round(BODY_BAND[1] * image.width)
    band = alpha.crop((x0, 0, x1, image.height))
    box = band.getbbox()
    if box is None:
        raise ValueError("no alpha in Matthias body measurement band")
    return (x0 + box[0], box[1], x0 + box[2], box[3])


def copy_bank(source: Path, output: Path) -> None:
    for weapon in WEAPONS:
        target = output / weapon / "frames"
        target.mkdir(parents=True, exist_ok=True)
        for row in range(ROWS):
            for column in range(COLUMNS):
                src = frame_path(source, weapon, row, column)
                if not src.is_file():
                    raise FileNotFoundError(src)
                shutil.copy2(src, frame_path(output, weapon, row, column))


def idle_target_top(root: Path, weapon: str) -> int:
    boxes = [body_bbox(Image.open(frame_path(root, weapon, IDLE_ROW, c)).convert("RGBA")) for c in range(COLUMNS)]
    heights = [b[3] - b[1] for b in boxes]
    bottoms = [b[3] for b in boxes]
    return round(statistics.median(bottoms) - CROUCH_TARGET_HEIGHT_RATIO * statistics.median(heights))


def lower_upper_without_scale(image: Image.Image, target_top: int) -> Image.Image:
    rgba = image.convert("RGBA")
    box = body_bbox(rgba)
    dy = max(0, target_top - box[1])
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    # Legs and grounded footline stay exactly where authored.
    out.alpha_composite(rgba.crop((0, UPPER_SPLIT_Y, CELL, CELL)), (0, UPPER_SPLIT_Y))
    # Head, torso, hands and weapon move down rigidly: no X/Y rescale.
    out.alpha_composite(rgba.crop((0, 0, CELL, UPPER_SPLIT_Y)), (0, dy))
    return out


def transplant_box(target: Image.Image, donor: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    out = target.convert("RGBA").copy()
    out.paste((0, 0, 0, 0), box)
    out.alpha_composite(donor.convert("RGBA").crop(box), (box[0], box[1]))
    return out


def assemble_atlas(root: Path, weapon: str) -> Image.Image:
    atlas = Image.new("RGBA", (COLUMNS * CELL, ROWS * CELL), (0, 0, 0, 0))
    for row in range(ROWS):
        for column in range(COLUMNS):
            frame = Image.open(frame_path(root, weapon, row, column)).convert("RGBA")
            if frame.size != (CELL, CELL):
                raise ValueError(f"{weapon} r{row} c{column}: unexpected frame size {frame.size}")
            atlas.alpha_composite(frame, (column * CELL, row * CELL))
    return atlas


def render_review(source: Path, repaired: Path, output: Path) -> None:
    affected = ((6, "crouch"), (7, "crouch_walk"), (12, "diag_up_alt"), (14, "shoot_crouch"), (16, "hurt"))
    scale = 0.25
    label_h = 24
    panels = []
    for weapon in WEAPONS:
        for row, name in affected:
            before = Image.new("RGBA", (COLUMNS * CELL, CELL), (0, 0, 0, 0))
            after = before.copy()
            for c in range(COLUMNS):
                before.alpha_composite(Image.open(frame_path(source, weapon, row, c)).convert("RGBA"), (c * CELL, 0))
                after.alpha_composite(Image.open(frame_path(repaired, weapon, row, c)).convert("RGBA"), (c * CELL, 0))
            pair = []
            for tag, strip in (("BEFORE", before), ("AFTER", after)):
                reduced = strip.resize((round(strip.width * scale), round(strip.height * scale)), Image.Resampling.NEAREST)
                p = Image.new("RGBA", (reduced.width, reduced.height + label_h), (20, 22, 26, 255))
                ImageDraw.Draw(p).text((6, 5), f"{weapon} {name} {tag}", fill=(240, 240, 240, 255))
                p.alpha_composite(reduced, (0, label_h))
                pair.append(p)
            panel = Image.new("RGBA", (pair[0].width, pair[0].height * 2), (16, 18, 22, 255))
            panel.alpha_composite(pair[0], (0, 0)); panel.alpha_composite(pair[1], (0, pair[0].height))
            panels.append(panel)
    width = max(p.width for p in panels)
    height = sum(p.height for p in panels)
    board = Image.new("RGBA", (width, height), (12, 14, 18, 255))
    y = 0
    for p in panels:
        board.alpha_composite(p, (0, y)); y += p.height
    save_png(board, output)


def repair(source: Path, output: Path) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    copy_bank(source, output)
    changed: set[tuple[str, int, int]] = set()

    # True crouch family: rigid upper-body translation, grounded lower half untouched.
    for weapon in WEAPONS:
        target_top = idle_target_top(source, weapon)
        for row in CROUCH_ROWS:
            for c in range(COLUMNS):
                p = frame_path(output, weapon, row, c)
                save_png(lower_upper_without_scale(Image.open(p).convert("RGBA"), target_top), p)
                changed.add((weapon, row, c))

    # Panzerfaust original crouch-walk legs are almost frozen. Reuse only the
    # already-authored pistol leg cycle after both rows use the same crouch geometry.
    for c in range(COLUMNS):
        target = frame_path(output, "panzerfaust", 7, c)
        donor = frame_path(output, "pistol", 7, c)
        save_png(transplant_box(Image.open(target), Image.open(donor), LEG_BOX), target)
        changed.add(("panzerfaust", 7, c))

    # Frozen hurt tails resolve into this weapon's own normal ready stance.
    for weapon in ("machinegun", "shotgun", "panzerfaust"):
        for hurt_c, idle_c in ((6, 1), (7, 0)):
            shutil.copy2(frame_path(output, weapon, IDLE_ROW, idle_c), frame_path(output, weapon, HURT_ROW, hurt_c))
            changed.add((weapon, HURT_ROW, hurt_c))

    # Alt diagonal-up was a visual clone. Change only feet/base stance while
    # keeping the panzerfaust, hands, torso and aim untouched.
    for c in range(COLUMNS):
        target = frame_path(output, "panzerfaust", PANZER_ALT_ROW, c)
        donor = frame_path(output, "panzerfaust", IDLE_ROW, c)
        save_png(transplant_box(Image.open(target), Image.open(donor), ALT_FEET_BOX), target)
        changed.add(("panzerfaust", PANZER_ALT_ROW, c))

    # Prove every unlisted frame survived byte-for-byte.
    for weapon in WEAPONS:
        for row in range(ROWS):
            for c in range(COLUMNS):
                if (weapon, row, c) in changed:
                    continue
                if sha256(frame_path(source, weapon, row, c)) != sha256(frame_path(output, weapon, row, c)):
                    raise ValueError(f"unaffected-frame-drift:{weapon}:r{row}:c{c}")

    atlas_dir = output / "atlases"
    atlas_dir.mkdir(parents=True, exist_ok=True)
    atlas_entries = {}
    for weapon in WEAPONS:
        atlas_path = atlas_dir / f"matthias-{weapon}-pose-semantics-v1.png"
        save_png(assemble_atlas(output, weapon), atlas_path)
        atlas_entries[weapon] = {"path": str(atlas_path), "sha256": sha256(atlas_path)}

    review = output / "matthias-pose-semantics-v1-review.png"
    render_review(source, output, review)
    payload = {
        "schema": 1,
        "kind": "matthias-pose-semantics-v1",
        "rows": ROWS,
        "columns": COLUMNS,
        "cellSize": CELL,
        "changedFrames": len(changed),
        "unchangedFramesPixelIdentical": True,
        "atlases": atlas_entries,
        "review": {"path": str(review), "sha256": sha256(review)},
    }
    manifest = output / "matthias-pose-semantics-v1-manifest.json"
    manifest.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def self_test() -> None:
    # Focused invariant: translation must preserve dimensions and never rescale pixels.
    im = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle((130, 150, 260, 304), fill=(10, 20, 30, 255))
    d.rectangle((150, 305, 240, 381), fill=(40, 50, 60, 255))
    out = lower_upper_without_scale(im, 190)
    if out.size != im.size:
        raise AssertionError("canvas changed")
    # A known upper pixel moves rigidly by dy=40, retaining exact RGBA.
    if out.getpixel((150, 190)) != im.getpixel((150, 150)):
        raise AssertionError("upper-body translation is not pixel-preserving")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_root", type=Path, nargs="?")
    ap.add_argument("output_dir", type=Path, nargs="?")
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    if args.self_test:
        self_test(); print("Matthias pose semantics v1 self-test: OK"); return 0
    if args.frames_root is None or args.output_dir is None:
        raise SystemExit("frames_root and output_dir are required")
    print(json.dumps(repair(args.frames_root, args.output_dir), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())