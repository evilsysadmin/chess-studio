#!/usr/bin/env python3
"""Audit and retire legacy Cloudflare redirects for Chess Studio production.

The GitHub Pages -> Cloudflare Pages cutover must never leave an edge redirect
that sends the production hostname back to evilsysadmin.github.io/chess-studio.
That creates a redirect loop because GitHub Pages knows the old custom domain.

This helper deliberately touches only rules that match BOTH:
  * chess-studio.shadowops.dpdns.org
  * evilsysadmin.github.io/chess-studio

It supports both legacy Page Rules and modern Single Redirects. No token value is
printed and unrelated rules are never modified.
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
PRODUCTION_HOST = "chess-studio.shadowops.dpdns.org"
LEGACY_GITHUB_PREFIX = "evilsysadmin.github.io/chess-studio"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name}")
    return value


def request_json(method: str, path: str, payload: object | None = None) -> tuple[int, object]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
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


def result_or_die(status: int, body: object, context: str, allowed: set[int] | None = None) -> object:
    allowed = allowed or {200}
    if status not in allowed:
        errors = body.get("errors") if isinstance(body, dict) else None
        detail = "; ".join(
            str(item.get("message") or item.get("code") or item)
            for item in (errors or [])[:4]
            if isinstance(item, dict)
        )
        raise SystemExit(f"{context}: Cloudflare HTTP {status}{': ' + detail if detail else ''}")
    if isinstance(body, dict) and body.get("success") is False:
        raise SystemExit(f"{context}: Cloudflare success=false")
    return body.get("result") if isinstance(body, dict) else body


def find_zone_id() -> str:
    query = urllib.parse.urlencode(
        {"name": ZONE_NAME, "account.id": required("CLOUDFLARE_ACCOUNT_ID"), "per_page": "50"}
    )
    status, body = request_json("GET", f"/zones?{query}")
    rows = result_or_die(status, body, "Resolver zona")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME]
    if len(matches) != 1 or not matches[0].get("id"):
        raise SystemExit(f"Zona {ZONE_NAME}: esperaba 1 resultado, recibí {len(matches)}")
    return str(matches[0]["id"])


def _text(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True).lower()


def is_legacy_page_rule(rule: object) -> bool:
    if not isinstance(rule, dict):
        return False
    targets = _text(rule.get("targets") or [])
    if PRODUCTION_HOST not in targets:
        return False
    for action in rule.get("actions") or []:
        if not isinstance(action, dict) or action.get("id") != "forwarding_url":
            continue
        url = str((action.get("value") or {}).get("url") or "").lower()
        if LEGACY_GITHUB_PREFIX in url:
            return True
    return False


def is_legacy_single_redirect(rule: object) -> bool:
    if not isinstance(rule, dict) or rule.get("action") != "redirect":
        return False
    expression = str(rule.get("expression") or "").lower()
    destination = _text(rule.get("action_parameters") or {})
    return PRODUCTION_HOST in expression and LEGACY_GITHUB_PREFIX in destination


def list_legacy_page_rules(zone_id: str) -> list[dict]:
    status, body = request_json("GET", f"/zones/{zone_id}/pagerules?per_page=100")
    if status in {401, 403}:
        print("AVISO: el token no puede leer Page Rules (se sigue con Single Redirects).")
        return []
    rows = result_or_die(status, body, "Listar Page Rules")
    return [row for row in (rows if isinstance(rows, list) else []) if is_legacy_page_rule(row)]


def single_redirect_entrypoint(zone_id: str) -> dict | None:
    status, body = request_json(
        "GET", f"/zones/{zone_id}/rulesets/phases/http_request_dynamic_redirect/entrypoint"
    )
    if status == 404:
        return None
    if status in {401, 403}:
        print("AVISO: el token no puede leer Single Redirects.")
        return None
    result = result_or_die(status, body, "Leer Single Redirects")
    return result if isinstance(result, dict) else None


def list_legacy_single_redirects(zone_id: str) -> tuple[str | None, list[dict]]:
    ruleset = single_redirect_entrypoint(zone_id)
    if not ruleset:
        return None, []
    ruleset_id = str(ruleset.get("id") or "") or None
    rows = [row for row in (ruleset.get("rules") or []) if is_legacy_single_redirect(row)]
    return ruleset_id, rows


def describe_page_rule(rule: dict) -> str:
    destination = ""
    for action in rule.get("actions") or []:
        if isinstance(action, dict) and action.get("id") == "forwarding_url":
            destination = str((action.get("value") or {}).get("url") or "")
            break
    return f"PageRule id={rule.get('id')} status={rule.get('status')} -> {destination}"


def describe_single_redirect(rule: dict) -> str:
    params = rule.get("action_parameters") or {}
    return (
        f"SingleRedirect id={rule.get('id')} enabled={rule.get('enabled', True)} "
        f"description={rule.get('description')!r} expression={rule.get('expression')!r} "
        f"destination={_text(params)}"
    )


def audit(zone_id: str) -> tuple[list[dict], str | None, list[dict]]:
    page_rules = list_legacy_page_rules(zone_id)
    ruleset_id, redirects = list_legacy_single_redirects(zone_id)
    if not page_rules and not redirects:
        print("No hay redirects legacy detectables hacia GitHub Pages.")
    for rule in page_rules:
        print("LEGACY:", describe_page_rule(rule))
    for rule in redirects:
        print("LEGACY:", describe_single_redirect(rule))
    return page_rules, ruleset_id, redirects


def delete_legacy(zone_id: str) -> int:
    page_rules, ruleset_id, redirects = audit(zone_id)
    changed = 0

    for rule in page_rules:
        rule_id = str(rule.get("id") or "")
        if not rule_id:
            raise SystemExit("Page Rule legacy sin id; no se modifica")
        status, body = request_json("DELETE", f"/zones/{zone_id}/pagerules/{rule_id}")
        result_or_die(status, body, f"Eliminar Page Rule legacy {rule_id}", allowed={200})
        changed += 1
        print(f"ELIMINADO: Page Rule legacy {rule_id}")

    if redirects and not ruleset_id:
        raise SystemExit("Single Redirect legacy encontrado sin ruleset id")
    for rule in redirects:
        rule_id = str(rule.get("id") or "")
        if not rule_id:
            raise SystemExit("Single Redirect legacy sin id; no se modifica")
        status, body = request_json(
            "DELETE", f"/zones/{zone_id}/rulesets/{ruleset_id}/rules/{rule_id}"
        )
        result_or_die(status, body, f"Eliminar Single Redirect legacy {rule_id}", allowed={200})
        changed += 1
        print(f"ELIMINADO: Single Redirect legacy {rule_id}")

    remaining_page, _, remaining_redirects = audit(zone_id)
    if remaining_page or remaining_redirects:
        raise SystemExit("Persisten redirects legacy después de la reconciliación")
    print(f"Guardrail Cloudflare OK · redirects legacy retirados={changed}")
    return changed


def self_test() -> None:
    page = {
        "targets": [{"constraint": {"value": f"{PRODUCTION_HOST}/*"}}],
        "actions": [{"id": "forwarding_url", "value": {"url": "https://evilsysadmin.github.io/chess-studio/$1"}}],
    }
    assert is_legacy_page_rule(page)
    assert not is_legacy_page_rule({**page, "targets": [{"constraint": {"value": "other.example/*"}}]})
    redirect = {
        "action": "redirect",
        "expression": f'(http.host eq "{PRODUCTION_HOST}")',
        "action_parameters": {"from_value": {"target_url": {"value": "https://evilsysadmin.github.io/chess-studio/"}}},
    }
    assert is_legacy_single_redirect(redirect)
    assert not is_legacy_single_redirect({**redirect, "expression": '(http.host eq "other.example")'})
    print("cloudflare legacy redirect guard self-test OK")


def main() -> None:
    mode = sys.argv[1] if len(sys.argv) > 1 else "--audit"
    if mode == "--self-test":
        self_test()
        return
    if mode not in {"--audit", "--fix"}:
        raise SystemExit("Uso: cloudflare_legacy_redirect_guard.py --audit|--fix|--self-test")
    zone_id = find_zone_id()
    if mode == "--fix":
        delete_legacy(zone_id)
    else:
        audit(zone_id)


if __name__ == "__main__":
    main()
