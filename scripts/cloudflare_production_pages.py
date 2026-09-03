#!/usr/bin/env python3
"""Idempotent Cloudflare Pages bootstrap/cutover for Chess Studio production.

The production workflow deliberately runs this in two phases:

* ``prepare`` creates/reconciles only the Direct Upload Pages project. The
  public chess-studio hostname keeps pointing at the current production host.
* ``activate`` attaches the custom domain and reconciles DNS only after the
  exact tested SHA is already serving successfully on the pages.dev origin.

Cloudflare custom-domain activation is asynchronous. ``activate`` therefore
waits for the Pages domain API to report ``active`` after DNS reconciliation,
instead of racing the public build-identity probe against edge propagation.
"""

from __future__ import annotations

import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from frontend_asset_convergence import wait_for_frontend_assets

API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
PAGES_PROJECT = "chess-studio-production"
PAGES_HOSTNAME = "chess-studio.shadowops.dpdns.org"
PAGES_TARGET = f"{PAGES_PROJECT}.pages.dev"
DOMAIN_ACTIVE_TIMEOUT_S = 600
DOMAIN_ACTIVE_POLL_S = 5


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


def pages_domain_path() -> str:
    encoded = urllib.parse.quote(PAGES_HOSTNAME, safe="")
    return f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}/domains/{encoded}"


def ensure_pages_domain() -> str:
    path = pages_domain_path()
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


def pages_domain_status() -> tuple[str, str]:
    status, body = request_json("GET", pages_domain_path())
    domain = result_or_die(status, body, context="Consultar estado custom domain de Pages")
    if not isinstance(domain, dict):
        raise SystemExit("Cloudflare devolvió un custom domain inesperado")
    state = str(domain.get("status") or "unknown")
    details: list[str] = []
    for name in ("validation_data", "verification_data"):
        data = domain.get(name)
        if not isinstance(data, dict):
            continue
        substate = str(data.get("status") or "")
        error = str(data.get("error_message") or "")
        if substate:
            details.append(f"{name}={substate}")
        if error:
            details.append(f"{name}.error={error}")
    return state, ", ".join(details)


def wait_pages_domain_active(
    *,
    timeout_s: int = DOMAIN_ACTIVE_TIMEOUT_S,
    poll_s: int = DOMAIN_ACTIVE_POLL_S,
) -> str:
    deadline = time.monotonic() + timeout_s
    attempt = 0
    last_state = "unknown"
    last_detail = ""
    while True:
        attempt += 1
        last_state, last_detail = pages_domain_status()
        if last_state == "active":
            print(f"Custom domain Pages activo tras {attempt} comprobaciones.")
            return last_state
        if last_state in {"deactivated", "blocked", "error"}:
            raise SystemExit(
                f"Custom domain Pages terminó en estado {last_state}"
                f"{': ' + last_detail if last_detail else ''}"
            )
        if time.monotonic() >= deadline:
            raise SystemExit(
                f"Custom domain Pages no llegó a active en {timeout_s}s; "
                f"último estado={last_state}{', ' + last_detail if last_detail else ''}"
            )
        print(
            f"Custom domain Pages aún {last_state} "
            f"(intento {attempt}, {last_detail or 'sin detalle'}); reintentando..."
        )
        time.sleep(poll_s)


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
    assert DOMAIN_ACTIVE_TIMEOUT_S >= 300
    assert 1 <= DOMAIN_ACTIVE_POLL_S <= 30
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

    # release.json can converge before every hashed module referenced by the
    # new index. Never move public traffic until the real entry graph is
    # executable on pages.dev.
    wait_for_frontend_assets(
        f"https://{PAGES_TARGET}",
        label="Production Pages origin",
    )

    zone_id = find_zone_id()
    domain = ensure_pages_domain()
    dns = ensure_pages_cname(zone_id)
    domain_status = wait_pages_domain_active()

    # The custom domain has its own edge propagation window. Prove that the
    # public hostname serves a coherent index + hashed JS/CSS before declaring
    # activation complete.
    wait_for_frontend_assets(
        f"https://{PAGES_HOSTNAME}",
        label="Production custom domain",
    )

    analytics = ensure_web_analytics(zone_id)
    write_outputs(
        pages_project=PAGES_PROJECT,
        pages_origin=PAGES_TARGET,
        pages_hostname=PAGES_HOSTNAME,
        project=project,
        domain=domain,
        dns=dns,
        domain_status=domain_status,
        analytics=analytics,
    )
    print(
        "Cloudflare Pages production activado: "
        f"project={project}, domain={domain}, DNS={dns}, "
        f"domain_status={domain_status}, Web Analytics={analytics}"
    )


if __name__ == "__main__":
    main()
