#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from pack_pawn_slug_enemy_v2 import ENEMY_TYPES, FOOT_LINE, pack_type, build_review
from png_contract import PngContractError, clean_transparent_rgb, save_png_contract, validate_png_contract
from validate_pawn_slug_enemy_v2 import validate_manifest


def synthetic_worksheet(path: Path, seed: int = 0) -> None:
    # Deliberately 1254x1254: this guards against the old 313.5px-grid bug.
    image = Image.new("RGBA", (1254, 1254), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    x_edges = [round(i * image.width / 4) for i in range(5)]
    y_edges = [round(i * image.height / 4) for i in range(5)]
    for row in range(4):
        for col in range(4):
            left, right = x_edges[col], x_edges[col + 1]
            top, bottom = y_edges[row], y_edges[row + 1]
            pad_x = 48 + ((row + col + seed) % 4) * 8
            pad_top = 24 + ((row * 3 + col + seed) % 4) * 6
            pad_bottom = 14 + ((row + col * 2 + seed) % 3) * 5
            draw.rounded_rectangle(
                (left + pad_x, top + pad_top, right - pad_x, bottom - pad_bottom),
                radius=18,
                fill=(80 + seed * 7 % 120, 110 + row * 12, 120 + col * 10, 255),
            )
    save_png_contract(image, path)


class EnemyV2PipelineTests(unittest.TestCase):
    def test_1254_worksheet_packs_to_integer_grid_and_fixed_footline(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src = root / "enemy-pawn-worksheet.png"
            out = root / "out"
            out.mkdir()
            synthetic_worksheet(src)
            item = pack_type("pawn", src, out)
            self.assertEqual(item["sourceSize"], [1254, 1254])
            self.assertEqual(item["atlasSize"], [1024, 1664])
            self.assertEqual(len(item["frames"]), 16)
            widths = {frame["sourceRegion"][2] - frame["sourceRegion"][0] for frame in item["frames"]}
            self.assertEqual(widths, {313, 314})
            for frame in item["frames"]:
                self.assertEqual(frame["contentBBox"][3] % 416, FOOT_LINE)

    def test_full_manifest_validates_for_all_nine_types(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source_dir = root / "src"
            out = root / "out"
            source_dir.mkdir()
            out.mkdir()
            packed = []
            for seed, enemy_type in enumerate(ENEMY_TYPES):
                source = source_dir / f"enemy-{enemy_type}-worksheet.png"
                synthetic_worksheet(source, seed=seed)
                packed.append(pack_type(enemy_type, source, out))
            manifest = {
                "schema": 2,
                "scope": "pawn-slug-godot-enemy-v2",
                "cell": [256, 416],
                "grid": [4, 4],
                "pivot": [128, 392],
                "footLine": 392,
                "gutter": 12,
                "framesPerType": 16,
                "types": packed,
            }
            review = build_review(manifest, out)
            import hashlib
            manifest["review"] = review.name
            manifest["reviewSha256"] = hashlib.sha256(review.read_bytes()).hexdigest()
            manifest_path = out / "enemy-v2-manifest.json"
            manifest_path.write_text(json.dumps(manifest), encoding="utf-8")
            validated = validate_manifest(manifest_path)
            self.assertEqual(len(validated["types"]), 9)

    def test_png_contract_cleans_hidden_rgb_and_rejects_oversize_limit(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clean.png"
            dirty = Image.new("RGBA", (8, 8), (200, 50, 20, 0))
            save_png_contract(dirty, path)
            self.assertEqual(clean_transparent_rgb(dirty).getpixel((0, 0)), (0, 0, 0, 0))
            self.assertEqual(validate_png_contract(path)["width"], 8)
            with self.assertRaises(PngContractError"“ ¢fÆ–FFU÷æuö6öçG&7B‡F‚ÂÖ…÷6–FSÓB  ¦–bõöæÖUõòÓÒ%õöÖ–åõò# ¢Væ—GFW7BæÖ–â‚