#!/usr/bin/env python3
"""Build strict-v11 Matthias atlases from the coherent strict-v9 runtime bank.

Input:  6 x 18 @ 416px (strict-v9, one weapon).
Output: 8 x 18 @ 416px (strict-v11, one weapon).

v11 deliberately does not invent raster pixels by cross-fading neighbouring
poses. Cross-fades look smooth in a contact sheet but ghost legs/weapons at
runtime. Instead it phase-resamples the authored six-frame banks to eight
frames while preserving the exact body rendering, then re-anchors every frame
to the same lower-body pivot and foot line. This keeps visual body size,
proportions and weapon identity unchanged while giving every runtime pose a
minimum eight-frame contract.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import statistics
from PIL import Image

VERSION = "v11"
SRC_COLS = 6
COLS = 8
ROWS = 18
CELL = 416
SRC_SIZE = (SRC_COLS * CELL, ROWS * CELL)
OUT_SIZE = (COLS * CELL, ROWS * CELL)
TARGET_PIVOT_X = 200.0
TARGET_FOOT_Y = 382.0
ALPHA = 40
CELL_GUARD = 4

ACTIONS = (
    ("idle", 6.0, True),
    ("walk", 10.0, True),
    ("run", 12.0, True),
    ("jump", 10.0, False),
    ("fall", 8.0, True),
    ("land", 12.0, False),
    ("crouch", 6.0, True),
    ("crouch_walk", 8.0, True),
    ("shoot", 15.0, False),
    ("shoot_up", 15.0, False),
    ("shoot_down", 15.0, False),
    ("shoot_diag_up", 15.0, False),
    ("shoot_diag_up_alt", 15.0, False),
    ("shoot_diag_down", 15.0, False),
    ("shoot_crouch", 15.0, False),
    ("reload", 10.0, False),
    ("hurt", 12.0, False),
    ("die", 9.0, False),
)

# Temporal phase expansion. Looping banks distribute duplicate holds through the
# cycle; one-shots preserve start/end readability. No frame is alpha-blended.
LOOP_MAP = (0, 1, 1, 2, 3, 4, 4, 5)
ONE_SHOT_MAP = (0, 0, 1, 2, 3, 4, 5, 5)
FIRE_MAP = (0, 1, 2, 3, 4, 5, 5, 5)
MAP_BY_ACTION = {
    "jump": ONE_SHOT_MAP,
    "land": ONE_SHOT_MAP,
    "shoot": FIRE_MAP,
    "shoot_up": FIRE_MAP,
    "shoot_down": FIRE_MAP,
    "shoot_diag_up": FIRE_MAP,
    "shoot_diag_up_alt": FIRE_MAP,
    "shoot_diag_down": FIRE_MAP,
    "shoot_crouch": FIRE_MAP,
    "reload": ONE_SHOT_MAP,
    "hurt": ONE_SHOT_MAP,
    "die": ONE_SHOT_MAP,
}


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--source", type=Path)
    p.add_argument("--output", type=Path)
    p.add_argument("--manifest", type=Path)
    p.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"))
    p.add_argument("--self-test", action="store_true")
    return p.parse_args()


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def cell(atlas: Image.Image, row: int, col: int) -> Image.Image:
    return atlas.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def lower_body_anchor(im: Image.Image) -> tuple[float, float]:
    px = im.load(); pts = []
    for y in range(int(CELL * 0.42), CELL):
        for x in range(CELL):
            r, g, b, a = px[x, y]
            if a <= ALPHA or max(r, g, b) >= 220:
                continue
            pts.append((x, y))
    if not pts:
        box = im.getchannel("A").getbbox()
        if box is None:
            raise SystemExit("cannot anchor empty frame")
        return (box[0] + box[2]) * 0.5, float(box[3] - 1)
    foot = max(y for _, y in pts)
    band = max(3, int(CELL * 0.03))
    xs = sorted(x for x, y in pts if y >= foot - band)
    return float(statistics.median(xs)), float(foot)


def reanchor(im: Image.Image) -> Image.Image:
    ax, ay = lower_body_anchor(im)
    dx = int(round(TARGET_PIVOT_X - ax))
    dy = int(round(TARGET_FOOT_Y - ay))
    if dx == 0 and dy == 0:
        return im.copy()
    out = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    out.alpha_composite(im, (dx, dy))
    return out


def validate_frame(im: Image.Image, action: str, frame: int) -> dict:
    box = im.getchannel("A").getbbox()
    if box is None:
        raise SystemExit(f"empty frame {action}[{frame}]")
    guard = min(box[0], box[1], CELL - box[2], CELL - box[3])
    if guard < CELL_GUARD:
        raise SystemExit(f"cell guard regression {action}[{frame}] guard={guard}")
    ax, ay = lower_body_anchor(im)
    if abs(ax - TARGET_PIVOT_X) > 2.0 or abs(ay - TARGET_FOOT_Y) > 2.0:
        raise SystemExit(f"anchor drift {action}[{frame}] x={ax:.1f} y={ay:.1f}")
    return {"bbox": list(box), "anchor": [round(ax, 2), round(ay, 2)]}


def build(source: Image.Image, source_path: Path, weapon: str) -> tuple[Image.Image, dict]:
    if source.size != SRC_SIZE:
        raise SystemExit(f"strict-v11 expects strict-v9 {SRC_SIZE}, got {source.size}")
    out = Image.new("RGBA", OUT_SIZE, (0, 0, 0, 0))
    actions = []
    for row, (name, fps, loop) in enumerate(ACTIONS):
        mapping = MAP_BY_ACTION.get(name, LOOP_MAP if loop else ONE_SHOT_MAP)
        metas = []
        for dst_col, src_col in enumerate(mapping):
            frame = reanchor(cell(source, row, src_col))
            meta = validate_frame(frame, name, dst_col)
            out.alpha_composite(frame, (dst_col * CELL, row * CELL))
            meta.update({"frame": dst_col, "source_frame": src_col})
            metas.append(meta)
        actions.append({
            "name": name, "row": row, "frames": 8, "fps": fps, "loop": loop,
            "source_frames": list(mapping), "frames_meta": metas,
        })
    manifest = {
        "schema": 1,
        "kind": "pawn-slug-godot-strict-atlas",
        "version": VERSION,
        "weapon": weapon,
        "source": {"filename": source_path.name, "sha256": sha(source_path), "size": list(source.size)},
        "atlas": {
            "columns": COLS, "rows": ROWS, "cell_size": CELL,
            "width": OUT_SIZE[0], "height": OUT_SIZE[1],
            "pivot_x": TARGET_PIVOT_X, "foot_y": TARGET_FOOT_Y,
            "frames_per_pose": 8,
        },
        "actions": actions,
    }
    return out, manifest


def self_test():
    src = Image.new("RGBA", SRC_SIZE, (0, 0, 0, 0))
    from PIL import ImageDraw
    d = ImageDraw.Draw(src)
    for row in range(ROWS):
        for col in range(SRC_COLS):
            x0 = col * CELL + 160 + (col % 2) * 2
            # crouch rows intentionally shorter; all still share a grounded foot.
            top = row * CELL + (210 if row in (6, 7, 14) else 150)
            d.rectangle((x0, top, x0 + 80, row * CELL + 382), fill=(30, 40, 55, 255))
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        root = Path(td); s = root / "src.png"; o = root / "out.png"; m = root / "m.json"
        src.save(s)
        atlas, manifest = build(src, s, "pistol")
        atlas.save(o)
        manifest["atlas"]["sha256"] = sha(o)
        m.write_text(json.dumps(manifest), encoding="utf-8")
        assert atlas.size == OUT_SIZE
        assert len(manifest["actions"]) == 18
        assert all(a["frames"] == 8 for a in manifest["actions"])
    print("OK strict-v11 packer self-test")


def main():
    a = parse_args()
    if a.self_test:
        self_test(); return
    if not all((a.source, a.output, a.manifest, a.weapon)):
        raise SystemExit("--source --output --manifest --weapon are required")
    src = Image.open(a.source).convert("RGBA")
    atlas, manifest = build(src, a.source, a.weapon)
    a.output.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(a.output, "PNG", optimize=True)
    manifest["atlas"]["filename"] = a.output.name
    manifest["atlas"]["sha256"] = sha(a.output)
    a.manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Packed strict-v11 {a.weapon}: {a.output} {atlas.size} actions=18 frames=144")

if __name__ == "__main__":
    main()
