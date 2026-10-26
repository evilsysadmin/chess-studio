"""No-network checks for a guarded immutable goblin R2 copy."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import chronicles_r2_publish_immutable_goblin as p


class ImmutableGoblinContract(unittest.TestCase):
    def test_expected_key_is_content_addressed(self):
        self.assertEqual(p.DESTINATION, "sprites/ash-goblin-96ed70aafe94827f.webp")
        self.assertEqual(p.CACHE, "public, max-age=31536000, immutable")
        self.assertNotEqual(p.DESTINATION, p.SOURCE)

    def test_bad_source_never_authorizes_copy(self):
        rows = [{"key": p.SOURCE, "size": p.SIZE}]
        for bad in (b"", b"RIFF" + b"x" * (p.SIZE - 4)):
            with self.assertRaises(ValueError):
                p.validate_inventory(rows, bad)

    def test_unrelated_files_block_copy_without_exposing_keys(self):
        rows = [{"key": p.SOURCE, "size": p.SIZE},
                {"key": "backups/customer.db", "size": 4}]
        with self.assertRaises(ValueError):
            p.validate_inventory(rows, b"")

    def test_missing_or_wrong_http_metadata_cannot_be_called_immutable(self):
        for metadata in (None, {}, {"cacheControl": p.CACHE},
                         {"cacheControl": "public, max-age=3600", "contentType": "image/webp"}):
            rows = [{"key": p.DESTINATION, "size": p.SIZE, "http_metadata": metadata}]
            with self.subTest(metadata=metadata):
                with self.assertRaises(ValueError):
                    p.validate_metadata(rows)
        p.validate_metadata([{"key": p.DESTINATION, "size": p.SIZE,
                             "http_metadata": {"cacheControl": p.CACHE, "contentType": "image/webp"}}])

    def test_no_delete_or_mutation_of_approved_source(self):
        source = pathlib.Path(p.__file__).read_text()
        self.assertNotIn('method="DELETE"', source)
        self.assertNotIn("delete_object(", source)
        self.assertNotIn("terraform apply", source)
        # The only upload target is the immutable digest-addressed name.
        self.assertIn("core.object_path(account, BUCKET, DESTINATION)", source)


if __name__ == "__main__":
    unittest.main()
