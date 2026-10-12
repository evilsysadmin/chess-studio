#!/usr/bin/env python3
"""Provenance and fail-closed completeness tests with synthetic, local-only PNGs."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image, ImageChops
from chesscom_sven_source_handoff_v44 import prepare


def fixture(root):
    original = root / "original.png"
    Image.new("RGB", (1536, 1024), (31, 42, 59)).save(original)
    golden = {"identity": "chesscom-dust-veil-first-party-golden-v41",
              "review_only": True, "reference": {
                  "sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
                  "width": 1536, "height": 1024},
              "regions": [
                  {"actor": who, "kind": kind, "box": box}
                  for who in ("sven", "dieter", "matthias")
                  for kind, box in (("field", [100, 100, 275, 271]),
                                    ("portrait", [400, 800, 562, 942]))
              ]}
    contract = root / "contract.json"
    contract.write_text(json.dumps(golden))
    return original, contract


class SourceTests(unittest.TestCase):
    def test_no_invented_views_and_pixel_exactness(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            golden, contract = fixture(root)
            out = root / "handoff"
            result = prepare(golden, out, contract)
            self.assertEqual(result["readiness"], "blocked")
            self.assertTrue(result["NOT_a_3d_master"])
            self.assertFalse(result["external_upload_performed"])
            self.assertEqual(result["external_cost_incurred"], 0)
            self.assertEqual(set(result["original_crops"]), {"field", "portrait"})
            with Image.open(golden) as source:
                for entry in result["original_crops"].values():
                    with Image.open(out / entry["name"]) as crop:
                        self.assertEqual(list(crop.size), entry["size"])
                        self.assertIsNone(ImageChops.difference(
                            source.crop(entry["box"]).convert("RGB"), crop).getbbox())

    def test_any_tamper_rejects_before_artifacts(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            golden, contract = fixture(root)
            golden.write_bytes(golden.read_bytes() + b"tampered")
            with self.assertRaisesRegex(ValueError, "original-golden-sha256-mismatch"):
                prepare(golden, root / "out", contract)
            self.assertFalse((root / "out").exists())

    def test_clean_approved_image_is_still_only_manual_trial(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            golden, contract = fixture(root)
            body = root / "body.png"
            Image.new("RGB", (300, 300), "black").save(body)
            sha = hashlib.sha256(body.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "artist-approval-required"):
                prepare(golden, root / "no", contract, body, sha)
            with self.assertRaisesRegex(ValueError, "full-body-resolution-insufficient"):
                prepare(golden, root / "small", contract, body, sha, True)
            Image.new("RGB", (512, 768), "black").save(body)
            sha = hashlib.sha256(body.read_bytes()).hexdigest()
            result = prepare(golden, root / "ready", contract, body, sha, True)
            self.assertEqual(result["readiness"], "ready-for-consented-manual-trial")
            self.assertEqual(result["clean_full_body"]["anatomy_from_unseen_angles"], "UNVERIFIED")
            self.assertFalse(result["clean_full_body"]["consent_to_external_upload"])

if __name__ == "__main__":
    unittest.main()
