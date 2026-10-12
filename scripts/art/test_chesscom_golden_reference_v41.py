#!/usr/bin/env python3
"""Fail-closed reference checks. No original user-owned PNG is shipped to CI."""
from __future__ import annotations
import copy
import hashlib
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from chesscom_golden_reference_v41 import read_contract, verify_golden_image, build_contact_sheet, ACTORS


class GoldenArtContractTests(unittest.TestCase):
    def test_real_contract_is_complete_and_first_party(self):
        spec = read_contract()
        self.assertEqual(len(spec["regions"]), 6)
        self.assertEqual(set(spec["identities"]), set(ACTORS))
        self.assertEqual(spec["reference"]["sha256"], "001f58bcc46dfe2a3a7f901e141c186bf9149b524ac5476e44a2e89ae737ef01")
        self.assertTrue(spec["acceptance"]["render_only_until_approved"])

    def test_missing_region_or_invalid_box_is_rejected(self):
        import json
        real = read_contract()
        with tempfile.TemporaryDirectory() as temp:
            contract = Path(temp) / "reference.json"
            for mutate, error in [
                (lambda d: d["regions"].pop(), "missing-original-regions"),
                (lambda d: d["regions"][0].update(box=[0, 0, 9999, 200]), "out-of-bounds-region"),
                (lambda d: d.update(review_only=False), "unreviewed-asset-promotion"),
                (lambda d: d["regions"][0].update(id="external-generic-swat"), "invalid-region-identity"),
            ]:
                data = copy.deepcopy(real)
                mutate(data)
                contract.write_text(json.dumps(data))
                with self.assertRaisesRegex(ValueError, error):
                    read_contract(contract)

    def test_synthetic_fixture_exercises_sha_and_contact_sheet_without_publishing(self):
        spec = copy.deepcopy(read_contract())
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / "sample.png"
            out = Path(temp) / "out"
            Image.new("RGB", (1536, 1024), "#34434c").save(path)
            spec["reference"]["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
            actual = verify_golden_image(path, spec)
            self.assertEqual(actual["size"], [1536, 1024])
            report = build_contact_sheet(path, out, spec)
            self.assertEqual(len(report["reference_region_ids"]), 6)
            self.assertTrue(report["NOT_a_runtime_atlas"])
            self.assertEqual(Image.open(out / "chesscom-golden-review-v41.png").size, (1260, 640))
            path.write_bytes(path.read_bytes() + b"tamper")
            with self.assertRaisesRegex(ValueError, "wrong-original-image-sha256"):
                verify_golden_image(path, spec)


if __name__ == "__main__":
    unittest.main()
