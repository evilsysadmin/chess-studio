#!/usr/bin/env python3
"""Native regression coverage for first-party canonical art and rig gates."""
from __future__ import annotations
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from chesscom_owned_master_v40 import (
    ROOT, ORIGINALS, audit_candidate, glb_document, verify_original_art,
)


def sample_glb(*, rig=True, weapon=True, weights=True, missing_bone=False) -> bytes:
    names = [
        "Root", "Pelvis", "Spine", "Spine1", "Head", "mixamorig:LeftHand",
        "mixamorig:RightHand", "mixamorig:LeftFoot", "mixamorig:RightFoot",
        "LeftArm", "RightArm", "LeftForeArm", "RightForeArm", "LeftLeg", "RightLeg",
        "LeftUpLeg", "RightUpLeg",
    ]
    if missing_bone:
        names[6] = "ElbowNotAHand"
    nodes = [{"name": name} for name in names]
    nodes.append({"name": "SvenBody", "mesh": 0, **({"skin": 0} if rig else {})})
    if weapon:
        nodes.append({"name": "SvenCarbine", "mesh": 1})
    attributes = {"POSITION": 0}
    if weights:
        attributes.update(JOINTS_0=1, WEIGHTS_0=2)
    document = {
        "asset": {"version": "2.0"},
        "nodes": nodes,
        "skins": [{"joints": list(range(len(names)))}] if rig else [],
        "meshes": [{"primitives": [{"attributes": attributes}]}, {"primitives": [{"attributes": {"POSITION": 0}}]}],
    }
    payload = json.dumps(document).encode("utf-8")
    payload += b" " * (-len(payload) % 4)
    return struct.pack("<4sII", b"glTF", 2, 20 + len(payload)) + struct.pack("<I4s", len(payload), b"JSON") + payload


class OwnedMasterTests(unittest.TestCase):
    def test_first_party_art_is_pinned_to_original_git_blobs(self):
        sources = verify_original_art(ROOT)
        self.assertEqual(set(sources), set(ORIGINALS))
        self.assertTrue(all(len(item["sha256"]) == 64 for item in sources.values()))

    def test_reject_tampered_original_art(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for relative, _ in ORIGINALS.values():
                dest = root / relative
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes((ROOT / relative).read_bytes())
            first = root / ORIGINALS["sven-portrait"][0]
            first.write_bytes(first.read_bytes() + b"tampered")
            with self.assertRaisesRegex(ValueError, "first-party-art-mismatch"):
                verify_original_art(root)

    def run_audit(self, payload, sha_override=None):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "candidate.glb"
            path.write_bytes(payload)
            return audit_candidate(path, sha_override or hashlib.sha256(payload).hexdigest())

    def test_valid_rigged_authored_candidate_is_still_review_only(self):
        result = self.run_audit(sample_glb())
        self.assertEqual(result["joints"], 17)
        self.assertEqual(result["weapon_mesh_nodes"], ["SvenCarbine"])
        self.assertTrue(result["review_only"])
        self.assertFalse(result["artistic_approval"])

    def test_wrong_sha_or_static_model_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "sha256-required"):
            self.run_audit(sample_glb(), "not-a-hash")
        with self.assertRaisesRegex(ValueError, "sha256-mismatch"):
            self.run_audit(sample_glb(), "0" * 64)
        with self.assertRaisesRegex(ValueError, "missing-skin-or-mesh"):
            self.run_audit(sample_glb(rig=False))

    def test_missing_weapon_weights_or_hands_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "missing-weapon-mesh"):
            self.run_audit(sample_glb(weapon=False))
        with self.assertRaisesRegex(ValueError, "mesh-has-no-weights"):
            self.run_audit(sample_glb(weights=False))
        with self.assertRaisesRegex(ValueError, "missing-anatomical-bones"):
            self.run_audit(sample_glb(missing_bone=True))

    def test_corrupt_container_is_not_accepted(self):
        with self.assertRaisesRegex(ValueError, "invalid-glb-header"):
            glb_document(b"not a GLB")
        with self.assertRaisesRegex(ValueError, "invalid-glb-header"):
            glb_document(sample_glb()[:-1])


if __name__ == "__main__":
    unittest.main()
