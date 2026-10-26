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

    def test_no_cloudflare_mutations(self):
        source = pathlib.Path(p.__file__).read_text()
        for forbidden in ('method="PUT"', 'method="POST"', 'method="DELETE"',
                          'method="PATCH"', 'terraform apply', 'subprocess.run'):
            self.assertNotIn(forbidden, source)


if __name__ == "__main__":
    unittest.main()
