"""Fail-closed publication contract; no live Cloudflare call in PR CI."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import chronicles_r2_publish_goblin_domain as p


class PublicGoblinAdmissionTests(unittest.TestCase):
    def setUp(self):
        # Fixture is not the real binary; SHA guards remain exercised by tests
        # for mismatch. Real readback from Cloudflare is mandatory for publish.
        self.rows = [{"key": p.OBJECT_KEY, "size": p.OBJECT_BYTES}]

    def test_rejects_unknown_content_and_folder(self):
        for rows in (
            self.rows + [{"key": "private/backup.zip", "size": 42}],
            self.rows + [{"key": "sprites/other.webp", "size": 11}],
            self.rows + [{"key": "sprites/", "size": 1}],
            self.rows + [{"key": "sprites/", "size": 0}, {"key": "sprites/", "size": 0}],
            [{"key": p.OBJECT_KEY, "size": p.OBJECT_BYTES - 1}],
            [],
        ):
            with self.subTest(rows=rows):
                with self.assertRaises(ValueError):
                    p.check_inventory(rows, b"")

    def test_rejects_unapproved_or_truncated_bytes(self):
        # Never let mere file size or extension authorize exposing the bucket.
        with self.assertRaises(ValueError):
            p.check_inventory(self.rows, b"RIFF" + b"0" * (p.OBJECT_BYTES - 4))
        with self.assertRaises(ValueError):
            p.check_inventory(self.rows, b"")

    def test_approved_digest_is_content_addressable(self):
        self.assertEqual(len(p.OBJECT_SHA256), 64)
        self.assertEqual(p.OBJECT_SHA256, "96ed70aafe94827f3663228896af612055c9abf12b441a78f7bb4c1fa3b17656")
        self.assertEqual(p.OBJECT_BYTES, 122882)
        self.assertEqual(p.OBJECT_KEY, "sprites/ash-goblin.webp")

    def test_public_origin_and_cors_are_scoped(self):
        cfg = p.config()
        self.assertEqual(cfg["bucket"], "chronicles")
        self.assertEqual(cfg["customDomain"], "assets.chronicles.shadowops.dpdns.org")
        self.assertEqual(cfg["minTls"], "1.2")
        self.assertEqual(cfg["cors"]["origins"], [p.STAGING, p.PRODUCTION])
        self.assertEqual(cfg["cors"]["methods"], ["GET", "HEAD"])
        self.assertNotIn("immutable", str(cfg))
        self.assertNotIn("max-age=31536000", str(cfg))

    def test_never_deletes_or_overwrites_an_r2_object(self):
        source = pathlib.Path(p.__file__).read_text()
        for operation in ("delete_object(", "upload_object(", 'method="DELETE"', "terraform apply"):
            self.assertNotIn(operation, source)


if __name__ == "__main__":
    unittest.main()
