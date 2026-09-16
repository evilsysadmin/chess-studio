#!/usr/bin/env python3
"""Mantiene cerrado el ingreso directo al backend Render de producción.

El pipeline promociona SHAs concretos después de staging. Un auto-deploy paralelo
podría saltarse ese gate, y el hostname ``*.onrender.com`` podría saltarse el
proxy/WAF de Cloudflare. Este guardrail reconcilia ambos controles de forma
idempotente: ``autoDeploy=no`` y ``renderSubdomainPolicy=disabled``.

Reutiliza la detección fail-closed del backend de producción del bootstrap de
staging y nunca imprime secretos ni variables de entorno.
"""
from __future__ import annotations

import os
import sys

from render_staging_bootstrap import api, find_production_service


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("service")
    return nested if isinstance(nested, dict) else payload


def render_subdomain_policy(service: dict) -> str:
    details = service.get("serviceDetails")
    if not isinstance(details, dict):
        return ""
    return str(details.get("renderSubdomainPolicy") or "").strip().lower()


def desired_patch(service: dict) -> dict:
    patch: dict = {}
    if str(service.get("autoDeploy") or "").strip().lower() != "no":
        patch["autoDeploy"] = "no"
    if render_subdomain_policy(service) != "disabled":
        patch["serviceDetails"] = {"renderSubdomainPolicy": "disabled"}
    return patch


def self_test() -> None:
    conforming = {
        "autoDeploy": "no",
        "serviceDetails": {"renderSubdomainPolicy": "disabled"},
    }
    assert desired_patch(conforming) == {}

    exposed = {
        "autoDeploy": "yes",
        "serviceDetails": {"renderSubdomainPolicy": "enabled"},
    }
    assert desired_patch(exposed) == {
        "autoDeploy": "no",
        "serviceDetails": {"renderSubdomainPolicy": "disabled"},
    }

    missing_details = {"autoDeploy": "no"}
    assert desired_patch(missing_details) == {
        "serviceDetails": {"renderSubdomainPolicy": "disabled"},
    }

    wrapped = {"service": conforming}
    assert unwrap_service(wrapped) == conforming
    assert render_subdomain_policy(unwrap_service(wrapped)) == "disabled"
    print("render-production-guardrail self-test OK · autoDeploy off + onrender disabled")


def main() -> None:
    production = find_production_service()
    service_id = str(production.get("id") or "").strip()
    service_name = str(production.get("name") or "").strip()
    if not service_id or not service_name:
        raise SystemExit("No se pudo resolver de forma segura el backend de producción")

    patch = desired_patch(production)
    changed = bool(patch)
    if patch:
        api("PATCH", f"/services/{service_id}", patch)

    verified = unwrap_service(api("GET", f"/services/{service_id}"))
    actual_autodeploy = str(verified.get("autoDeploy") or "").strip().lower()
    if actual_autodeploy != "no":
        raise SystemExit(
            f"Render production autoDeploy quedó en {actual_autodeploy or '<sin dato>'}, esperaba no"
        )

    actual_subdomain = render_subdomain_policy(verified)
    if actual_subdomain != "disabled":
        raise SystemExit(
            "Render production renderSubdomainPolicy quedó en "
            f"{actual_subdomain or '<sin dato>'}, esperaba disabled"
        )

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"changed={'true' if changed else 'false'}\n")

    state = "corregido" if changed else "ya conforme"
    print(
        f"Render production guardrail OK: {service_name} · autoDeploy=no · "
        f"onrender=disabled · {state}"
    )


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
