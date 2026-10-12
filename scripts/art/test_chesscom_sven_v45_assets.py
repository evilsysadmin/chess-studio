"""Integrity QA for the two extracts of the *existing* Sven V45 sheet.

No image generation; ensure only admitted SHA-locked derivatives are included.
"""
from __future__ import annotations
import hashlib
import unittest
from pathlib import Path

from PIL import Image

ROOT=Path(__file__).resolve().parents[2]
V45={
    "sven-v45-front.webp":{
        "sha":"58c7cd696af5adf5c08395bbf8c7b2446209d830a686b0499a9b51782631d5bd",
        "size":(179,410),"mode":"RGBA",
    },
    "sven-v45-portrait.webp":{
        "sha":"a3fa7fef04cc1c930a79a754924fe6750d4f86e395d539c0dbc50fdea35b85b0",
        "size":(256,256),"mode":"RGB",
    },
}

class SvenV45SourceTests(unittest.TestCase):
    def test_crops_are_exact_and_sprite_has_real_alpha(self):
        for filename, expected in V45.items():
            with self.subTest(filename=filename):
                data=(ROOT/"frontend/public/chesscom"/filename).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(),expected["sha"])
                with Image.open(ROOT/"frontend/public/chesscom"/filename) as image:
                    image.load()
                    self.assertEqual(image.format,"WEBP")
                    self.assertEqual(image.size,expected["size"])
                    self.assertEqual(image.mode,expected["mode"])
                    if filename.endswith("-front.webp"):
                        alpha=image.getchannel("A")
                        self.assertEqual(alpha.getextrema(),(0,255))
                        self.assertGreater(sum(p>128 for p in alpha.getdata()),12_000)
                        self.assertLess(sum(p>128 for p in alpha.getdata()),image.width*image.height*.70)

if __name__=="__main__":
    unittest.main()
