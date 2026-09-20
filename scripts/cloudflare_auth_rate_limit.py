#!/usr/bin/env python3
"""Reconcile Chess Studio's zone-level Cloudflare auth burst guard.

The zone may already contain manually managed rate-limit rules. This helper
owns only one stable rule ref and updates/adds that rule through the Rulesets
API without replacing the phase entrypoint ruleset or unrelated rules.
"""
from __future__ import annotations

import argparse
import json
import os
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
PHASE = "http_ratelimit"
RULE_REF = "chess_studio_auth_burst_ip_v1"
RULE_DESCRIPTION = "Chess Studio auth burst guard · IP · Free-compatible"
AUTH_PATHS = (
    "/api/auth/login",
    "/api/auth/register",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
)
REQUESTS_PER_PERIOD = 8
PERIOD_SECONDS = 10
MITIGATION_SECONDS = 10


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta el secret/variable obligatorio {name}")
    return value


def request_json(method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
    data = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {required('CLOUDFLARE_API_TOKEN')}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"errors": [{"message": raw.decode("utf-8", "replace")[:500]}]}
        return exc.code, body


def error_messages(body: object) -> set[str]:
    if not isinstance(body, dict):
        return set()
    rows = body.get("errors") or []
    if not isinstance(rows, list):
        return set()
    return {
        str(item.get("message") or item.get("code") or item)
        for item in rows
        if isinstance(item, dict)
    }


def result_or_die(
    status: int,
    body: object,
    *,
    context: str,
    allowed: set[int] | None = None,
) -> object:
    allowed = allowed or {200}
    if status not in allowed:
        detail = "; ".join(sorted(error_messages(body))[:4])
        suffix = f": {detail}" if detail else ""
        raise SystemExit(f"{context}: Cloudflare respondió HTTP {status}{suffix}")
    if isinstance(body, dict) and body.get("success") is False:
        raise SystemExit(f"{context}: Cloudflare respondió success=false")
    return body.get("result") if isinstance(body, dict) else body


def desired_rule() -> dict:
    path_set = " ".join(json.dumps(path) for path in AUTH_PATHS)
    return {
        "ref": RULE_REF,
        "description": RULE_DESCRIPTION,
        "expression": f"(http.request.uri.path in {{{path_set}}} and not cf.client.bot)",
        "action": "block",
        "enabled": True,
        "ratelimit": {
            "characteristics": ["cf.colo.id", "ip.src"],
            "period": PERIOD_SECONDS,
            "requests_per_period": REQUESTS_PER_PERIOD,
            "mitigation_timeout": MITIGATION_SECONDS,
        },
    }


def canonical_rule(rule: object) -> dict:
    row = rule if isinstance(rule, dict) else {}
    ratelimit = row.get("ratelimit") if isinstance(row.get("ratelimit"), dict) else {}
    characteristics = ratelimit.get("characteristics")
    characteristics = characteristics if isinstance(characteristics, list) else []
    return {
        "ref": str(row.get("ref") or ""),
        "description": str(row.get("description") or ""),
        "expression": str(row.get("expression") or ""),
        "action": str(row.get("action") or ""),
        "enabled": bool(row.get("enabled", True)),
        "ratelimit": {
            "characteristics": sorted(str(value) for value in characteristics),
            "period": int(ratelimit.get("period") or 0),
            "requests_per_period": int(ratelimit.get("requests_per_period") or 0),
            "mitigation_timeout": int(ratelimit.get("mitigation_timeout") or 0),
        },
    }


def rule_matches(actual: object) -> bool:
    return canonical_rule(actual) == canonical_rule(desired_rule())


def managed_rules(rules: object) -> list[dict]:
    rows = rules if isinstance(rules, list) else []
    return [row for row in rows if isinstance(row, dict) and row.get("ref") == RULE_REF]


def resolve_zone() -> tuple[str, str]:
    query = urllib.parse.urlencode(
        {"name": ZONE_NAME, "account.id": required("CLOUDFLARE_ACCOUNT_ID"), "per_page": "50"}
    )
    status, body = request_json("GET", f"/zones?{query}")
    rows = result_or_die(status, body, context="Resolver zona Cloudflare")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME]
    if len(matches) != 1 or not matches[0].get("id"):
        raise SystemExit(f"Se esperaba una única zona {ZONE_NAME}; encontrados {len(matches)}")
    plan = matches[0].get("plan")
    plan_name = str(plan.get("name") or plan.get("legacy_id") or "") if isinstance(plan, dict) else ""
    return str(matches[0]["id"]), plan_name


def entrypoint(zone_id: str) -> dict | None:
    status, body = request_json("GET", f"/zones/{zone_id}/rulesets/phases/{PHASE}/entrypoint")
    if status == 404:
        return None
    result = result_or_die(status, body, context="Leer ruleset de rate limiting")
    if not isinstance(result, dict) or not result.get("id"):
        raise SystemExit("Cloudflare devolvió un ruleset de rate limiting inesperado")
    return result


def verify(zone_id: str) -> dict:
    current = entrypoint(zone_id)
    if current is None:
        raise SystemExit("Cloudflare no conserva el ruleset de rate limiting tras reconciliarlo")
    matches = managed_rules(current.get("rules"))
    if len(matches) != 1:
        raise SystemExit(f"Se esperaba exactamente una regla {RULE_REF}; encontradas {len(matches)}")
    if not rule_matches(matches[0]):
        raise SystemExit(f"La regla {RULE_REF} no coincide con el contrato esperado")
    return matches[0]


def reconcile() -> str:
    zone_id, plan_name = resolve_zone()
    current = entrypoint(zone_id)
    desired = desired_rule()

    if current is None:
        status, body = request_json(
            "POST",
            f"/zones/{zone_id}/rulesets",
            {
                "name": "Chess Studio rate limiting",
                "description": "Zone rate limits managed without replacing unrelated security rules.",
                "kind": "zone",
                "phase": PHASE,
                "rules": [desired],
            },
        )
        result_or_die(status, body, context="Crear ruleset de rate limiting", allowed={200, 201})
        action = "created-ruleset"
    else:
        rules = current.get("rules") if isinstance(current.get("rules"), list) else []
        matches = managed_rules(rules)
        if len(matches) > 1:
            raise SystemExit(f"Hay {len(matches)} reglas con ref {RULE_REF}; no se muta un estado ambiguo")
        if not matches:
            if "free" in plan_name.lower() and rules:
                raise SystemExit(
                    "La zona Free ya tiene una regla de rate limiting no gestionada; "
                    "no se sobrescribe ni elimina automáticamente."
                )
            status, body = request_json(
                "POST",
                f"/zones/{zone_id}/rulesets/{current['id']}/rules",
                desired,
            )
            result_or_die(status, body, context="Añadir auth burst guard", allowed={200, 201})
            action = "created-rule"
        elif rule_matches(matches[0]):
            action = "unchanged"
        else:
            rule_id = str(matches[0].get("id") or "")
            if not rule_id:
                raise SystemExit(f"La regla {RULE_REF} existe pero Cloudflare no devolvió su id")
            status, body = request_json(
                "PATCH",
                f"/zones/{zone_id}/rulesets/{current['id']}/rules/{rule_id}",
                desired,
            )
            result_or_die(status, body, context="Actualizar auth burst guard")
            action = "updated"

    verified = verify(zone_id)
    print(
        "CLOUDFLARE_AUTH_RATE_LIMIT_OK "
        f"action={action} ref={verified.get('ref')} "
        f"limit={REQUESTS_PER_PERIOD}/{PERIOD_SECONDS}s mitigation={MITIGATION_SECONDS}s"
    )
    return action


def self_test() -> None:
    expected = desired_rule()
    assert expected["action"] == "block"
    assert expected["ratelimit"]["period"] == 10
    assert expected["ratelimit"]["mitigation_timeout"] == 10
    assert expected["ratelimit"]["requests_per_period"] == 8
    assert sorted(expected["ratelimit"]["characteristics"]) == ["cf.colo.id", "ip.src"]
    for path in AUTH_PATHS:
        assert path in expected["expression"]
    assert "http.host" not in expected["expression"]
    assert "http.request.method" not in expected["expression"]

    actual = {
        **expected,
        "id": "rule-id",
        "version": "7",
        "last_updated": "ignored",
        "ratelimit": {
            **expected["ratelimit"],
            "characteristics": list(reversed(expected["ratelimit"]["characteristics"])),
        },
    }
    assert rule_matches(actual)
    broken = {**actual, "ratelimit": {**actual["ratelimit"], "period": 60}}
    assert not rule_matches(broken)
    assert managed_rules([actual, {"ref": "unrelated-rule"}]) == [actual]
    print("Cloudflare auth rate-limit self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        reconcile()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
