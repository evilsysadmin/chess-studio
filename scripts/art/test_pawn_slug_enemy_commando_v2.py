#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from derive_pawn_slug_enemy_commando_v2 import CELL, FRAMES, build, source_from_gdscript


def make_source(path: Path) -> None:
    atlas = Image.new("RGBA", (640, 240), (0, 0, 0, 0))
    draw = ImageDraw.Draw(atlas)
    for i in range(FRAMES):
        x = i * CELL
        draw.rectangle((x + 18, 18, x + 68, 69), fill=(80, 70, 55, 255))
        draw.rectangle((x + 5, 26, x + 45, 29), fill=(55, 48, 38, 255))
        draw.rectangle((x + 22, 69, x + 62, 75), fill=(45, 40, 34, 255))
    atlas.save(path, "PNG")


class CommandoV2Tests(unittest.TestCase):
    def test_derivation_keeps_eight_cells_and_changes_silhouette(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            source = root / "source.png"
            out = root / "out"
            make_source(source)
            report = build(source, out)
            result = Image.open(out / report["output"]).convert("RGBA")
            base = Image.open(source).convert("RGBA").crop((0, 0, 640, 80))
            self.assertEqual(result.size, (640, 80))
            self.assertEqual(len(report["frames"]), 8)
            self.assertIsNotNone(ImageChops.difference(result, base).getbbox())
            for i in range(FRAMES):
                before = base.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                after = result.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                self.assertEqual(after[3], before[3], "derived kit must not move the foot line")

    def test_reads_runtime_url_from_gdscript(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "enemy_visual.gd"
            path.write_text('const BODY_ATLAS_URL := "https://assets.example/enemy.webp"\n', encoding="utf-8")
            self.assertEqual(source_from_gdscript(path), "https://assets.example/enemy.webp")


if __name__ == "__main__":
    unittest.main()
