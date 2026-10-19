#!/usr/bin/env python3
"""Manage one Cloudflare Cache Rule for TWO exact immutable War Room GLBs.

No broad cache-everything wildcards. Never cache current.glb, JSON, API, user
data, or any other path. Preserve all unrelated zone rules and fail closed if
the managed ref is ambiguous. Post-apply CDN HIT is measured separately.
"""
from __future__ import annotations

import argparse
import json
from typing import Any

from cloudflare_auth_rate_limit import request_json, resolve_zone

PHASE = "http_request_cache_settings"
REF = "chess_studio_warroom_immutable_glbs_v1"
HOST = "assets.chess-studio.shadowops.dpdns.org"
PATHS = (
    "/war-room/v3/runtime/war-room-v3-shell-0df589c2fa839a26.glb",
    "/war-room/v4/runtime/war-room-v4-shell-bfa7af6dbd1ca011.glb",
)
EDGE_TTL = 7 * 24 * 3600
BROWSER_TTL = 365 * 24 * 3600


def desired_rule() -> dict[str, Any]:
    paths = " ".join(json.dumps(path) for path in PATHS)
    return {
        "ref": REF,
        "description": "Chess Studio War Rooms · EXACT V3/V4 immutable GLBs only",
        "expression": (
            f'(http.host eq "{HOST}" and http.request.uri.path in {{{paths}}} '
            'and http.request.uri.query eq "" '
            'and http.request.method in {"GET" "HEAD"})'
        ),
        "action": "set_cache_settings",
        "enabled": True,
        "action_parameters": {
            "cache": True,
            "edge_ttl": {"mode": "override_origin", "default": EDGE_TTL},
            "browser_ttl": {"mode": "override_origin", "default": BROWSER_TTL},
        },
    }


def canonical_rule(rule: object) -> dict[str, Any]:
    row = rule if isinstance(rule, dict) else {}
    params = row.get("action_parameters") if isinstance(row.get("action_parameters"), dict) else {}
    def ttl(name: str) -> dict[str, Any]:
        obj = params.get(name) if isinstance(params.get(name), dict) else {}
        return {"mode": obj.get("mode"), "default": obj.get("default")}
    return {
        "ref": row.get("ref"),
        "description": row.get("description"),
        "expression": row.get("expression"),
        "action": row.get("action"),
        "enabled": row.get("enabled", True),
        "action_parameters": {
            "cache": params.get("cache"),
            "edge_ttl": ttl("edge_ttl"),
            "browser_ttl": ttl("browser_ttl"),
        },
    }


def verified_payload(status: int, data: object, *, operation: str,
                     expected: tuple[int, ...] = (200,)) -> dict:
    if status not in expected or not isinstance(data, dict) or data.get("success") is False:
        errors = data.get("errors", []) if isinstance(data, dict) else []
        raise RuntimeError(
            f"{operation} failed: Cloudflare HTTP {status}. Details: {str(errors)[:550]}. "
            "This operation requires Zone Cache Rules Edit permission; "
            "the application must NOT claim CDN caching is active."
        )
    result = data.get("result")
    if not isinstance(result, dict) or not result.get("id"):
        raise RuntimeError(f"{operation}: missing Cloudflare ruleset identity")
    return result


def entrypoint(zone_id: str) -> dict | None:
    status, data = request_json("GET", f"/zones/{zone_id}/rulesets/phases/{PHASE}/entrypoint")
    if status == 404:
        return None
    return verified_payload(status, data, operation="Read existing cache ruleset")


def managed_rules(current: dict | None) -> list[dict]:
    rules = current.get("rules", []) if current else []
    if not isinstance(rules, list):
        raise RuntimeError("Cloudflare cache ruleset returned malformed rule list")
    return [rule for rule in rules if isinstance(rule, dict) and rule.get("ref") == REF]


def plan(current: dict | None) -> tuple[str, dict | None]:
    found = managed_rules(current)
    if len(found) > 1:
        raise RuntimeError(f"Ambiguous Cloudflare cache rules: {len(found)} refs={REF}")
    if not current:
        return "create-ruleset", None
    if not found:
        return "add-rule", None
    if canonical_rule(found[0]) == canonical_rule(desired_rule()):
        return "unchanged", found[0]
    return "update-rule", found[0]


def apply(zone_id: str) -> dict[str, Any]:
    current = entrypoint(zone_id)
    action, old = plan(current)
    rule = desired_rule()
    if action == "create-ruleset":
        status, data = request_json("POST", f"/zones/{zone_id}/rulesets", {
            "name": "Chess Studio War Room immutable GLB CDN cache",
            "description": "One narrowly-scoped Cache Rule; unrelated rules are not managed.",
            "kind": "zone", "phase": PHASE, "rules": [rule],
        })
        verified_payload(status, data, operation=action, expected=(200, 201))
    elif action == "add-rule":
        status, data = request_json(
            "POST", f"/zones/{zone_id}/rulesets/{current['id']}/rules", rule
        )
        verified_payload(status, data, operation=action, expected=(200, 201))
    elif action == "update-rule":
        if not old.get("id"):
            raise RuntimeError("Managed cache rule has no stable ID")
        status, data = request_json(
            "PATCH", f"/zones/{zone_id}/rulesets/{current['id']}/rules/{old['id']}", rule
        )
        verified_payload(status, data, operation=action)
    verified = entrypoint(zone_id)
    matches = managed_rules(verified)
    if len(matches) != 1 or canonical_rule(matches[0]) != canonical_rule(rule):
        raise RuntimeError("Cloudflare readback differs from requested narrow Cache Rule")
    return {
        "action": action, "phase": PHASE, "ref": REF,
        "ruleId": matches[0].get("id"),
        "zoneRulesUnrelatedCount": len(verified.get("rules", [])) - 1,
        "edgeTtlSeconds": EDGE_TTL, "browserTtlSeconds": BROWSER_TTL,
        "exactPaths": list(PATHS), "verified": True,
    }


def self_test() -> None:
    desired = desired_rule()
    expr = desired["expression"]
    assert HOST in expr and all(path in expr for path in PATHS)
    assert "current.glb" not in expr
    assert "starts_with(" not in expr and "matches" not in expr and "contains" not in expr
    assert 'http.request.uri.query eq ""' in expr
    assert 'http.request.method in {"GET" "HEAD"}' in expr
    assert desired["action_parameters"]["cache"] is True
    assert EDGE_TTL >= 2 * 3600 and BROWSER_TTL == 31536000
    assert plan(None)[0] == "create-ruleset"
    unchanged = {"id": "existing", "rules": [
        {"id": "unrelated", "ref": "other_owner"},
        {"id": "own", **desired},
    ]}
    assert plan(unchanged)[0] == "unchanged"
    assert plan({"id": "existing", "rules": [{"ref": "other_owner"}]})[0] == "add-rule"
    assert plan({"id": "existing", "rules": [{**desired, "id": "own",
                                             "expression": "(true)"}]})[0] == "update-rule"
    for rows in ([desired, desired], "malformed"):
        try:
            plan({"id": "existing", "rules": rows})
        except RuntimeError:
            pass
        else:
            raise AssertionError("ambiguous or malformed rules must fail closed")
    for status in (401, 403, 429, 500):
        try:
            verified_payload(status, {"success": False, "errors": []}, operation="test")
        except RuntimeError:
            pass
        else:
            raise AssertionError("Cloudflare errors must not look like success")
    print("War Room exact-GLB Cloudflare cache rule self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("self-test", "check", "apply"))
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return 0
    zone_id, _plan_name = resolve_zone()
    if args.command == "check":
        current = entrypoint(zone_id)
        action, own = plan(current)
        if action != "unchanged":
            raise RuntimeError(f"War Room cache rule is not active: {action}")
        print(json.dumps({"status": "verified", "ref": REF, "id": own.get("id"),
                          "exactPaths": list(PATHS)}, sort_keys=True))
    else:
        print(json.dumps(apply(zone_id), sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
