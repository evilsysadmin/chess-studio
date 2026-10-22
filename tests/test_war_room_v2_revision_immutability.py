#!/usr/bin/env python3
"""Dependency-free, mocked R2 tests: PR SHA revision must be immutable."""
from __future__ import annotations

import pathlib
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts/blender"))
import publish_war_room_v2_staging as publisher  # noqa: E402


class V2RevisionImmutabilityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.asset = pathlib.Path(self.temp.name) / "scene.glb"
        self.asset.write_bytes(b"glTF" + b"good-byte" * 9000)
        self.revision = "a" * 40
        self.revision_key = f"war-room/v2/staging/revisions/{self.revision}.glb"
        self.alias = publisher.STAGING_ALIAS
        self.stored = {}
        self.uploads = []
        self.mocks = [
            patch.object(publisher.core, "load_config", return_value={"bucket": "test"}),
            patch.object(publisher.core, "require_env", return_value=("token", "account")),
            patch.object(publisher.core, "get_object", side_effect=self.fetch),
            patch.object(publisher.transport, "raw_upload_object", side_effect=self.upload),
        ]
        for mock in self.mocks:
            mock.start()
            self.addCleanup(mock.stop)

    def fetch(self, token, account, bucket, key):
        if key not in self.stored:
            raise publisher.core.PublishError(f"Cloudflare GET HTTP 404 para {key}")
        return self.stored[key]

    def upload(self, token, account, bucket, key, payload, content_type):
        self.uploads.append(key)
        self.stored[key] = payload

    def run_publish(self):
        with patch.object(sys, "argv", ["publisher", str(self.asset), "--revision", self.revision]):
            return publisher.main()

    def test_new_revision_published_and_verified_before_alias(self):
        self.assertEqual(self.run_publish(), 0)
        self.assertEqual(self.uploads[0], self.revision_key)
        self.assertEqual(self.uploads[-1], self.alias)
        self.assertEqual(self.stored[self.revision_key], self.asset.read_bytes())
        self.assertEqual(self.stored[self.alias], self.asset.read_bytes())

    def test_identical_revision_is_safe_on_retry_without_rewriting_revision(self):
        self.stored[self.revision_key] = self.asset.read_bytes()
        self.assertEqual(self.run_publish(), 0)
        self.assertNotIn(self.revision_key, self.uploads)
        self.assertIn(self.alias, self.uploads)

    def test_conflicting_revision_refuses_before_alias_or_canonical_mutation(self):
        self.stored[self.revision_key] = b"different-bytes"
        self.stored[self.alias] = b"old-runtime-alias"
        with self.assertRaisesRegex(SystemExit, "ya existe con otros bytes"):
            self.run_publish()
        self.assertEqual(self.uploads, [])
        self.assertEqual(self.stored[self.alias], b"old-runtime-alias")

    def test_get_failure_other_than_404_is_not_interpreted_as_absent(self):
        with patch.object(publisher.core, "get_object",
                          side_effect=publisher.core.PublishError("Cloudflare GET HTTP 503")):
            with self.assertRaises(publisher.core.PublishError):
                self.run_publish()
        self.assertEqual(self.uploads, [])


if __name__ == "__main__":
    unittest.main()
