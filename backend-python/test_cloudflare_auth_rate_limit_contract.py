"""Contract tests for the shared Cloudflare auth burst guard."""
from __future__ import annotations

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HELPER = ROOT / "scripts" / "cloudflare_auth_rate_limit.py"
WORKFLOW = ROOT / ".github" / "workflows" / "production-promote.yml"

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


def test_production_release_reconciles_edge_guard_after_mutation_admission():
    workflow = WORKFLOW.read_text(encoding="utf-8")
    guard = workflow.index("Supersede stale production promotion before first mutation")
    reconcile = workflow.index("Reconcile Cloudflare auth burst guard")
    terraform_apply = workflow.index("- name: Terraform apply")
    assert guard < reconcile < terraform_apply
    assert 'cloudflare_auth_rate_limit.py" --self-test' in workflow
    assert 'cloudflare_auth_rate_limit.py"' in workflow
