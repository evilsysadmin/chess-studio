#!/usr/bin/env python3
"""Idempotent Cloudflare Pages bootstrap/cutover for Chess Studio production.

The production workflow deliberately runs this in two phases:

* ``prepare`` creates/reconciles only the Direct Upload Pages project. The
  public chess-studio hostname keeps pointing at the current production host.
* ``activate`` attaches the custom domain and reconciles DNS only after the
  exact tested SHA is already serving successfully on the pages.dev origin.

This keeps the GitHub Pages -> Cloudflare Pages migration free of the avoidable
"CNAME points at an empty Pages project" outage window. The same helper remains
safe to run on later promotions and known-good rollbacks.
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
PAGES_PROJECT = "chess-studio-production"
PAGES_HOSTNAME = "chess-studio.shadowops.dpdns.org"
PAGES_TARGET = f"{PAGES_PROJECT}.pages.dev"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta el secret/variable obligatorio {name}")
    return value


def request_json(method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
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
            body = json.loads(raw) if raw else {}
            return response.status, body
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
    errors = body.get("errors") or []
    if not isinstance(errors, list):
        return set()
    return {
        str(item.get("message") or item.get("code") or item)
        for item in errors
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
    if isinstance(body, dict):
        return body.get("result")
    return body


def account_id() -> str:
    return required("CLOUDFLARE_ACCOUNT_ID")


def find_zone_id() -> str:
    query = urllib.parse.urlencode(
        {"name": ZONE_NAME, "account.id": account_id(), "per_page": "50"}
    )
    status, body = request_json("GET", f"/zones?{query}")
    rows = result_or_die(status, body, context="Resolver zona DNS")
    rows = rows if isinstance(rows, list) else []
    matches = [
        row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME
    ]
    if len(matches) != 1 or not matches[0].get("id"):
        raise SystemExit(
            f"Se esperaba una única zona {ZONE_NAME}; encontrados {len(matches)}"
        )
    return str(matches[0]["id"])


def ensure_pages_project() -> str:
    project_path = f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}"
    status, body = request_json("GET", project_path)
    if status == 200:
        project = result_or_die(status, body, context="Leer Pages production")
        if not isinstance(project, dict) or project.get("name") != PAGES_PROJECT:
            raise SystemExit("Cloudflare devolvió un proyecto Pages inesperado")
        branch = str(project.get("production_branch") or "")
        if branch and branch != "main":
            patch_status, patch_body = request_json(
                "PATCH", project_path, {"production_branch": "main"}
            )
            result_or_die(
                patch_status,
                patch_body,
                context="Reconciliar production_branch de Pages",
            )
            return "updated"
        return "existing"
    if status != 404:
        result_or_die(status, body, context="Consultar Pages production")
    create_status, create_body = request_json(
        "POST",
        f"/accounts/{account_id()}/pages/projects",
        {"name": PAGES_PROJECT, "production_branch": "main"},
    )
    result_or_die(
        create_status,
        create_body,
        context="Crear Pages production",
        allowed={200, 201},
    )
    return "created"


def ensure_pages_domain() -> str:
    encoded = urllib.parse.quote(PAGES_HOSTNAME, safe="")
    path = f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}/domains/{encoded}"
    status, body = request_json("GET", path)
    if status == 200:
        result_or_die(status, body, context="Leer custom domain de Pages production")
        return "existing"
    if status != 404:
        result_or_die(status, body, context="Consultar custom domain de Pages production")
    create_status, create_body = request_json(
        "POST",
        f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}/domains",
        {"name": PAGES_HOSTNAME},
    )
    result_or_die(
        create_status,
        create_body,
        context="Crear custom domain de Pages production",
        allowed={200, 201},
    )
    return "created"


def dns_rows(zone_id: str, hostname: str) -> list[dict]:
    query = urllib.parse.urlencode({"name": hostname, "per_page": "100"})
    status, body = request_json("GET", f"/zones/{zone_id}/dns_records?{query}")
    rows = result_or_die(status, body, context=f"Consultar DNS {hostname}")
    return [
        row
        for row in (rows if isinstance(rows, list) else [])
        if isinstance(row, dict)
    ]


def ensure_pages_cname(zone_id: str) -> str:
    rows = dns_rows(zone_id, PAGES_HOSTNAME)
    if len(rows) > 1:
        raise SystemExit(
            f"Más de un DNS record para {PAGES_HOSTNAME}; no reconcilio ambiguamente"
        )
    desired = {
        "type": "CNAME",
        "name": PAGES_HOSTNAME,
        "content": PAGES_TARGET,
        "proxied": True,
        "ttl": 1,
        "comment": "Chess Studio production frontend · Cloudflare Pages",
    }
    if not rows:
        status, body = request_json("POST", f"/zones/{zone_id}/dns_records", desired)
        result_or_die(
            status,
            body,
            context=f"Crear DNS {PAGES_HOSTNAME}",
            allowed={200, 201},
        )
        return "created"

    row = rows[0]
    if row.get("type") != "CNAME":
        raise SystemExit(
            f"{PAGES_HOSTNAME} ya existe pero es {row.get('type')}, no CNAME"
        )
    record_id = str(row.get("id") or "")
    if not record_id:
        raise SystemExit(f"Cloudflare no devolvió id para {PAGES_HOSTNAME}")
    current_target = str(row.get("content") or "").rstrip(".")
    current_proxied = bool(row.get("proxied"))
    if current_target == PAGES_TARGET.rstrip(".") and current_proxied is True:
        return "unchanged"
    status, body = request_json(
        "PATCH", f"/zones/{zone_id}/dns_records/{record_id}", desired
    )
    result_or_die(status, body, context=f"Reconciliar DNS {PAGES_HOSTNAME}")
    return "updated"


def ensure_web_analytics(zone_id: str) -> str:
    """Best-effort RUM enablement; hosting never depends on extra RUM permission."""

    status, body = request_json(
        "GET", f"/accounts/{account_id()}/rum/site_info/list?per_page=100"
    )
    if status in {401, 403}:
        print(
            "AVISO: Web Analytics no reconciliado; el token necesita "
            "Account Settings Read/Write."
        )
        return "permission-missing"
    rows = result_or_die(status, body, context="Listar Web Analytics")
    rows = rows if isinstance(rows, list) else []
    for site in rows:
        if not isinstance(site, dict):
            continue
        hosts = {
            str(rule.get("host") or "")
            for rule in (site.get("rules") or [])
            if isinstance(rule, dict)
        }
        if PAGES_HOSTNAME in hosts:
            return "existing"

    status, body = request_json(
        "POST",
        f"/accounts/{account_id()}/rum/site_info",
        {"host": PAGES_HOSTNAME, "auto_install": True, "zone_tag": zone_id},
    )
    if status in {401, 403}:
        print(
            "AVISO: Web Analytics no creado; el token necesita "
            "Account Settings Write."
        )
        return "permission-missing"
    if (
        status == 400
        and "web_analytics.configuration.api.siteInfoForZoneExist"
        in error_messages(body)
    ):
        print(
            "AVISO: la zona ya tiene Site Info de Web Analytics; se conserva "
            "la configuración existente en vez de bloquear el cutover."
        )
        return "zone-existing"
    result_or_die(
        status,
        body,
        context="Crear Web Analytics production",
        allowed={200, 201},
    )
    return "created"


def write_outputs(**values: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def self_test() -> None:
    assert PAGES_PROJECT == "chess-studio-production"
    assert PAGES_TARGET == "chess-studio-production.pages.dev"
    assert PAGES_HOSTNAME == "chess-studio.shadowops.dpdns.org"
    assert PAGES_HOSTNAME != PAGES_TARGET
    print("cloudflare_production_pages self-test OK")


def main() -> None:
    phase = sys.argv[1] if len(sys.argv) > 1 else ""
    if phase in {"--self-test", "self-test"}:
        self_test()
        return
    if phase not in {"prepare", "activate"}:
        raise SystemExit(
            "Uso: cloudflare_production_pages.py prepare|activate|--self-test"
        )

    project = ensure_pages_project()
    if phase == "prepare":
        write_outputs(
            pages_project=PAGES_PROJECT,
            pages_origin=PAGES_TARGET,
            project=project,
        )
        print(
            "Cloudflare Pages production preparado sin tocar tráfico público: "
            f"project={PAGES_PROJECT} ({project}), origin={PAGES_TARGET}"
        )
        return

    zone_id = find_zone_id()
    domain = ensure_pages_domain()
    dns = ensure_pages_cname(zone_id)
    analytics = ensure_web_analytics(zone_id)
    write_outputs(
        pages_project=PAGES_PROJECT,
        pages_origin=PAGES_TARGET,
        pages_hostname=PAGES_HOSTNAME,
        project=project,
        domain=domain,
        dns=dns,
        analytics=analytics,
    )
    print(
        "Cloudflare Pages production activado: "
        f"project={project}, domain={domain}, DNS={dns}, Web Analytics={analytics}"
    )


if __name__ == "__main__":
    main()
