#!/usr/bin/env python3
"""Export Matthias runtime atlases as PNG smoke evidence."""
from __future__ import annotations

import argparse
import json
import re
import shutil
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

DEFAULT_CELL = 256
DEFAULT_COLS = 8
DEFAULT_ROWS = 11
REQUIRED_WEAPONS = {"pistol", "machinegun", "shotgun", "panzerfaust"}
URL_RE = re.compile(r'^\s*"(?P<weapon>[a-z0-9_-]+)"\s*:\s*"(?P<url>https?://[^"]+\.png)"\s*,?\s*$', re.I)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path, help="GDScript containing FULL_ATLAS_URLS")
    parser.add_argument("--atlas", action="append", default=[], metavar="WEAPON=PATH_OR_URL")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--cell-size", type=int, default=DEFAULT_CELL)
    parser.add_argument("--columns", type=int, default=DEFAULT_COLS)
    parser.add_argument("--rows", type=int, default=DEFAULT_ROWS)
    return parser.parse_args()


def parse_sources(cfg: argparse.Namespace) -> dict[str, str]:
    sources: dict[str, str] = {}
    if cfg.gdscript:
        text = cfg.gdscript.read_text(encoding="utf-8")
        in_block = False
        for line in text.splitlines():
            stripped = line.strip()
            if stripped.startswith("const FULL_ATLAS_URLS") and "{" in stripped:
                in_block = True
                continue
            if in_block and stripped.startswith("}"):
                in_block = False
                continue
            if in_block:
                match = URL_RE.match(line)
                if match:
                    sources[match.group("weapon").lower()] = match.group("url")
        missing = sorted(REQUIRED_WEAPONS - sources.keys())
        if missing:
            raise SystemExit(f"FULL_ATLAS_URLS missing required Matthias weapons: {', '.join(missing)}")
    for item in cfg.atlas:
        if "=" not in item:
            raise SystemExit(f"invalid --atlas {item!r}; expected WEAPON=PATH_OR_URL")
        weapon, source = item.split("=", 1)
        weapon, source = weapon.strip().lower(), source.strip()
        if not weapon or not source:
            raise SystemExit(f"invalid --atlas {item!r}")
        sources[weapon] = source
    if not sources:
        raise SystemExit("no Matthias atlas sources found")
    return sources


def _v7_url_candidates(source: str) -> list[str]:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme not in {"http", "https"}:
        return [source]
    name = Path(parsed.path).name
    plain_name = re.sub(r"-[0-9a-f]{16}(?=\.png$)", "", name, flags=re.I)
    match = re.match(r"matthias_(?P<weapon>[a-z0-9_-]+)_godot_strict_8x11_256_v7\.png$", plain_name, re.I)
    if not match:
        return [source]
    weapon = match.group("weapon").lower()
    origin = f"{parsed.scheme}://{parsed.netloc}"
    release = "/pawn-slug-godot/releases/f9134382bb1adb60/pawn_slug_godot_atlases_v2"
    candidates = [
        source,
        f"{origin}{release}/{plain_name}",
        f"{origin}{release}/strict_8x11_256/{plain_name}",
        f"{origin}{release}/pawn_slug_matthias_godot_strict_v7/strict_8x11_256/{plain_name}",
        f"{origin}/pawn_slug_matthias_godot_strict_v7/strict_8x11_256/{plain_name}",
        f"{origin}/pawn-slug-godot/matthias/strict-v7/{weapon}/{plain_name}",
        f"{origin}/pawn-slug-godot/matthias/strict-v7/{weapon}/strict_8x11_256/{plain_name}",
    ]
    return list(dict.fromkeys(candidates))


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    if parsed.scheme in {"http", "https"}:
        last_error = None
        for candidate in _v7_url_candidates(source):
            candidate_parsed = urllib.parse.urlparse(candidate)
            target = temp_dir / (Path(candidate_parsed.path).name or "atlas.png")
            request = urllib.request.Request(candidate, headers={"User-Agent": "ChessStudio-PawnSlug-Smoke/1"})
            try:
                with urllib.request.urlopen(request, timeout=20) as response, target.open("wb") as stream:
                    shutil.copyfileobj(response, stream)
                if candidate != source:
                    print(f"Matthias sprite smoke resolved R2 fallback: {candidate}")
                return target
            except Exception as exc:
                last_error = exc
                if target.exists():
                    target.unlink()
        raise SystemExit(f"failed to download {source} or known v7 R2 variants: {last_error}")
    path = Path(source)
    if not path.is_file():
        raise SystemExit(f"missing atlas: {source}")
    return path


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    alt = (205, 205, 205, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=alt)
    return image


def export_atlas(weapon: str, source: Path, out_root: Path, *, cell: int, cols: int, rows: int) -> dict:
    atlas = Image.open(source).convert("RGBA")
    expected = (cols * cell, rows * cell)
    if atlas.size != expected:
        raise SystemExit(f"{weapon}: atlas size {atlas.size}, expected {expected}")

    weapon_dir = out_root / weapon
    frames_dir = weapon_dir / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    contact = checkerboard(expected)
    contact.alpha_composite(atlas)
    draw = ImageDraw.Draw(contact)
    for x in range(0, expected[0] + 1, cell):
        draw.line((x, 0, x, expected[1]), fill=(90, 90, 90, 180), width=1)
    for y in range(0, expected[1] + 1, cell):
        draw.line((0, y, expected[0], y), fill=(90, 90, 90, 180), width=1)

    frames, empty, edge_touches = [], [], []
    for row in range(rows):
        for col in range(cols):
            left, top = col * cell, row * cell
            frame = atlas.crop((left, top, left + cell, top + cell))
            bbox = frame.getchannel("A").getbbox()
            key = f"r{row:02d}_c{col:02d}"
            if bbox is None:
                empty.append(key)
                continue
            touches = {
                "left": bbox[0] == 0,
                "top": bbox[1] == 0,
                "right": bbox[2] == cell,
                "bottom": bbox[3] == cell,
            }
            if any(touches.values()):
                edge_touches.append({"frame": key, "edges": [edge for edge, hit in touches.items() if hit]})
            frame_path = frames_dir / f"matthias_{weapon}_{key}.png"
            frame.save(frame_path, "PNG", optimize=True)
            frames.append({"frame": key, "bbox": list(bbox), "file": str(frame_path.relative_to(out_root))})

    if not frames:
        raise SystemExit(f"{weapon}: atlas contains no visible sprites")

    contact_path = weapon_dir / f"matthias_{weapon}_contact_sheet.png"
    contact.save(contact_path, "PNG", optimize=True)
    return {
        "weapon": weapon,
        "source": source.name,
        "atlasSize": list(atlas.size),
        "cellSize": cell,
        "visibleFrames": len(frames),
        "emptyFrames": empty,
        "edgeTouches": edge_touches,
        "contactSheet": str(contact_path.relative_to(out_root)),
        "frames": frames,
    }


def compose_overview(reports: list[dict], out_root: Path) -> str:
    order = ("pistol", "machinegun", "shotgun", "panzerfaust")
    by_weapon = {item["weapon"]: item for item in reports}
    tile_w, tile_h, label_h = 512, 704, 28
    board = Image.new("RGBA", (tile_w * 2, (tile_h + label_h) * 2), (22, 24, 28, 255))
    draw = ImageDraw.Draw(board)
    for index, weapon in enumerate(order):
        item = by_weapon.get(weapon)
        if item is None:
            continue
        source = out_root / item["contactSheet"]
        image = Image.open(source).convert("RGBA")
        image = image.resize((tile_w, tile_h), Image.Resampling.LANCZOS)
        x = (index % 2) * tile_w
        y = (index // 2) * (tile_h + label_h)
        draw.text((x + 8, y + 7), weapon.upper(), fill=(238, 238, 238, 255))
        board.alpha_composite(image, (x, y + label_h))
    path = out_root / "matthias_all_weapons_contact_sheet.png"
    board.save(path, "PNG", optimize=True)
    return str(path.relative_to(out_root))


def main() -> None:
    cfg = parse_args()
    if min(cfg.cell_size, cfg.columns, cfg.rows) <= 0:
        raise SystemExit("cell size, columns and rows must be positive")
    sources = parse_sources(cfg)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    reports = []
    with tempfile.TemporaryDirectory(prefix="pawnslug-matthias-smoke-") as tmp:
        temp_dir = Path(tmp)
        for weapon, source in sorted(sources.items()):
            reports.append(export_atlas(
                weapon,
                acquire(source, temp_dir),
                cfg.output_dir,
                cell=cfg.cell_size,
                cols=cfg.columns,
                rows=cfg.rows,
            ))
    overview = compose_overview(reports, cfg.output_dir)
    summary = {
        "schema": 2,
        "scope": "pawn-slug-godot-matthias-sprite-smoke",
        "overview": overview,
        "atlases": reports,
    }
    (cfg.output_dir / "matthias_sprite_smoke.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    total = sum(item["visibleFrames"] for item in reports)
    touches = sum(len(item["edgeTouches"]) for item in reports)
    print(f"OK Matthias sprite smoke: {len(reports)} atlases, {total} visible frames, {touches} edge-touch warnings")


if __name__ == "__main__":
    main()
