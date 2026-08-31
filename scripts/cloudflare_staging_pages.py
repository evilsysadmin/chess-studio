#!/usr/bin/env python3
"""Bootstrap idempotente de Cloudflare Pages para Chess Studio staging.

Crea/reconcilia el proyecto Pages de staging, su custom domain y los dos CNAME
necesarios para que frontend y backend staging queden aislados de producción.
Los secretos sólo llegan por variables de entorno del runner y nunca se imprimen.
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
PAGES_PROJECT = "chess-studio-staging"
PAGES_HOSTNAME = "staging.chess-studio.shadowops.dpdns.org"
PAGES_TARGET = f"{PAGES_PROJECT}.pages.dev"
API_HOSTNAME = "api-staging.chess-studio.shadowops.dpdns.org"
RENDER_TARGET = "chess-study-backend-staging.onrender.com"


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


def result_or_die(status: int, body: object, *, context: str, allowed: set[int] | None = None) -> object:
    allowed = allowed or {200}
    if status not in allowed:
        detail = ""
        if isinstance(body, dict):
            errors = body.get("errors") or []
            if isinstance(errors, list):
                detail = "; ".join(
                    str(item.get("message") or item.get("code") or item)
                    for item in errors[:4]
                    if isinstance(item, dict)
                )
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
    query = urllib.parse.urlencode({"name": ZONE_NAME, "account.id": account_id(), "per_page": "50"})
    status, body = request_json("GET", f"/zones?{query}")
    rows = result_or_die(status, body, context="Resolver zona DNS")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME]
    if len(matches) != 1 or not matches[0].get("id"):
        raise SystemExit(f"Se esperaba una única zona {ZONE_NAME}; encontrados {len(matches)}")
    return str(matches[0]["id"])


def ensure_pages_project() -> bool:
    project_path = f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}"
    status, body = request_json("GET", project_path)
    if status == 200:
        project = result_or_die(status, body, context="Leer Pages staging")
        if not isinstance(project, dict) or project.get("name") != PAGES_PROJECT:
            raise SystemExit("Cloudflare devolvió un proyecto Pages inesperado")
        branch = str(project.get("production_branch") or "")
        if branch and branch != "main":
            patch_status, patch_body = request_json("PATCH", project_path, {"production_branch": "main"})
            result_or_die(patch_status, patch_body, context="Reconciliar production_branch de Pages")
        return False
    if status != 404:
        result_or_die(status, body, context="Consultar Pages staging")
    create_status, create_body = request_json(
        "POST",
        f"/accounts/{account_id()}/pages/projects",
        {"name": PAGES_PROJECT, "production_branch": "main"},
    )
    result_or_die(create_status, create_body, context="Crear Pages staging", allowed={200, 201})
    return True


def ensure_pages_domain() -> bool:
    encoded = urllib.parse.quote(PAGES_HOSTNAME, safe="")
    path = f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}/domains/{encoded}"
    status, body = request_json("GET", path)
    if status == 200:
        result_or_die(status, body, context="Leer custom domain de Pages")
        return False
    if status != 404:
        result_or_die(status, body, context="Consultar custom domain de Pages")
    create_status, create_body = request_json(
        "POST",
        f"/accounts/{account_id()}/pages/projects/{PAGES_PROJECT}/domains",
        {"name": PAGES_HOSTNAME},
    )
    result_or_die(create_status, create_body, context="Crear custom domain de Pages", allowed={200, 201})
    return True


def dns_rows(zone_id: str, hostname: str) -> list[dict]:
    query = urllib.parse.urlencode({"name": hostname, "per_page": "100"})
    status, body = request_json("GET", f"/zones/{zone_id}/dns_records?{query}")
    rows = result_or_die(status, body, context=f"Consultar DNS {hostname}")
    return [row for row in (rows if isinstance(rows, list) else []) if isinstance(row, dict)]


def ensure_cname(zone_id: str, hostname: str, target: str, *, proxied: bool, comment: str) -> str:
    rows = dns_rows(zone_id, hostname)
    if len(rows) > 1:
        raise SystemExit(f"Más de un DNS record para {hostname}; no reconcilio ambiguamente")
    desired = {
        "type": "CNAME",
        "name": hostname,
        "content": target,
        "proxied": proxied,
        "ttl": 1,
        "comment": comment,
    }
    if not rows:
        status, body = request_json("POST", f"/zones/{zone_id}/dns_records", desired)
        row = result_or_die(status, body, context=f"Crear DNS {hostname}", allowed={200, 201})
        return "created" if isinstance(row, dict) else "created"

    row = rows[0]
    if row.get("type") != "CNAME":
        raise SystemExit(f"{hostname} ya existe pero es {row.get('type')}, no CNAME")
    record_id = str(row.get("id") or "")
    if not record_id:
        raise SystemExit(f"Cloudflare no devolvió id para {hostname}")
    current_target = str(row.get("content") or "").rstrip(".")
    current_proxied = bool(row.get("proxied"))
    if current_target == target.rstrip(".") and current_proxied == proxied:
        return "unchanged"
    status, body = request_json("PATCH", f"/zones/{zone_id}/dns_records/{record_id}", desired)
    result_or_die(status, body, context=f"Reconciliar DNS {hostname}")
    return "updated"


def ensure_web_analytics(zone_id: str) -> str:
    """Activa RUM si el token ya tiene permisos de Account Settings.

    Pages/hosting no debe depender de este permiso adicional. Si el token actual
    sólo tiene Pages/DNS/Workers, dejamos un aviso claro y el staging sigue vivo.
    """
    status, body = request_json("GET", f"/accounts/{account_id()}/rum/site_info/list?per_page=100")
    if status in {401, 403}:
        print("AVISO: Web Analytics no reconciliado; el token necesita Account Settings Read/Write.")
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
        print("AVISO: Web Analytics no creado; el token necesita Account Settings Write.")
        return "permission-missing"
    result_or_die(status, body, context="Crear Web Analytics", allowed={200, 201})
    return "created"


def write_outputs(**values: str) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if not path:
        return
    with open(path, "a", encoding="utf-8") as handle:
        for key, value in values.items():
            handle.write(f"{key}={value}\n")


def main() -> None:
    zone_id = find_zone_id()
    project_created = ensure_pages_project()
    domain_created = ensure_pages_domain()
    pages_dns = ensure_cname(
        zone_id,
        PAGES_HOSTNAME,
        PAGES_TARGET,
        proxied=True,
        comment="Chess Studio staging frontend · Cloudflare Pages",
    )
    api_dns = ensure_cname(
        zone_id,
        API_HOSTNAME,
        RENDER_TARGET,
        proxied=False,
        comment="Chess Studio staging API · Render",
    )
    analytics = ensure_web_analytics(zone_id)
    write_outputs(
        pages_project=PAGES_PROJECT,
        pages_hostname=PAGES_HOSTNAME,
        api_hostname=API_HOSTNAME,
        analytics=analytics,
    )
    print(
        "Cloudflare staging reconciliado: "
        f"Pages={PAGES_PROJECT} ({'creado' if project_created else 'existente'}), "
        f"domain={'creado' if domain_created else 'existente'}, "
        f"DNS pages={pages_dns}, DNS api={api_dns}, Web Analytics={analytics}"
    )


if __name__ == "__main__":
    main()
