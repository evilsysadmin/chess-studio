"""Network-free tests for the published War Room R2 geometry audit."""
import hashlib
import io
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "blender"))
from census_published_war_rooms import R2_ORIGIN, VARIANTS, audit_published_glbs  # noqa: E402


def sample_glb():
    document = {
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}],
        "accessors": [{"count": 3}, {"count": 3}],
    }
    body = json.dumps(document).encode()
    body += b" " * (-len(body) % 4)
    binary = b"\x00" * 4
    length = 12 + 8 + len(body) + 8 + len(binary)
    return (struct.pack("<4sII", b"glTF", 2, length)
            + struct.pack("<II", len(body), 0x4E4F534A) + body
            + struct.pack("<II", len(binary), 0x004E4942) + binary)


class PublishedWarRoomCensusTests(unittest.TestCase):
    def setUp(self):
        self.glb = sample_glb()
        self.assets = {}
        for variant in VARIANTS:
            key = f"war-room/{variant}/runtime/war-room-{variant}-published.glb"
            self.assets[f"warRoom.{variant}.runtime"] = {
                "key": key, "url": f"{R2_ORIGIN}/{key}",
                "sha256": hashlib.sha256(self.glb).hexdigest(),
                "bytes": len(self.glb),
                "contentType": "model/gltf-binary",
            }
        self.manifest = {"baseUrl": R2_ORIGIN, "assets": self.assets}
        self.requests = []

    def opener(self, request, timeout):
        self.assertEqual(timeout, 30)
        self.assertEqual(request.get_header("Accept"), "model/gltf-binary")
        self.assertEqual(request.get_header("User-agent"), "chess-studio-r2-warroom-census/1")
        self.assertEqual(request.get_header("Cache-control"), None)
        self.requests.append(request.full_url)
        return io.BytesIO(self.glb)

    def test_exactly_three_provenance_bound_glb_reports(self):
        with tempfile.TemporaryDirectory() as folder:
            result = audit_published_glbs(self.manifest, Path(folder), opener=self.opener)
        self.assertEqual([r["variant"] for r in result], list(VARIANTS))
        self.assertEqual(len(self.requests), 3)
        for row in result:
            self.assertEqual(row["potentialTriangles"], 1)
            self.assertEqual(row["primitiveInstances"], 1)
            self.assertEqual(row["runtimeManifestProvenance"]["logicalId"],
                             f"warRoom.{row['variant']}.runtime")

    def test_mismatched_bytes_fail_instead_of_publishing_a_false_report(self):
        self.glb = self.glb[:-1] + b"\x01"
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "differs from pinned"):
                audit_published_glbs(self.manifest, Path(folder), opener=self.opener)

    def test_noncanonical_origin_and_metadata_rejected_before_network(self):
        checks = [
            lambda: self.manifest.update(baseUrl="https://other.example"),
            lambda: self.assets["warRoom.v2.runtime"].update(url="https://other.example/a.glb"),
            lambda: self.assets["warRoom.v2.runtime"].update(bytes=50_000_000),
            lambda: self.assets["warRoom.v2.runtime"].update(sha256="bad"),
            lambda: self.assets["warRoom.v2.runtime"].update(contentType="text/html"),
        ]
        for change in checks:
            self.setUp()
            change()
            with tempfile.TemporaryDirectory() as folder:
                with self.assertRaises(ValueError):
                    audit_published_glbs(self.manifest, Path(folder), opener=self.opener)
            self.assertEqual(self.requests, [])

    def test_corrupt_verified_glb_does_not_become_zero_geometry(self):
        self.glb = b"BAD!".ljust(len(self.glb), b"!")
        self.assets["warRoom.v2.runtime"]["sha256"] = hashlib.sha256(self.glb).hexdigest()
        with tempfile.TemporaryDirectory() as folder:
            with self.assertRaisesRegex(ValueError, "invalid GLB header"):
                audit_published_glbs(self.manifest, Path(folder), opener=self.opener)


if __name__ == "__main__":
    unittest.main()
