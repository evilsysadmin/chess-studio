#!/usr/bin/env python3
from __future__ import annotations

import copy
import hashlib
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw
from chesscom_sven_bank_v38 import (
    DIRECTIONS, CLIPS, CLIP_COUNTS, FOOT_PIVOT,
    assemble_runtime_manifest, build_chesscom_sven_bank,
)
from sprite_forge import BankContractError, load_bank_contract

HERE = Path(__file__).parent
CONTRACT = HERE / "contracts" / "chesscom_sven_v38.json"


def forge_fixture() -> dict:
    parts = {c: {"columns": n, "rows": 8} for c, n in CLIP_COUNTS.items()}
    animations = []
    for clip in CLIPS:
        for row, direction in enumerate(DIRECTIONS):
            animations.append({
                "name": f"{clip}_{direction}", "part": clip, "row": row,
                "fps": 10., "regions": [
                    {"x": i * 128, "y": row * 192, "width": 128, "height": 192}
                    for i in range(CLIP_COUNTS[clip])
                ],
            })
    return {"schema": 2, "surface": "chesscom", "actor": "sven",
            "variant": "master-v1", "cell": {"width": 128, "height": 192},
            "parts": parts, "animations": animations}


def authored_fixture(path: Path, clip: str, direction: str, frame: int) -> None:
    """Unique connected RGBA figure, boots sharing one stable footline."""
    image = Image.new("RGBA", (128, 192), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # Keep size/footline stable; vary uniform shapes slightly per direction.
    dx = DIRECTIONS.index(direction) - 3
    change = frame if CLIP_COUNTS[clip] > 1 else 0
    draw.rectangle((50 + dx, 50, 75 + dx, 179), fill=(35 + CLIPS.index(clip)*13, 80, 120, 255))
    draw.rectangle((49 + dx + change, 88, 76 + dx + change, 129),
                   fill=(55 + CLIPS.index(clip)*11, 95 + frame * 13, 132, 255))
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG")


class SvenProductionBankV38Tests(unittest.TestCase):
    def test_committed_contract_contains_eight_real_directions_per_animation(self):
        c = load_bank_contract(CONTRACT)
        self.assertEqual(c["surface"], "chesscom")
        self.assertEqual(c["actor"], "sven")
        self.assertEqual(len(c["animations"]), 48)
        self.assertEqual(set(c["parts"]), set(CLIPS))
        self.assertEqual(sum(a["authored_frames"] for a in c["animations"]), 96)
        self.assertTrue(all(a["allowed_detached_components"] == 0 for a in c["animations"]))

    def test_runtime_adapter_has_96_unique_non_overlapping_frames(self):
        a = assemble_runtime_manifest(forge_fixture(), "a"*64)
        self.assertEqual(a["cell"], {"width": 128, "height": 192})
        self.assertEqual(a["pivot"], {"x": 64, "y": 180})
        self.assertEqual(a["atlas"]["width"], 1536)
        self.assertEqual(a["atlas"]["height"], 1536)
        rects = set()
        for clip in CLIPS:
            self.assertEqual(set(a["clips"][clip]["directions"]), set(DIRECTIONS))
            for direction in DIRECTIONS:
                frames = a["clips"][clip]["directions"][direction]
                self.assertEqual(len(frames), CLIP_COUNTS[clip])
                for f in frames:
                    rect = (f["x"], f["y"])
                    self.assertNotIn(rect, rects)
                    rects.add(rect)
                    self.assertEqual((f["pivotX"],f["pivotY"]), FOOT_PIVOT)
        self.assertEqual(len(rects), 96)

    def test_fail_closed_on_wrong_direction_and_corrupt_hash(self):
        fixture = forge_fixture()
        fixture["animations"][0]["name"] = "idle_BAD"
        with self.assertRaisesRegex(BankContractError, "wrong-authored-sequence"):
            assemble_runtime_manifest(fixture, "a"*64)
        with self.assertRaisesRegex(BankContractError, "bad-atlas-sha"):
            assemble_runtime_manifest(forge_fixture(), "not-a-sha")

    def test_missing_real_assets_cannot_publish_fabricated_atlas(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            with self.assertRaisesRegex(BankContractError, "missing-or-extra-frames"):
                build_chesscom_sven_bank(CONTRACT, root / "no-frames", root / "out")
            self.assertFalse((root / "out" / "sven-bank-v1.json").exists())

    def test_duplicate_other_direction_is_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            # Deliberately build the complete authored tree, no flips or holds.
            for clip in CLIPS:
                for direction in DIRECTIONS:
                    for frame in range(CLIP_COUNTS[clip]):
                        authored_fixture(root / clip / direction / f"{frame:03d}.png", clip, direction, frame)
            # Replace NE with byte-identical N, even if PNG metadata differs.
            for i in range(CLIP_COUNTS["walk"]):
                (root/"walk"/"NE"/f"{i:03d}.png").write_bytes(
                    (root/"walk"/"N"/f"{i:03d}.png").read_bytes()
                )
            with self.assertRaisesRegex(BankContractError, "duplicate-direction-pixels"):
                build_chesscom_sven_bank(CONTRACT, root, root/"out")
            self.assertFalse((root/"out"/"sven-bank-v1.webp").exists())


if __name__ == "__main__":
    unittest.main()
