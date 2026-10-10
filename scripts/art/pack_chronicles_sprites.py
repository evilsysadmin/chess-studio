#!/usr/bin/env python3
"""Pack Chronicles 2.5D billboard sources into runtime sprite sheets.

    python3 scripts/art/pack_chronicles_sprites.py [--out frontend/src/assets/chronicles/sprites]

Sources are pixel-art PNGs generated with SpriteCook (provenance and asset ids
in scripts/art/chronicles_sprites/spritecook-assets.json), one per pose, named
`<sprite>.<pose>.png`. Each sheet is one row of square cells; every pose keeps
its native art-pixel scale, feet on the cell floor and centred, then the whole
row is upscaled by an integer factor with nearest-neighbour so the MM3 pixel
grid survives. `idle-b` is derived from idle as a one-row breathing squash of
the upper body, so the idle loop never drifts between two generations.
Deterministic: same sources -> same bytes (lossless WebP).
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SOURCE = REPO / "scripts/art/chronicles_sprites/source"
UPSCALE = 2

# runtime frame id -> source pose (None = derived breathing frame)
SHEETS = {
    "bone-hound": {
        "cell": 160,
        "frames": [("idle-a", "idle"), ("idle-b", None), ("menace", "menace"),
                   ("attack", "attack"), ("hurt", "hurt"), ("dead", "dead")],
    },
    "rookwood-mourner": {
        "cell": 200,
        "frames": [("idle-a", "idle"), ("idle-b", None), ("speak", "speak"),
                   ("grateful", "grateful")],
    },
}


def trimmed(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGBA")
    bbox = image.getbbox()
    return image.crop(bbox) if bbox else image


def breathe(image: Image.Image, rows: int = 2) -> Image.Image:
    """Drop `rows` evenly spaced rows from the upper 55% (chest/shoulders)."""
    w, h = image.size
    band = int(h * 0.55)
    drop = {round(band * (i + 1) / (rows + 1)) for i in range(rows)}
    kept = [y for y in range(h) if y not in drop]
    out = Image.new("RGBA", (w, len(kept)), (0, 0, 0, 0))
    for new_y, y in enumerate(kept):
        out.paste(image.crop((0, y, w, y + 1)), (0, new_y))
    return out


def place(image: Image.Image, cell: int) -> Image.Image:
    if image.width > cell or image.height > cell:
        raise SystemExit(f"pose {image.size} does not fit cell {cell}")
    canvas = Image.new("RGBA", (cell, cell), (0, 0, 0, 0))
    canvas.paste(image, ((cell - image.width) // 2, cell - image.height - 2))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="frontend/src/assets/chronicles/sprites")
    out_dir = (REPO / parser.parse_args().out).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest = {}
    for sprite, spec in SHEETS.items():
        cell = spec["cell"]
        idle = trimmed(SOURCE / f"{sprite}.idle.png")
        cells = []
        for _frame_id, pose in spec["frames"]:
            pose_image = breathe(idle) if pose is None else trimmed(SOURCE / f"{sprite}.{pose}.png")
            cells.append(place(pose_image, cell))
        sheet = Image.new("RGBA", (cell * len(cells), cell), (0, 0, 0, 0))
        for index, image in enumerate(cells):
            sheet.paste(image, (index * cell, 0))
        sheet = sheet.resize((sheet.width * UPSCALE, sheet.height * UPSCALE), Image.NEAREST)
        target = out_dir / f"{sprite}.webp"
        sheet.save(target, "WEBP", lossless=True, method=6, exact=False)
        manifest[sprite] = {
            "frames": [frame_id for frame_id, _ in spec["frames"]],
            "framePx": cell * UPSCALE,
            "pixelArt": True,
        }
        print(f"wrote {target.relative_to(REPO)} ({len(cells)} frames, {target.stat().st_size} bytes)")
    (out_dir / "sprites.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
