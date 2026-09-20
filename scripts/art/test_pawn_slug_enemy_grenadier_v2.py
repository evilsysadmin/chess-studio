#!/usr/bin/env python3
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

from derive_pawn_slug_enemy_grenadier_v2 import CELL, FRAMES, build


def make_source(path: Path) -> None:
    atlas = Image.new("RGBA", (640, 240), (0, 0, 0, 0))
    d = ImageDraw.Draw(atlas)
    for i in range(FRAMES):
        x = i * CELL
        d.rectangle((x + 20, 20, x + 66, 69), fill=(72, 63, 50, 255))
        d.rectangle((x + 18, 69, x + 63, 75), fill=(44, 39, 32, 255))
    atlas.save(path, "PNG")


class GrenadierV2Tests(unittest.TestCase):
    def test_grenadier_changes_upper_profile_without_moving_feet(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            src, out = root / "source.png", root / "out"
            make_source(src)
            report = build(src, out)
            result = Image.open(out / report["output"]).convert("RGBA")
            base = Image.open(src).convert("RGBA").crop((0, 0, 640, 80))
            self.assertEqual(result.size, (640, 80))
            self.assertIsNotNone(ImageChops.difference(result, base).getbbox())
            for i in range(FRAMES):
                before = base.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                after = result.crop((i * CELL, 0, (i + 1) * CELL, CELL)).getchannel("A").getbbox()
                self.assertEqual(after[3], before[3])
                self.assertGreaterEqual(after[2], before[2])


if __name__ == "__main__":
    unittest.main()
