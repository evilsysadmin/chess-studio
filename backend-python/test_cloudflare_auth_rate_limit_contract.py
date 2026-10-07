"""Contract tests for the shared Cloudflare auth burst guard."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "cloudflare_auth_rate_limit.py"
spec = importlib.util.spec_from_file_location("cloudflare_auth_rate_limit", HELPER)
assert spec and spec.loader
rate_limit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(rate_limit)


def test_auth_burst_guard_stays_free_plan_compatible_and_covers_both_api_hosts():
    rule = rate_limit.desired_rule()
    assert rule["action"] == "block"
    assert rule["ratelimit"] == {
        "characteristics": ["cf.colo.id", "ip.src"],
        "period": 10,
        "requests_per_period": 8,
        "mitigation_timeout": 10,
    }
    assert set(rate_limit.AUTH_PATHS) == {
        "/api/auth/login",
        "/api/auth/register",
        "/api/auth/forgot-password",
        "/api/auth/reset-password",
    }
    # Free rate limiting exposes Path (not Host/Method), so one zone rule guards
    # the identical auth paths on staging and production without a second rule.
    assert "http.request.uri.path" in rule["expression"]
    assert "http.host" not in rule["expression"]
    assert "http.request.method" not in rule["expression"]
    assert "not cf.client.bot" in rule["expression"]


def test_auth_burst_guard_ignores_cloudflare_metadata_but_detects_contract_drift():
    expected = rate_limit.desired_rule()
    actual = {
        **expected,
        "id": "generated-rule-id",
        "version": "11",
        "ratelimit": {
            **expected["ratelimit"],
            "characteristics": list(reversed(expected["ratelimit"]["characteristics"])),
        },
    }
    assert rate_limit.rule_matches(actual)
    actual["ratelimit"]["requests_per_period"] = 99
    assert not rate_limit.rule_matches(actual)



def test_cloudflare_transient_reads_retry_but_mutations_do_not(monkeypatch):
    calls = []
    responses = iter(
        [
            (502, {"errors": [{"message": "bad gateway"}]}),
            (200, {"success": True, "result": []}),
        ]
    )

    def fake_once(method, path, payload=None):
        calls.append((method, path, payload))
        return next(responses)

    sleeps = []
    monkeypatch.setattr(rate_limit, "_request_json_once", fake_once)
    monkeypatch.setattr(rate_limit.time, "sleep", sleeps.append)

    status, body = rate_limit.request_json("GET", "/zones?name=shadowops.dpdns.org")
    assert status == 200
    assert body["success"] is True
    assert len(calls) == 2
    assert sleeps == [0.5]

    calls.clear()

    def mutation_once(method, path, payload=None):
        calls.append((method, path, payload))
        return 502, {"errors": [{"message": "bad gateway"}]}

    monkeypatch.setattr(rate_limit, "_request_json_once", mutation_once)
    status, _ = rate_limit.request_json("POST", "/zones/zone/rulesets", {"name": "guard"})
    assert status == 502
    assert len(calls) == 1
    assert sleeps == [0.5]
