#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from derive_pawn_slug_enemy_shield_v2 import CELL, FRAMES, SOURCE_ROW, build


def make_source(path: Path) -> None:
    atlas = Image.new("RGBA", (640, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(atlas)
    for i in range(FRAMES):
        x = i * CELL
        y = SOURCE_ROW * CELL
        d.rectangle((x + 26, y + 18, x + 69, y + 70), fill=(70, 61, 52, 255))
        d.rectangle((x + 22, y + 70, x + 64, y + 75), fill=(45, 40, 34, 255))
    atlas.save(path, "PNG")


class ShieldV2Tests(unittest.TestCase):
    def test_shield_changes_silhouette_without_moving_feet(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src, out = root / "source.png", root / "out"
            make_source(src)
            report = build(src, out)
            result = Image.open(out / report["output"]).convert("RGBA")
            base = Image.open(src).convert("RGBA").crop((0, 160, 640, 240))
            self.assertEqual(result.size, (640, 80))
            self.assertEqual(len(report["frames"]), 8)
            self.assertIsNotNone(ImageChops.difference(result, base).getbbox())
            for i in range(FRAMES):
                before = base.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                after = result.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                self.assertEqual(after[3], before[3])
                self.assertLess(after[0], before[0], "shield should extend the front silhouette")


if __name__ == "__main__":
    unittest.main()
