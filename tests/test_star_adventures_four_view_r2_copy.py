"""Offline, non-destructive contract for exact cross-bucket Star Adventures copy."""
import hashlib
import pathlib
import sys
import unittest
from unittest import mock
from io import BytesIO
import urllib.error

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import star_adventures_four_view_r2_copy as p


class CopyContract(unittest.TestCase):
    def test_exact_immutable_location_and_bucket_roles(self):
        self.assertEqual(p.SOURCE_BUCKET, "star-adventures")
        self.assertEqual(p.PUBLIC_BUCKET, "chess-studio-assets")
        self.assertEqual(p.PUBLIC_URL, "https://assets.chess-studio.shadowops.dpdns.org/" + p.KEY)
        self.assertIn(p.SHA256[:16], p.KEY)
        self.assertNotEqual(p.SOURCE_BUCKET, p.PUBLIC_BUCKET)

    def test_wrong_size_digest_and_signature_are_rejected(self):
        for bad in [b"", b"RIFF" + b"x" * 123, b"RIFF" + b"WEBP" + b"0" * (p.SIZE - 8)]:
            with self.assertRaises(ValueError):
                p.validate_bytes(bad)
        self.assertEqual(len(p.SHA256), 64)

    def test_existing_dest_is_never_overwritten(self):
        with mock.patch.object(p, "read_destination", return_value=b"wrong"):
            with self.assertRaises(ValueError):
                p.publish_once("token", "account", b"wrong")
        # The actual code never calls a Cloudflare DELETE operation.
        src = pathlib.Path(p.__file__).read_text()
        self.assertNotIn('method="DELETE"', src)
        self.assertNotIn('delete_object(', src)
        self.assertIn("core.object_path(account, PUBLIC_BUCKET, KEY)", src)

    def test_only_404_is_a_missing_target(self):
        with mock.patch.object(p.urllib.request, "urlopen", side_effect=
            urllib.error.HTTPError("url", 404, "not found", {}, BytesIO())):
            self.assertIsNone(p.read_destination("token", "account"))
        with mock.patch.object(p.urllib.request, "urlopen", side_effect=
            urllib.error.HTTPError("url", 403, "forbidden", {}, BytesIO())):
            with self.assertRaises(urllib.error.HTTPError):
                p.read_destination("token", "account")


if __name__ == "__main__":
    unittest.main()
