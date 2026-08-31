#!/usr/bin/env python3
"""Mantiene el backend de producción fuera del auto-deploy de Render.

El pipeline promociona SHAs concretos después de staging. Un auto-deploy paralelo
podría saltarse ese gate y desplegar el último main por su cuenta, por lo que
este guardrail reconcilia ``autoDeploy=no`` de forma idempotente.

Reutiliza la detección fail-closed del backend de producción del bootstrap de
staging y nunca imprime secretos ni variables de entorno.
"""
from __future__ import annotations

import os

from render_staging_bootstrap import api, find_production_service


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("service")
    return nested if isinstance(nested, dict) else payload


def main() -> None:
    production = find_production_service()
    service_id = str(production.get("id") or "").strip()
    service_name = str(production.get("name") or "").strip()
    if not service_id or not service_name:
        raise SystemExit("No se pudo resolver de forma segura el backend de producción")

    changed = str(production.get("autoDeploy") or "").strip().lower() != "no"
    if changed:
        api("PATCH", f"/services/{service_id}", {"autoDeploy": "no"})

    verified = unwrap_service(api("GET", f"/services/{service_id}"))
    actual = str(verified.get("autoDeploy") or "").strip().lower()
    if actual != "no":
        raise SystemExit(f"Render production autoDeploy quedó en {actual or '<sin dato>'}, esperaba no")

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"changed={'true' if changed else 'false'}\n")

    print(f"Render production guardrail OK: {service_name} · autoDeploy=no · {'corregido' if changed else 'ya conforme'}")


if __name__ == "__main__":
    main()
