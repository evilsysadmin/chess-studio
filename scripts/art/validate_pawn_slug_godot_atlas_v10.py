#!/usr/bin/env python3
"""Fail-closed contract and visual review gate for Matthias strict-v10."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw

V = "v10"
COLS, ROWS, CELL = 8, 18, 416
SIZE = (COLS * CELL, ROWS * CELL)
PIVOT, FOOT, TOL, GUARD = 200.0, 382.0, 6.0, 2
ROW_NAMES = (
    "idle", "walk", "run", "jump", "fall", "land", "crouch", "crouch_walk",
    "shoot", "shoot_up", "shoot_down", "shoot_diag_up", "shoot_diag_up_alt",
    "shoot_diag_down", "shoot_crouch", "reload", "hurt", "die",
)
ACTIONS = (
    ("idle", 0, 6.0, True), ("walk", 1, 10.0, True), ("run", 2, 12.0, True),
    ("jump", 3, 10.0, False), ("fall", 4, 8.0, True), ("land", 5, 12.0, False),
    ("crouch", 6, 6.0, True), ("crouch_walk", 7, 8.0, True),
    ("shoot", 8, 15.0, False), ("shoot_up", 9, 15.0, False),
    ("shoot_down", 10, 15.0, False), ("shoot_diag_up", 11, 15.0, False),
    ("shoot_diag_up_alt", 12, 15.0, False), ("shoot_diag_down", 13, 15.0, False),
    ("shoot_crouch", 14, 15.0, False), ("reload", 15, 10.0, False),
    ("hurt", 16, 12.0, False), ("die", 17, 9.0, False),
)
REMAP = (0, 1, 2, 3, 3, 4, 5, 5)


def fail(message: str) -> None:
    raise SystemExit(message)


def cli() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--atlas", type=Path, required=True)
    p.add_argument("--weapon", choices=("pistol", "machinegun", "shotgun", "panzerfaust"), required=True)
    p.add_argument("--runtime", type=Path, required=True)
    p.add_argument("--baseline", type=Path)
    p.add_argument("--generated-run", action="store_true")
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--contact-sheet", type=Path, required=True)
    p.add_argument("--review-board", type=Path, required=True)
    p.add_argument("--strips-dir", type=Path, required=True)
    return p.parse_args()


def runtime_contract(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")

    def number(name: str) -> int:
        m = re.search(rf"const\s+{name}\s*:=\s*(\d+)", text)
        if not m:
            fail(f"runtime missing {name}")
        return int(m.group(1))

    foot = re.search(r"const\s+V10_PACKED_FOOT_Y\s*:=\s*([\d.]+)", text)
    if not foot:
        fail("runtime missing V10_PACKED_FOOT_Y")
    order_match = re.search(r"const\s+V10_ACTION_ORDER\s*:=\s*\[(.*?)\]", text, re.S)
    if not order_match:
        fail("runtime missing V10_ACTION_ORDER")
    order = tuple(re.findall(r'"([^"]+)"', order_match.group(1)))
    actions_match = re.search(r"const\s+V10_ACTIONS\s*:=\s*\{(.*?)\n\}", text, re.S)
    if not actions_match:
        fail("runtime missing V10_ACTIONS")
    rx = re.compile(r'"([^"]+)"\s*:\s*\{\s*"row"\s*:\s*(\d+)\s*,\s*"fps"\s*:\s*([\d.]+)\s*,\s*"loop"\s*:\s*(true|false)\s*\}')
    actions = {n: {"row": int(r), "fps": float(f), "loop": l == "true"} for n, r, f, l in rx.findall(actions_match.group(1))}
    return {"columns": number("V10_ATLAS_COLUMNS"), "rows": number("V10_ATLAS_ROWS"),
            "cell_size": number("V10_ATLAS_CELL_SIZE"), "packed_foot_y": float(foot.group(1)),
            "action_order": order, "actions": actions}


def check_runtime(runtime: dict) -> None:
    if (runtime["columns"], runtime["rows"], runtime["cell_size"]) != (COLS, ROWS, CELL):
        fail(f"runtime v10 layout drift: {runtime}")
    if abs(runtime["packed_foot_y"] - FOOT) > 0.001:
        fail(f"runtime v10 foot drift: {runtime['packed_foot_y']}")
    if runtime["action_order"] != ROW_NAMES:
        fail(f"runtime v10 action order drift: {runtime['action_order']}")
    expected = {name: {"row": row, "fps": fps, "loop": loop} for name, row, fps, loop in ACTIONS}
    if runtime["actions"] != expected:
        fail(f"runtime v10 actions drift: {runtime['actions']}")


def cell(image: Image.Image, row: int, col: int) -> Image.Image:
    return image.crop((col * CELL, row * CELL, (col + 1) * CELL, (row + 1) * CELL))


def alpha_anchor(image: Image.Image) -> tuple[float, float]:
    box = image.getchannel("A").getbbox()
    if box is None:
        fail("empty cell while measuring anchor")
    # Keep the lower-body pivot from the canonical dark boot band. The alpha
    # bbox bottom supplies the foot line and also handles bright boot highlights.
    pixels = image.load()
    y_floor = box[1] + int(round((box[3] - box[1]) * 0.42))
    points = []
    for y in range(y_floor, box[3]):
        for x in range(box[0], box[2]):
            r, g, b, a = pixels[x, y]
            if a > 40 and max(r, g, b) < 210:
                points.append((x, y))
    if not points:
        return (box[0] + box[2]) * 0.5, float(box[3] - 1)
    max_y = max(y for _, y in points)
    band = sorted(x for x, y in points if y >= max_y - max(3, int(round((box[3] - box[1]) * 0.08))))
    return float(band[len(band) // 2]), float(box[3] - 1)


def forward_tip_y(image: Image.Image) -> float:
    box = image.getchannel("A").getbbox()
    if box is None:
        fail("empty cell while measuring aim")
    alpha = image.getchannel("A")
    x0 = max(220, int(round(box[0] + 0.72 * (box[2] - box[0]))))
    points = [(x, y) for y in range(box[1], box[3]) for x in range(x0, box[2]) if alpha.getpixel((x, y)) > 40]
    if not points:
        return (box[1] + box[3]) * 0.5
    cutoff = max(x0, max(x for x, _ in points) - 24)
    values = sorted(y for x, y in points if x >= cutoff)
    return float(values[len(values) // 2]) if len(values) % 2 else (values[len(values) // 2 - 1] + values[len(values) // 2]) / 2


def row_tip(image: Image.Image, row: int) -> float:
    values = sorted(forward_tip_y(cell(image, row, col)) for col in range(COLS))
    return (values[3] + values[4]) / 2


def row_height(image: Image.Image, row: int) -> float:
    values = sorted(cell(image, row, col).getchannel("A").getbbox()[3] - cell(image, row, col).getchannel("A").getbbox()[1] for col in range(COLS))
    return (values[3] + values[4]) / 2


def validate_semantics(image: Image.Image) -> dict:
    horizontal = row_tip(image, 8)
    tips = {str(row): round(row_tip(image, row), 2) for row in (9, 10, 11, 12, 13)}
    for row in (9, 11, 12):
        if tips[str(row)] > horizontal - 50:
            fail(f"semantic aim mismatch row={row} horizontal={horizontal} tip_y={tips[str(row)]}")
    for row in (10, 13):
        if tips[str(row)] < horizontal + 50:
            fail(f"semantic aim mismatch row={row} horizontal={horizontal} tip_y={tips[str(row)]}")
    idle = row_height(image, 0)
    crouch, crouch_walk = row_height(image, 6), row_height(image, 7)
    if crouch > idle - 10 or crouch_walk > idle - 10:
        fail(f"crouch posture too tall: idle={idle} crouch={crouch} crouch_walk={crouch_walk}")
    return {"horizontal_tip_y": round(horizontal, 2), "direction_tip_y": tips,
            "idle_height": round(idle, 2), "crouch_height": round(crouch, 2),
            "crouch_walk_height": round(crouch_walk, 2)}


def compare_baseline(image: Image.Image, baseline: Image.Image) -> dict:
    if baseline.size != (2496, 7488):
        fail(f"baseline must be strict-v9 2496x7488, got {baseline.size}")
    unchanged = 0
    for row in range(ROWS):
        if row == 2:
            continue
        for col, source_col in enumerate(REMAP):
            if cell(image, row, col).tobytes() != baseline.crop((source_col * CELL, row * CELL, (source_col + 1) * CELL, (row + 1) * CELL)).tobytes():
                fail(f"baseline regression at row={row} col={col} source_col={source_col}")
            unchanged += 1
    return {"baseline_v9_cells_exact": unchanged, "baseline_v9_rows_checked": ROWS - 1}


def make_contact(image: Image.Image, path: Path) -> None:
    thumb, label = 96, 20
    out = Image.new("RGBA", (COLS * thumb, ROWS * (thumb + label)), (20, 20, 20, 255))
    draw = ImageDraw.Draw(out)
    for name, row, _, _ in ACTIONS:
        draw.text((3, row * (thumb + label) + 3), f"{row:02d} {name}", fill=(235, 235, 235, 255))
        for col in range(COLS):
            thumb_image = cell(image, row, col)
            thumb_image.thumbnail((thumb, thumb), Image.Resampling.LANCZOS)
            out.alpha_composite(thumb_image, (col * thumb + (thumb - thumb_image.width) // 2, row * (thumb + label) + label + (thumb - thumb_image.height) // 2))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, "PNG", optimize=True)


def make_review(image: Image.Image, path: Path) -> None:
    label, thumb, row_height_px = 176, 112, 132
    out = Image.new("RGBA", (label + COLS * thumb, ROWS * row_height_px), (18, 18, 18, 255))
    draw = ImageDraw.Draw(out)
    px = round(PIVOT / CELL * thumb)
    py = round(FOOT / CELL * thumb)
    for name, row, fps, loop in ACTIONS:
        y = row * row_height_px
        draw.text((8, y + 8), f"{row:02d} {name}", fill=(245, 245, 245, 255))
        draw.text((8, y + 27), f"{fps:g} fps · {'loop' if loop else 'once'}", fill=(165, 165, 165, 255))
        for col in range(COLS):
            thumb_image = cell(image, row, col).resize((thumb, thumb), Image.Resampling.LANCZOS)
            overlay = ImageDraw.Draw(thumb_image)
            overlay.line((px, 0, px, thumb - 1), fill=(65, 190, 255, 150), width=1)
            overlay.line((0, py, thumb - 1, py), fill=(255, 195, 70, 170), width=1)
            x = label + col * thumb
            out.alpha_composite(thumb_image, (x, y + 16))
            draw.rectangle((x, y + 16, x + thumb - 1, y + 16 + thumb - 1), outline=(75, 75, 75, 255), width=1)
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, "PNG", optimize=True)


def artifacts(image: Image.Image, parsed: argparse.Namespace, runtime: dict, frames: list[dict], semantics: dict, baseline: dict | None) -> None:
    parsed.strips_dir.mkdir(parents=True, exist_ok=True)
    for name, row, _, _ in ACTIONS:
        image.crop((0, row * CELL, COLS * CELL, (row + 1) * CELL)).save(parsed.strips_dir / f"{row:02d}_{name}.png", "PNG", optimize=True)
    make_contact(image, parsed.contact_sheet)
    make_review(image, parsed.review_board)
    manifest = {
        "schema": 3, "kind": "pawn-slug-godot-strict-sprite-atlas", "version": V,
        "weapon": parsed.weapon, "atlas": {
            "filename": parsed.atlas.name, "sha256": hashlib.sha256(parsed.atlas.read_bytes()).hexdigest(),
            "format": "PNG", "mode": "RGBA", "width": SIZE[0], "height": SIZE[1],
            "columns": COLS, "rows": ROWS, "cell_size": CELL, "cell_guard_min_px": GUARD,
            "target_pivot_x": PIVOT, "target_foot_y": FOOT, "anchor_tolerance_px": TOL,
        }, "godot_runtime_contract": runtime, "action_order": list(ROW_NAMES),
        "actions": [{"name": n, "row": r, "frames": COLS, "fps": f, "loop": l} for n, r, f, l in ACTIONS],
        "semantics": semantics, "baseline_comparison": baseline, "generated_run": parsed.generated_run,
        "frames": frames,
    }
    parsed.manifest.parent.mkdir(parents=True, exist_ok=True)
    parsed.manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> int:
    parsed = cli()
    image = Image.open(parsed.atlas)
    if image.format != "PNG" or image.mode != "RGBA" or image.size != SIZE:
        fail(f"PNG contract mismatch format={image.format} mode={image.mode} size={image.size}")
    if image.info.get("icc_profile") or image.info.get("exif") or int(image.info.get("interlace", 0) or 0):
        fail("PNG metadata/interlace contract mismatch")
    runtime = runtime_contract(parsed.runtime)
    check_runtime(runtime)
    frames = []
    idle_heights = []
    seen = {name: set() for name, _, _, _ in ACTIONS}
    for name, row, _, _ in ACTIONS:
        for col in range(COLS):
            current = cell(image, row, col)
            box = current.getchannel("A").getbbox()
            if box is None:
                fail(f"empty cell {name}[{col}]")
            guard = min(box[0], box[1], CELL - box[2], CELL - box[3])
            alpha_pixels = sum(current.getchannel("A").histogram()[31:])
            if guard < GUARD:
                fail(f"cell bleed {name}[{col}] bbox={box} guard={guard}")
            if alpha_pixels < 2000:
                fail(f"sparse frame {name}[{col}] alpha_pixels={alpha_pixels}")
            ax, ay = alpha_anchor(current)
            if row <= 15 and (abs(ax - PIVOT) > TOL or abs(ay - FOOT) > TOL):
                fail(f"anchor drift {name}[{col}] x={ax:.1f} y={ay:.1f}")
            if row == 0:
                idle_heights.append(box[3] - box[1])
            seen[name].add(hashlib.sha256(current.tobytes()).hexdigest())
            frames.append({"action": name, "row": row, "frame": col, "bbox": list(box), "guard_px": guard,
                           "alpha_pixels": alpha_pixels, "anchor_x": ax, "anchor_y": ay,
                           "sha256_rgba": hashlib.sha256(current.tobytes()).hexdigest()})
    if max(idle_heights) - min(idle_heights) > 8 or not 215 <= sorted(idle_heights)[4] <= 245:
        fail(f"idle scale drift: {idle_heights}")
    for name in ("walk", "run", "crouch_walk"):
        if len(seen[name]) < 2:
            fail(f"no frame variation in {name}")
    semantics = validate_semantics(image)
    baseline = None
    if parsed.baseline:
        baseline = compare_baseline(image, Image.open(parsed.baseline).convert("RGBA"))
    artifacts(image, parsed, runtime, frames, semantics, baseline)
    print(f"OK strict Godot atlas {parsed.weapon}: {SIZE[0]}x{SIZE[1]} grid={COLS}x{ROWS} cell={CELL}px")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
