#!/usr/bin/env python3
"""Pure structural fixtures: not substitutes for authored Babylon/Blender QA."""
from __future__ import annotations
import hashlib
import json
import struct
import tempfile
import unittest
from pathlib import Path
from chesscom_actor_rig_gate_v47 import audit_playable_structure
from chesscom_owned_master_v40 import glb_document
from test_chesscom_owned_master_v40 import sample_glb

def fixture(*, omit=None, duplicate=False, bad_joint=False, detach=False, empty=False):
    doc = glb_document(sample_glb())
    weapon = len(doc["nodes"]) - 1
    muzzle = len(doc["nodes"])
    doc["nodes"].append({"name": "MuzzleSocket", "translation": [0.8, 0, 0]})
    if not detach:
        doc["nodes"][weapon]["children"] = [muzzle]
    doc["animations"] = []
    for clip in ("Idle", "Walk", "Fire", "Damage", "Death"):
        if clip == omit:
            continue
        doc["animations"].append({
            "name": clip, "samplers": [{}],
            "channels": [] if empty and clip == "Idle" else [
                {"sampler": 0, "target": {"node": weapon if bad_joint and clip == "Idle" else 5,
                                          "path": "rotation"}}
            ],
        })
    if duplicate:
        doc["animations"].append(dict(doc["animations"][0]))
    raw = json.dumps(doc).encode()
    raw += b" " * (-len(raw) % 4)
    return struct.pack("<4sII", b"glTF", 2, len(raw) + 20) + struct.pack("<I4s", len(raw), b"JSON") + raw

def audit_bytes(data):
    with tempfile.TemporaryDirectory() as d:
        path = Path(d) / "actor.glb"
        path.write_bytes(data)
        return audit_playable_structure(path, hashlib.sha256(data).hexdigest())

class AuthoredActorGateTests(unittest.TestCase):
    def test_pass_is_review_only(self):
        result = audit_bytes(fixture())
        self.assertTrue(result["structural_preflight"])
        self.assertEqual(result["muzzle_node"], "MuzzleSocket")
        self.assertFalse(result["runtime_approved"])
        self.assertFalse(result["artistic_approval"])

    def test_rejects_missing_duplicate_or_empty_clips(self):
        for options, expected in [
            ({"omit": "Death"}, "missing-clips"),
            ({"duplicate": True}, "unknown-or-duplicate-clip"),
            ({"empty": True}, "empty-clip"),
        ]:
            with self.subTest(options=options), self.assertRaisesRegex(ValueError, expected):
                audit_bytes(fixture(**options))

    def test_rejects_animations_not_targeting_skeleton(self):
        with self.assertRaisesRegex(ValueError, "clip-misses-skeleton"):
            audit_bytes(fixture(bad_joint=True))

    def test_rejects_unattached_muzzle(self):
        with self.assertRaisesRegex(ValueError, "weapon-muzzle-socket-required"):
            audit_bytes(fixture(detach=True))

    def test_rejects_unrigged_glb(self):
        with self.assertRaisesRegex(ValueError, "missing-skin-or-mesh"):
            data = fixture()
            doc = glb_document(data)
            doc["skins"] = []
            raw = json.dumps(doc).encode()
            raw += b" " * (-len(raw) % 4)
            broken = struct.pack("<4sII", b"glTF", 2, len(raw) + 20) + struct.pack("<I4s", len(raw), b"JSON") + raw
            audit_bytes(broken)

if __name__ == "__main__":
    unittest.main()
