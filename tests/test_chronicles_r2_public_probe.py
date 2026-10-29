"""Offline contracts for the temporary Chronicles R2 public object probe."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "scripts"))
import chronicles_r2_public_probe as p


GOOD = {"domain": "assets.chronicles.shadowops.dpdns.org",
        "enabled": True, "status": {"ssl": "active", "ownership": "active"}}


class R2PublicProbeContract(unittest.TestCase):
    def test_public_domain_and_headers(self):
        calls = []
        def head(url):
            calls.append(url)
            return 200, {"content-type": "image/webp", "access-control-allow-origin": "*",
                         "cache-control": "public, max-age=14400"}
        result = p.inspect([GOOD], head)
        self.assertEqual(result["asset"], "ok")
        self.assertEqual(result["cors"], "ok")
        self.assertEqual(result["cache"], "mutable-safe")
        self.assertEqual(calls, ["https://assets.chronicles.shadowops.dpdns.org/sprites/ash-goblin.webp"])

    def test_unconfigured_and_inactive_domain_fails_closed(self):
        for domains in ([], [{**GOOD, "enabled": False}]):
            self.assertEqual(p.inspect(domains, lambda _: self.fail("unexpected public HEAD"))["domain"], "pending")

    def test_ambiguous_and_foreign_domain_rejected(self):
        for domains in ([GOOD, GOOD], [{**GOOD, "domain": "somewhere.else"}], [{"enabled": True}]):
            with self.subTest(domains=domains):
                with self.assertRaises(ValueError):
                    p.inspect(domains, lambda _: self.fail("unexpected public HEAD"))

    def test_reports_bad_mime_cors_unsafe_immutable_and_404(self):
        result = p.inspect([GOOD], lambda _: (200, {
            "content-type": "text/html", "cache-control": "public, max-age=31536000, immutable"
        }))
        self.assertEqual(result["asset"], "bad-content-type")
        self.assertEqual(result["cors"], "missing-or-denied")
        self.assertEqual(result["cache"], "unsafe-ttl")
        self.assertEqual(p.inspect([GOOD], lambda _: (404, {}))["asset"], "http-404")

    def test_inventory_reports_counts_only_and_flags_sensitive_assets(self):
        rows = [
            {"key": "sprites/ash-goblin.webp", "size": 100},
            {"key": "music/first-verse.mp3", "size": 200},
            {"key": "models/source/secret-master.blend", "size": 300},
        ]
        summary = p.summarize_objects(rows)
        self.assertEqual(summary["objects"], "3")
        self.assertEqual(summary["bytes"], "600")
        self.assertEqual(summary["prefix_counts"], "models:1,music:1,sprites:1")
        self.assertEqual(summary["needs_review"], "1")
        self.assertEqual(summary["public_readiness"], "manual-review-required")
        self.assertNotIn("ash-goblin.webp", str(summary))
        self.assertNotIn("secret-master.blend", str(summary))

    def test_inventory_never_assumes_media_only_means_public_safe(self):
        summary = p.summarize_objects([{"key": "sprites/ash-goblin.webp", "size": 123}])
        self.assertEqual(summary["needs_review"], "0")
        self.assertEqual(summary["public_readiness"], "manual-review-required")
        for invalid in ([{"key": "", "size": 0}], [{"key": "sprites/a.webp", "size": -1}],
                        [{"key": "/private/a.webp", "size": 1}], [{"size": 3}]):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    p.summarize_objects(invalid)

    def test_immutable_edge_requires_real_head_get_and_exact_bytes(self):
        import hashlib
        from unittest.mock import patch
        data = b"RIFF-webp-fixture-for-tests"
        good_headers = {
            "content-type": "image/webp",
            "access-control-allow-origin": p.STAGING_ORIGIN,
            "cache-control": "public, max-age=31536000, immutable",
        }
        seen = []
        def get(url):
            seen.append(("get", url))
            return 200, good_headers, data
        def head(url):
            seen.append(("head", url))
            return 200, good_headers
        with patch.object(p, "IMMUTABLE_BYTES", len(data)), patch.object(
            p, "IMMUTABLE_SHA256", hashlib.sha256(data).hexdigest()
        ):
            actual = p.immutable_http_check([GOOD], head, get)
            self.assertEqual(actual["asset"], "ok")
            self.assertEqual(actual["browser_cache"], "immutable-one-year")
            self.assertEqual(actual["public_bytes"], str(len(data)))
        url = "https://assets.chronicles.shadowops.dpdns.org/sprites/ash-goblin-96ed70aafe94827f.webp"
        self.assertEqual(seen, [("head", url), ("get", url)])

    def test_immutable_edge_rejects_missing_ttl_and_bad_http(self):
        valid = {
            "content-type": "image/webp",
            "access-control-allow-origin": "*",
            "cache-control": "public, immutable, max-age=31536000",
        }
        calls = []
        def get(url):
            calls.append(url)
            return 200, valid, b""
        for headers in (
            {**valid, "cache-control": "public, max-age=31536000"},
            {**valid, "cache-control": "public, max-age=31536000, immutable-flag"},
            {**valid, "cache-control": "public, max-age=3600, immutable"},
            {**valid, "cache-control": "private, max-age=31536000, immutable"},
            {**valid, "content-type": "text/html"},
            {**valid, "access-control-allow-origin": "https://foreign.example"},
        ):
            with self.subTest(headers=headers):
                result = p.immutable_http_check([GOOD], lambda _: (200, headers), get)
                self.assertNotEqual(result["asset"], "ok")
        self.assertEqual(calls, [])  # No download until HEAD passes contract.
        self.assertEqual(p.immutable_http_check([GOOD], lambda _: (404, {}), get)["asset"], "head-http-404")
        self.assertEqual(p.immutable_http_check([], lambda _: self.fail("HEAD"), get)["asset"],
                         "no-active-public-domain")

    def test_immutable_edge_rejects_wrong_public_bytes_and_get_headers(self):
        import hashlib
        from unittest.mock import patch
        data = b"fixture-data"
        h = {"content-type": "image/webp", "access-control-allow-origin": "*",
             "cache-control": "immutable, public, max-age=31536000"}
        with patch.object(p, "IMMUTABLE_BYTES", len(data)), patch.object(
            p, "IMMUTABLE_SHA256", hashlib.sha256(data).hexdigest()
        ):
            bad = (
                (404, h, b""),
                (200, h, b"wrong"),
                (200, h, b"fixture-xxxx"),  # correct length but wrong SHA
                (200, {**h, "content-type": "text/html"}, data),
                (200, {**h, "access-control-allow-origin": "https://wrong.example"}, data),
            )
            for response in bad:
                with self.subTest(response=response[:2]):
                    result = p.immutable_http_check([GOOD], lambda _: (200, h),
                                                    lambda _: response)
                    self.assertNotEqual(result["asset"], "ok")

    def test_no_cloudflare_mutations(self):
        source = pathlib.Path(p.__file__).read_text()
        for forbidden in ('method="PUT"', 'method="POST"', 'method="DELETE"',
                          'method="PATCH"', 'terraform apply', 'subprocess.run'):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
