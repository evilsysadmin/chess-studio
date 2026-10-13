#!/usr/bin/env python3
"""Offline source-provenance + GLB metadata tests; no Blender needed."""
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from chesscom_oss_source_v52 import git_blob_hash, verify_source_bytes, glb_summary, intake


def sample(animations=()):
    doc = {"asset": {"version": "2.0"}, "meshes": [{"primitives": []}],
           "skins": [{"joints": [0]}],
           "animations": [{"name": name} for name in animations]}
    raw = json.dumps(doc).encode()
    raw += b" " * (-len(raw) % 4)
    return struct.pack("<4sII", b"glTF", 2, len(raw) + 20) + struct.pack("<I4s", len(raw), b"JSON") + raw


class OssSourceTests(unittest.TestCase):
    def test_known_git_blob(self):
        self.assertEqual(git_blob_hash(b"hello"), "b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0")

    def test_pinning_accepts_only_exact_bytes(self):
        data = sample(("Walk",))
        self.assertEqual(verify_source_bytes(data, len(data), git_blob_hash(data)),
                         hashlib.sha256(data).hexdigest())
        with self.assertRaisesRegex(ValueError, "size"):
            verify_source_bytes(data, len(data) + 1, git_blob_hash(data))
        with self.assertRaisesRegex(ValueError, "git-blob"):
            verify_source_bytes(data, len(data), "a" * 40)

    def test_glb_summary_is_factual_not_faked(self):
        self.assertEqual(glb_summary(sample(("Idle", "Walk")))["animation_names"],
                         ["Idle", "Walk"])
        self.assertEqual(glb_summary(sample())["animation_count"], 0)
        with self.assertRaisesRegex(ValueError, "invalid-glb-header"):
            glb_summary(b"not-a-glb")

    def test_no_autopromotion_even_after_verified_source(self):
        data = sample()
        # Exercise no-network intake with explicit monkeypatch of pinned source,
        # keeping the real pinned constant immutable for CI.
        import chesscom_oss_source_v52 as module
        original = module.verify_source_bytes
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "source.glb"
            out = Path(d) / "receipt.json"
            path.write_bytes(data)
            try:
                module.verify_source_bytes = lambda blob: verify_source_bytes(
                    blob, len(data), git_blob_hash(data))
                report = intake(path, out)
            finally:
                module.verify_source_bytes = original
            self.assertFalse(report["promotion_allowed"])
            self.assertFalse(report["is_canonical_sven"])
            self.assertTrue(report["review_only"])
            self.assertEqual(json.loads(out.read_text())["sha256"],
                             hashlib.sha256(data).hexdigest())


if __name__ == "__main__":
    unittest.main()
