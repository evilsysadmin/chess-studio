#!/usr/bin/env python3
"""Export Pawn Slug enemy runtime atlas as PNG smoke evidence."""
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

URL_RE = re.compile(r'^\s*const BODY_ATLAS_URL\s*:=\s*"(?P<url>https?://[^"]+)"\s*$', re.M)
FRAME_RE = re.compile(r'^\s*const REMOTE_FRAME_SIZE\s*:=\s*Vector2\((?P<w>[0-9.]+),\s*(?P<h>[0-9.]+)\)\s*$', re.M)
ROWS_RE = re.compile(r'^\s*const REMOTE_ATLAS_ROWS\s*:=\s*(?P<rows>\d+)\s*$', re.M)
COLS_RE = re.compile(r'^\s*const FRAMES_PER_TYPE\s*:=\s*(?P<cols>\d+)\s*$', re.M)
MAP_BLOCK_RE = re.compile(r'^\s*const REMOTE_TYPE_ROW\s*:=\s*\{(?P<body>[^}]*)\}\s*(r'"(?P<type>[a-z0-9_-]+)"\s*:\s*(?P<row>\d+)')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def parse_runtime_contract(path: Path) -> tuple[str, int, int, int, dict[str, int]]:
    text = path.read_text(encoding="utf-8")
    url_match = URL_RE.search(text)
    frame_match = FRAME_RE.search(text)
    rows_match = ROWS_RE.search(text)
    cols_match = COLS_RE.search(text)
    map_match = MAP_BLOCK_RE.search(text)
    if not all((url_match, frame_match, rows_match, cols_match, map_match)):
        raise SystemExit("enemy_visual.gd lost the remote enemy atlas contract")

    width = int(round(float(frame_match.group("w"))))
    height = int(round(float(frame_match.group("h"))))
    if width != height:
        raise SystemExit(f"enemy atlas cells must be square, got {width}x{height}")
    rows = int(rows_match.group("rows"))
    cols = int(cols_match.group("cols"))
    type_rows = {
        match.group("type"): int(match.group("row"))
        for match in MAP_ROW_RE.finditer(map_match.group("body"))
    }
    if not type_rows:
        raise SystemExit("REMOTE_TYPE_ROW contains no enemy mappings")
    invalid = {kind: row for kind, row in type_rows.items() if row < 0 or row >= rows}
    if invalid:
        raise SystemExit(f"enemy type rows outside atlas: {invalid}")
    return url_match.group("url"), width, cols, rows, type_rows


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    target = temp_dir / (Path(parsed.path).name or "enemy-atlas.webp")
    request = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Enemy-Smoke/1"})
    last_error = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            return target
        except Exception as exc:
            last_error = exc
            if target.exists():
                target.unlink()
            if attempt == 3:
                break
    raise SystemExit(f"failed to download {source} after 3 attempts: {last_error}")


def checkerboard(size: tuple[int, int], tile: int = 10) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    alt = (205, 205, 205, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=alt)
    return image


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x, y = xy
    draw.rectangle((x - 4, y - 3, x + max(68, len(text) * 7), y + 15), fill=(10, 12, 14, 210))
    draw.text((x, y), text, fill=(244, 240, 226, 255))


def export(atlas_path: Path, out_root: Path, *, cell: int, cols: int, rows: int, type_rows: dict[str, int]) -> dict:
    atlas = Image.open(atlas_path).convert("RGBA")
    expected = (cols * cell, rows * cell)
    if atlas.size != expected:
        raise SystemExit(f"enemy atlas size {atlas.size}, expected {expected}")

    frames_dir = out_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    contact = checkerboard(expected)
    contact.alpha_composite(atlas)
    draw = ImageDraw.Draw(contact)
    for x in range(0, expected[0] + 1, cell):
        draw.line((x, 0, x, expected[1]), fill=(70, 70, 70, 180), width=1)
    for y in range(0, expected[1] + 1, cell):
        draw.line((0, y, expected[0], y), fill=(70, 70, 70, 180), width=1)

    row_types: dict[int, list[str]] = {}
    for kind, row in sorted(type_rows.items()):
        row_types.setdefault(row, []).append(kind)
    for row, kinds in row_types.items():
        label(draw, (6, row * cell + 5), f"r{row}: {', '.join(kinds)}")

    frames: list[dict] = []
    empty: list[str] = []
    edge_touches: list[dict] = []
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
            frame_path = frames_dir / f"enemy_{key}.png"
            frame.save(frame_path, "PNG", optimize=True)
            frames.append({"frame": key, "bbox": list(bbox), "file": str(frame_path.relative_to(out_root))})

    contact_path = out_root / "enemy_runtime_contact_sheet.png"
    contact.save(contact_path, "PNG", optimize=True)

    tile = 180
    label_h = 24
    types = sorted(type_rows)
    preview_cols = 4
    preview_rows = (len(types) + preview_cols - 1) // preview_cols
    preview = Image.new("RGBA", (preview_cols * tile, preview_rows * (tile + label_h)), (20, 22, 25, 255))
    preview_draw = ImageDraw.Draw(preview)
    for index, kind in enumerate(types):
        row = type_rows[kind]
        frame = atlas.crop((0, row * cell, cell, row * cell + cell))
        bg = checkerboard((tile, tile), tile=18)
        sprite = frame.resize((tile, tile), Image.Resampling.NEAREST)
        bg.alpha_composite(sprite)
        x = (index % preview_cols) * tile
        y = (index // preview_cols) * (tile + label_h)
        preview_draw.text((x + 6, y + 5), f"{kind.upper()} · row {row}", fill=(238, 238, 238, 255))
        preview.alpha_composite(bg, (x, y + label_h))
    preview_path = out_root / "enemy_runtime_type_preview.png"
    preview.save(preview_path, "PNG", optimize=True)

    return {
        "source": atlas_path.name,
        "atlasSize": list(atlas.size),
        "cellSize": cell,
        "rows": rows,
        "columns": cols,
        "typeRows": type_rows,
        "visibleFrames": len(frames),
        "emptyFrames": empty,
        "edgeTouches": edge_touches,
        "contactSheet": contact_path.name,
        "typePreview": preview_path.name,
        "frames": frames,
    }


def main() -> None:
    cfg = parse_args()
    url, cell, cols, rows, type_rows = parse_runtime_contract(cfg.gdscript)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pawnslug-enemy-smoke-") as tmp:
        report = export(acquire(url, Path(tmp)), cfg.output_dir, cell=cell, cols=cols, rows=rows, type_rows=type_rows)
    summary = {
        "schema": 1,
        "scope": "pawn-slug-godot-enemy-sprite-smoke",
        "runtimeUrl": url,
        **report,
    }
    (cfg.output_dir / "enemy_sprite_smoke.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        "OK enemy sprite smoke: "
        f"{report['visibleFrames']} visible frames, "
        f"{len(report['emptyFrames'])} empty, "
        f"{len(report['edgeTouches'])} edge-touch warnings, "
        f"{len(type_rows)} runtime type mappings"
    )


if __name__ == "__main__":
    main()
, re.M)
MAP_ROW_RE = re.compile(r'"(?P<type>[a-z0-9_-]+)"\s*:\s*(?P<row>\d+)')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def parse_runtime_contract(path: Path) -> tuple[str, int, int, int, dict[str, int]]:
    text = path.read_text(encoding="utf-8")
    url_match = URL_RE.search(text)
    frame_match = FRAME_RE.search(text)
    rows_match = ROWS_RE.search(text)
    cols_match = COLS_RE.search(text)
    map_match = MAP_BLOCK_RE.search(text)
    if not all((url_match, frame_match, rows_match, cols_match, map_match)):
        raise SystemExit("enemy_visual.gd lost the remote enemy atlas contract")

    width = int(round(float(frame_match.group("w"))))
    height = int(round(float(frame_match.group("h"))))
    if width != height:
        raise SystemExit(f"enemy atlas cells must be square, got {width}x{height}")
    rows = int(rows_match.group("rows"))
    cols = int(cols_match.group("cols"))
    type_rows = {
        match.group("type"): int(match.group("row"))
        for match in MAP_ROW_RE.finditer(map_match.group("body"))
    }
    if not type_rows:
        raise SystemExit("REMOTE_TYPE_ROW contains no enemy mappings")
    invalid = {kind: row for kind, row in type_rows.items() if row < 0 or row >= rows}
    if invalid:
        raise SystemExit(f"enemy type rows outside atlas: {invalid}")
    return url_match.group("url"), width, cols, rows, type_rows


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    target = temp_dir / (Path(parsed.path).name or "enemy-atlas.webp")
    request = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Enemy-Smoke/1"})
    last_error = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            return target
        except Exception as exc:
            last_error = exc
            if target.exists():
                target.unlink()
            if attempt == 3:
                break
    raise SystemExit(f"failed to download {source} after 3 attempts: {last_error}")


def checkerboard(size: tuple[int, int], tile: int = 10) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    alt = (205, 205, 205, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=alt)
    return image


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x, y = xy
    draw.rectangle((x - 4, y - 3, x + max(68, len(text) * 7), y + 15), fill=(10, 12, 14, 210))
    draw.text((x, y), text, fill=(244, 240, 226, 255))


def export(atlas_path: Path, out_root: Path, *, cell: int, cols: int, rows: int, type_rows: dict[str, int]) -> dict:
    atlas = Image.open(atlas_path).convert("RGBA")
    expected = (cols * cell, rows * cell)
    if atlas.size != expected:
        raise SystemExit(f"enemy atlas size {atlas.size}, expected {expected}")

    frames_dir = out_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    contact = checkerboard(expected)
    contact.alpha_composite(atlas)
    draw = ImageDraw.Draw(contact)
    for x in range(0, expected[0] + 1, cell):
        draw.line((x, 0, x, expected[1]), fill=(70, 70, 70, 180), width=1)
    for y in range(0, expected[1] + 1, cell):
        draw.line((0, y, expected[0], y), fill=(70, 70, 70, 180), width=1)

    row_types: dict[int, list[str]] = {}
    for kind, row in sorted(type_rows.items()):
        row_types.setdefault(row, []).append(kind)
    for row, kinds in row_types.items():
        label(draw, (6, row * cell + 5), f"r{row}: {', '.join(kinds)}")

    frames: list[dict] = []
    empty: list[str] = []
    edge_touches: list[dict] = []
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
            frame_path = frames_dir / f"enemy_{key}.png"
            frame.save(frame_path, "PNG", optimize=True)
            frames.append({"frame": key, "bbox": list(bbox), "file": str(frame_path.relative_to(out_root))})

    contact_path = out_root / "enemy_runtime_contact_sheet.png"
    contact.save(contact_path, "PNG", optimize=True)

    tile = 180
    label_h = 24
    types = sorted(type_rows)
    preview_cols = 4
    preview_rows = (len(types) + preview_cols - 1) // preview_cols
    preview = Image.new("RGBA", (preview_cols * tile, preview_rows * (tile + label_h)), (20, 22, 25, 255))
    preview_draw = ImageDraw.Draw(preview)
    for index, kind in enumerate(types):
        row = type_rows[kind]
        frame = atlas.crop((0, row * cell, cell, row * cell + cell))
        bg = checkerboard((tile, tile), tile=18)
        sprite = frame.resize((tile, tile), Image.Resampling.NEAREST)
        bg.alpha_composite(sprite)
        x = (index % preview_cols) * tile
        y = (index // preview_cols) * (tile + label_h)
        preview_draw.text((x + 6, y + 5), f"{kind.upper()} · row {row}", fill=(238, 238, 238, 255))
        preview.alpha_composite(bg, (x, y + label_h))
    preview_path = out_root / "enemy_runtime_type_preview.png"
    preview.save(preview_path, "PNG", optimize=True)

    return {
        "source": atlas_path.name,
        "atlasSize": list(atlas.size),
        "cellSize": cell,
        "rows": rows,
        "columns": cols,
        "typeRows": type_rows,
        "visibleFrames": len(frames),
        "emptyFrames": empty,
        "edgeTouches": edge_touches,
        "contactSheet": contact_path.name,
        "typePreview": preview_path.name,
        "frames": frames,
    }


def main() -> None:
    cfg = parse_args()
    url, cell, cols, rows, type_rows = parse_runtime_contract(cfg.gdscript)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pawnslug-enemy-smoke-") as tmp:
        report = export(acquire(url, Path(tmp)), cfg.output_dir, cell=cell, cols=cols, rows=rows, type_rows=type_rows)
    summary = {
        "schema": 1,
        "scope": "pawn-slug-godot-enemy-sprite-smoke",
        "runtimeUrl": url,
        **report,
    }
    (cfg.output_dir / "enemy_sprite_smoke.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        "OK enemy sprite smoke: "
        f"{report['visibleFrames']} visible frames, "
        f"{len(report['emptyFrames'])} empty, "
        f"{len(report['edgeTouches'])} edge-touch warnings, "
        f"{len(type_rows)} runtime type mappings"
    )


if __name__ == "__main__":
    main()
, re.M)
MAP_ROW_RE = re.compile(r'"(?P<type>[a-z0-9_-]+)"\s*:\s*(?P<row>\d+)')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def parse_runtime_contract(path: Path) -> tuple[str, int, int, int, dict[str, int]]:
    text = path.read_text(encoding="utf-8")
    url_match = URL_RE.search(text)
    frame_match = FRAME_RE.search(text)
    rows_match = ROWS_RE.search(text)
    cols_match = COLS_RE.search(text)
    map_match = MAP_BLOCK_RE.search(text)
    if not all((url_match, frame_match, rows_match, cols_match, map_match)):
        raise SystemExit("enemy_visual.gd lost the remote enemy atlas contract")

    width = int(round(float(frame_match.group("w"))))
    height = int(round(float(frame_match.group("h"))))
    if width != height:
        raise SystemExit(f"enemy atlas cells must be square, got {width}x{height}")
    rows = int(rows_match.group("rows"))
    cols = int(cols_match.group("cols"))
    type_rows = {
        match.group("type"): int(match.group("row"))
        for match in MAP_ROW_RE.finditer(map_match.group("body"))
    }
    if not type_rows:
        raise SystemExit("REMOTE_TYPE_ROW contains no enemy mappings")
    invalid = {kind: row for kind, row in type_rows.items() if row < 0 or row >= rows}
    if invalid:
        raise SystemExit(f"enemy type rows outside atlas: {invalid}")
    return url_match.group("url"), width, cols, rows, type_rows


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    target = temp_dir / (Path(parsed.path).name or "enemy-atlas.webp")
    request = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Enemy-Smoke/1"})
    last_error = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            return target
        except Exception as exc:
            last_error = exc
            if target.exists():
                target.unlink()
            if attempt == 3:
                break
    raise SystemExit(f"failed to download {source} after 3 attempts: {last_error}")


def checkerboard(size: tuple[int, int], tile: int = 10) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    alt = (205, 205, 205, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=alt)
    return image


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x, y = xy
    draw.rectangle((x - 4, y - 3, x + max(68, len(text) * 7), y + 15), fill=(10, 12, 14, 210))
    draw.text((x, y), text, fill=(244, 240, 226, 255))


def export(atlas_path: Path, out_root: Path, *, cell: int, cols: int, rows: int, type_rows: dict[str, int]) -> dict:
    atlas = Image.open(atlas_path).convert("RGBA")
    expected = (cols * cell, rows * cell)
    if atlas.size != expected:
        raise SystemExit(f"enemy atlas size {atlas.size}, expected {expected}")

    frames_dir = out_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    contact = checkerboard(expected)
    contact.alpha_composite(atlas)
    draw = ImageDraw.Draw(contact)
    for x in range(0, expected[0] + 1, cell):
        draw.line((x, 0, x, expected[1]), fill=(70, 70, 70, 180), width=1)
    for y in range(0, expected[1] + 1, cell):
        draw.line((0, y, expected[0], y), fill=(70, 70, 70, 180), width=1)

    row_types: dict[int, list[str]] = {}
    for kind, row in sorted(type_rows.items()):
        row_types.setdefault(row, []).append(kind)
    for row, kinds in row_types.items():
        label(draw, (6, row * cell + 5), f"r{row}: {', '.join(kinds)}")

    frames: list[dict] = []
    empty: list[str] = []
    edge_touches: list[dict] = []
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
            frame_path = frames_dir / f"enemy_{key}.png"
            frame.save(frame_path, "PNG", optimize=True)
            frames.append({"frame": key, "bbox": list(bbox), "file": str(frame_path.relative_to(out_root))})

    contact_path = out_root / "enemy_runtime_contact_sheet.png"
    contact.save(contact_path, "PNG", optimize=True)

    tile = 180
    label_h = 24
    types = sorted(type_rows)
    preview_cols = 4
    preview_rows = (len(types) + preview_cols - 1) // preview_cols
    preview = Image.new("RGBA", (preview_cols * tile, preview_rows * (tile + label_h)), (20, 22, 25, 255))
    preview_draw = ImageDraw.Draw(preview)
    for index, kind in enumerate(types):
        row = type_rows[kind]
        frame = atlas.crop((0, row * cell, cell, row * cell + cell))
        bg = checkerboard((tile, tile), tile=18)
        sprite = frame.resize((tile, tile), Image.Resampling.NEAREST)
        bg.alpha_composite(sprite)
        x = (index % preview_cols) * tile
        y = (index // preview_cols) * (tile + label_h)
        preview_draw.text((x + 6, y + 5), f"{kind.upper()} · row {row}", fill=(238, 238, 238, 255))
        preview.alpha_composite(bg, (x, y + label_h))
    preview_path = out_root / "enemy_runtime_type_preview.png"
    preview.save(preview_path, "PNG", optimize=True)

    return {
        "source": atlas_path.name,
        "atlasSize": list(atlas.size),
        "cellSize": cell,
        "rows": rows,
        "columns": cols,
        "typeRows": type_rows,
        "visibleFrames": len(frames),
        "emptyFrames": empty,
        "edgeTouches": edge_touches,
        "contactSheet": contact_path.name,
        "typePreview": preview_path.name,
        "frames": frames,
    }


def main() -> None:
    cfg = parse_args()
    url, cell, cols, rows, type_rows = parse_runtime_contract(cfg.gdscript)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pawnslug-enemy-smoke-") as tmp:
        report = export(acquire(url, Path(tmp)), cfg.output_dir, cell=cell, cols=cols, rows=rows, type_rows=type_rows)
    summary = {
        "schema": 1,
        "scope": "pawn-slug-godot-enemy-sprite-smoke",
        "runtimeUrl": url,
        **report,
    }
    (cfg.output_dir / "enemy_sprite_smoke.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        "OK enemy sprite smoke: "
        f"{report['visibleFrames']} visible frames, "
        f"{len(report['emptyFrames'])} empty, "
        f"{len(report['edgeTouches'])} edge-touch warnings, "
        f"{len(type_rows)} runtime type mappings"
    )


if __name__ == "__main__":
    main()
, re.M)
MAP_ROW_RE = re.compile(r'"(?P<type>[a-z0-9_-]+)"\s*:\s*(?P<row>\d+)')


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gdscript", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    return parser.parse_args()


def parse_runtime_contract(path: Path) -> tuple[str, int, int, int, dict[str, int]]:
    text = path.read_text(encoding="utf-8")
    url_match = URL_RE.search(text)
    frame_match = FRAME_RE.search(text)
    rows_match = ROWS_RE.search(text)
    cols_match = COLS_RE.search(text)
    map_match = MAP_BLOCK_RE.search(text)
    if not all((url_match, frame_match, rows_match, cols_match, map_match)):
        raise SystemExit("enemy_visual.gd lost the remote enemy atlas contract")

    width = int(round(float(frame_match.group("w"))))
    height = int(round(float(frame_match.group("h"))))
    if width != height:
        raise SystemExit(f"enemy atlas cells must be square, got {width}x{height}")
    rows = int(rows_match.group("rows"))
    cols = int(cols_match.group("cols"))
    type_rows = {
        match.group("type"): int(match.group("row"))
        for match in MAP_ROW_RE.finditer(map_match.group("body"))
    }
    if not type_rows:
        raise SystemExit("REMOTE_TYPE_ROW contains no enemy mappings")
    invalid = {kind: row for kind, row in type_rows.items() if row < 0 or row >= rows}
    if invalid:
        raise SystemExit(f"enemy type rows outside atlas: {invalid}")
    return url_match.group("url"), width, cols, rows, type_rows


def acquire(source: str, temp_dir: Path) -> Path:
    parsed = urllib.parse.urlparse(source)
    target = temp_dir / (Path(parsed.path).name or "enemy-atlas.webp")
    request = urllib.request.Request(source, headers={"User-Agent": "ChessStudio-PawnSlug-Enemy-Smoke/1"})
    last_error = None
    for attempt in range(1, 4):
        try:
            with urllib.request.urlopen(request, timeout=30) as response, target.open("wb") as stream:
                shutil.copyfileobj(response, stream)
            return target
        except Exception as exc:
            last_error = exc
            if target.exists():
                target.unlink()
            if attempt == 3:
                break
    raise SystemExit(f"failed to download {source} after 3 attempts: {last_error}")


def checkerboard(size: tuple[int, int], tile: int = 10) -> Image.Image:
    image = Image.new("RGBA", size, (238, 238, 238, 255))
    draw = ImageDraw.Draw(image)
    alt = (205, 205, 205, 255)
    for y in range(0, size[1], tile):
        for x in range(0, size[0], tile):
            if ((x // tile) + (y // tile)) % 2:
                draw.rectangle((x, y, min(x + tile - 1, size[0] - 1), min(y + tile - 1, size[1] - 1)), fill=alt)
    return image


def label(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str) -> None:
    x, y = xy
    draw.rectangle((x - 4, y - 3, x + max(68, len(text) * 7), y + 15), fill=(10, 12, 14, 210))
    draw.text((x, y), text, fill=(244, 240, 226, 255))


def export(atlas_path: Path, out_root: Path, *, cell: int, cols: int, rows: int, type_rows: dict[str, int]) -> dict:
    atlas = Image.open(atlas_path).convert("RGBA")
    expected = (cols * cell, rows * cell)
    if atlas.size != expected:
        raise SystemExit(f"enemy atlas size {atlas.size}, expected {expected}")

    frames_dir = out_root / "frames"
    frames_dir.mkdir(parents=True, exist_ok=True)

    contact = checkerboard(expected)
    contact.alpha_composite(atlas)
    draw = ImageDraw.Draw(contact)
    for x in range(0, expected[0] + 1, cell):
        draw.line((x, 0, x, expected[1]), fill=(70, 70, 70, 180), width=1)
    for y in range(0, expected[1] + 1, cell):
        draw.line((0, y, expected[0], y), fill=(70, 70, 70, 180), width=1)

    row_types: dict[int, list[str]] = {}
    for kind, row in sorted(type_rows.items()):
        row_types.setdefault(row, []).append(kind)
    for row, kinds in row_types.items():
        label(draw, (6, row * cell + 5), f"r{row}: {', '.join(kinds)}")

    frames: list[dict] = []
    empty: list[str] = []
    edge_touches: list[dict] = []
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
            frame_path = frames_dir / f"enemy_{key}.png"
            frame.save(frame_path, "PNG", optimize=True)
            frames.append({"frame": key, "bbox": list(bbox), "file": str(frame_path.relative_to(out_root))})

    contact_path = out_root / "enemy_runtime_contact_sheet.png"
    contact.save(contact_path, "PNG", optimize=True)

    tile = 180
    label_h = 24
    types = sorted(type_rows)
    preview_cols = 4
    preview_rows = (len(types) + preview_cols - 1) // preview_cols
    preview = Image.new("RGBA", (preview_cols * tile, preview_rows * (tile + label_h)), (20, 22, 25, 255))
    preview_draw = ImageDraw.Draw(preview)
    for index, kind in enumerate(types):
        row = type_rows[kind]
        frame = atlas.crop((0, row * cell, cell, row * cell + cell))
        bg = checkerboard((tile, tile), tile=18)
        sprite = frame.resize((tile, tile), Image.Resampling.NEAREST)
        bg.alpha_composite(sprite)
        x = (index % preview_cols) * tile
        y = (index // preview_cols) * (tile + label_h)
        preview_draw.text((x + 6, y + 5), f"{kind.upper()} · row {row}", fill=(238, 238, 238, 255))
        preview.alpha_composite(bg, (x, y + label_h))
    preview_path = out_root / "enemy_runtime_type_preview.png"
    preview.save(preview_path, "PNG", optimize=True)

    return {
        "source": atlas_path.name,
        "atlasSize": list(atlas.size),
        "cellSize": cell,
        "rows": rows,
        "columns": cols,
        "typeRows": type_rows,
        "visibleFrames": len(frames),
        "emptyFrames": empty,
        "edgeTouches": edge_touches,
        "contactSheet": contact_path.name,
        "typePreview": preview_path.name,
        "frames": frames,
    }


def main() -> None:
    cfg = parse_args()
    url, cell, cols, rows, type_rows = parse_runtime_contract(cfg.gdscript)
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="pawnslug-enemy-smoke-") as tmp:
        report = export(acquire(url, Path(tmp)), cfg.output_dir, cell=cell, cols=cols, rows=rows, type_rows=type_rows)
    summary = {
        "schema": 1,
        "scope": "pawn-slug-godot-enemy-sprite-smoke",
        "runtimeUrl": url,
        **report,
    }
    (cfg.output_dir / "enemy_sprite_smoke.json").write_text(
        json.dumps(summary, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(
        "OK enemy sprite smoke: "
        f"{report['visibleFrames']} visible frames, "
        f"{len(report['emptyFrames'])} empty, "
        f"{len(report['edgeTouches'])} edge-touch warnings, "
        f"{len(type_rows)} runtime type mappings"
    )


if __name__ == "__main__":
    main()
