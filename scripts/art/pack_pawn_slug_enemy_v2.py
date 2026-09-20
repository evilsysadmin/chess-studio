#!/usr/bin/env python3
"""Normalize image-generated Pawn Slug enemy worksheets into Godot-safe atlases.

Input worksheets are expected to contain a 4x4 logical grid. The source image is
allowed to have dimensions not divisible by four (image generation commonly
returns 1254x1254); logical cell boundaries are derived proportionally instead
of with lossy integer division.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

from png_contract import save_png_contract, sha256_file

ENEMY_TYPES = (
    "pawn",
    "knight",
    "rook",
    "queen",
    "grenadier",
    "scout",
    "commando",
    "shield",
    "bishop",
)
GRID_COLUMNS = 4
GRID_ROWS = 4
CELL_WIDTH = 256
CELL_HEIGHT = 416
PIVOT_X = CELL_WIDTH // 2
FOOT_LINE = 392
CELL_GUTTER = 12
MAX_BODY_WIDTH = CELL_WIDTH - CELL_GUTTER * 2
MAX_BODY_HEIGHT = FOOT_LINE - CELL_GUTTER


@dataclass(frozen=True)
class PackedFrame:
    index: int
    source_region: tuple[int, int, int, int]
    source_bbox: tuple[int, int, int, int]
    region: tuple[int, int, int, int]
    content_bbox: tuple[int, int, int, int]


def _grid_edges(size: int, cells: int) -> list[int]:
    return [round(i * size / cells) for i in range(cells + 1)]


def _alpha_bbox(image: Image.Image, *, threshold: int = 4) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A")
    if threshold <= 1:
        return alpha.getbbox()
    mask = alpha.point(lambda value: 255 if value >= threshold else 0)
    return mask.getbbox()


def _normalize_frame(source_cell: Image.Image) -> tuple[Image.Image, tuple[int, int, int, int]]:
    rgba = source_cell.convert("RGBA")
    bbox = _alpha_bbox(rgba)
    if bbox is None:
        raise ValueError("source frame is fully transparent")
    trimmed = rgba.crop(bbox)
    scale = min(MAX_BODY_WIDTH / trimmed.width, MAX_BODY_HEIGHT / trimmed.height)
    if scale <= 0:
        raise ValueError("invalid frame scale")
    size = (
        max(1, round(trimmed.width * scale)),
        max(1, round(trimmed.height * scale)),
    )
    if size != trimmed.size:
        trimmed = trimmed.resize(size, Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (CELL_WIDTH, CELL_HEIGHT), (0, 0, 0, 0))
    x = PIVOT_X - trimmed.width // 2
    y = FOOT_LINE - trimmed.height
    if x < CELL_GUTTER or x + trimmed.width > CELL_WIDTH - CELL_GUTTER:
        raise ValueError(f"normalized frame exceeds horizontal gutter: x={x}, width={trimmed.width}")
    if y < CELL_GUTTER or y + trimmed.height > FOOT_LINE:
        raise ValueError(f"normalized frame exceeds vertical gutter: y={y}, height={trimmed.height}")
    canvas.alpha_composite(trimmed, (x, y))
    content = _alpha_bbox(canvas)
    if content is None:
        raise ValueError("normalized frame unexpectedly empty")
    return canvas, content


def split_worksheet(image: Image.Image) -> Iterable[tuple[int, tuple[int, int, int, int], Image.Image]]:
    x_edges = _grid_edges(image.width, GRID_COLUMNS)
    y_edges = _grid_edges(image.height, GRID_ROWS)
    index = 0
    for row in range(GRID_ROWS):
        for col in range(GRID_COLUMNS):
            region = (x_edges[col], y_edges[row], x_edges[col + 1], y_edges[row + 1])
            yield index, region, image.crop(region)
            index += 1


def pack_type(enemy_type: str, worksheet_path: Path, output_dir: Path) -> dict:
    source = Image.open(worksheet_path).convert("RGBA")
    if source.width < GRID_COLUMNS or source.height < GRID_ROWS:
        raise ValueError(f"{worksheet_path} is too small for a 4x4 worksheet")
    if source.getchannel("A").getextrema()[0] == 255:
        raise ValueError(f"{worksheet_path} has no transparent pixels; transparent worksheet required")

    atlas = Image.new("RGBA", (GRID_COLUMNS * CELL_WIDTH, GRID_ROWS * CELL_HEIGHT), (0, 0, 0, 0))
    frames: list[PackedFrame] = []
    for index, source_region, source_cell in split_worksheet(source):
        source_bbox = _alpha_bbox(source_cell)
        if source_bbox is None:
            raise ValueError(f"{worksheet_path}: frame {index} is empty")
        normalized, content_bbox = _normalize_frame(source_cell)
        row, col = divmod(index, GRID_COLUMNS)
        x, y = col * CELL_WIDTH, row * CELL_HEIGHT
        atlas.alpha_composite(normalized, (x, y))
        frames.append(
            PackedFrame(
                index=index,
                source_region=source_region,
                source_bbox=source_bbox,
                region=(x, y, CELL_WIDTH, CELL_HEIGHT),
                content_bbox=(
                    x + content_bbox[0],
                    y + content_bbox[1],
                    x + content_bbox[2],
                    y + content_bbox[3],
                ),
            )
        )

    atlas_path = output_dir / f"enemy-{enemy_type}-v2.png"
    save_png_contract(atlas, atlas_path)
    return {
        "type": enemy_type,
        "source": worksheet_path.name,
        "sourceSha256": sha256_file(worksheet_path),
        "sourceSize": [source.width, source.height],
        "atlas": atlas_path.name,
        "atlasSha256": sha256_file(atlas_path),
        "atlasSize": [atlas.width, atlas.height],
        "frames": [
            {
                "index": frame.index,
                "sourceRegion": list(frame.source_region),
                "sourceAlphaBBox": list(frame.source_bbox),
                "region": list(frame.region),
                "contentBBox": list(frame.content_bbox),
            }
            for frame in frames
        ],
    }


def build_review(manifest: dict, output_dir: Path) -> Path:
    tile_w, tile_h = 300, 360
    cols = 3
    rows = (len(manifest["types"]) + cols - 1) // cols
    review = Image.new("RGBA", (cols * tile_w, rows * tile_h), (24, 25, 27, 255))
    draw = ImageDraw.Draw(review)
    for index, item in enumerate(manifest["types"]):
        atlas = Image.open(output_dir / item["atlas"]).convert("RGBA")
        frame = atlas.crop((0, 0, CELL_WIDTH, CELL_HEIGHT))
        frame.thumbnail((tile_w - 24, tile_h - 56), Image.Resampling.LANCZOS)
        x = (index % cols) * tile_w
        y = (index // cols) * tile_h
        draw.text((x + 10, y + 8), item["type"].upper(), fill=(240, 238, 226, 255))
        review.alpha_composite(frame, (x + (tile_w - frame.width) // 2, y + 38))
    out = output_dir / "enemy-v2-review.png"
    save_png_contract(review, out)
    return out


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--types", nargs="*", default=list(ENEMY_TYPES), choices=ENEMY_TYPES)
    return parser.parse_args()


def main() -> None:
    cfg = parse_args()
    cfg.output_dir.mkdir(parents=True, exist_ok=True)
    packed = []
    for enemy_type in cfg.types:
        source = cfg.source_dir / f"enemy-{enemy_type}-worksheet.png"
        if not source.is_file():
            raise SystemExit(f"missing worksheet: {source}")
        packed.append(pack_type(enemy_type, source, cfg.output_dir))

    manifest = {
        "schema": 2,
        "scope": "pawn-slug-godot-enemy-v2",
        "cell": [CELL_WIDTH, CELL_HEIGHT],
        "grid": [GRID_COLUMNS, GRID_ROWS],
        "pivot": [PIVOT_X, FOOT_LINE],
        "footLine": FOOT_LINE,
        "gutter": CELL_GUTTER,
        "framesPerType": GRID_COLUMNS * GRID_ROWS,
        "types": packed,
    }
    review_path = build_review(manifest, cfg.output_dir)
    manifest["review"] = review_path.name
    manifest["reviewSha256"] = sha256_file(review_path)
    manifest_path = cfg.output_dir / "enemy-v2-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"OK: packed {len(packed)} enemy types into {len(packed)} mobile-safe 1024x1664 atlases")


if __name__ == "__main__":
    main()
