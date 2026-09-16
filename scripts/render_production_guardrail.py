#!/usr/bin/env python3
"""Mantiene cerrado el ingreso directo al backend Render de producción.

El pipeline promociona SHAs concretos después de staging. Un auto-deploy paralelo
podría saltarse ese gate, y el hostname ``*.onrender.com`` podría saltarse el
proxy/WAF de Cloudflare. Este guardrail reconcilia ambos controles de forma
idempotente: ``autoDeploy=no`` y ``renderSubdomainPolicy=disabled``.

Render no expone ``renderSubdomainPolicy`` en el objeto de servicio recuperado,
así que el cierre del subdominio se verifica por su efecto real: el origen
Render del servicio debe responder 404. Nunca se imprimen secretos ni variables
de entorno.
"""
from __future__ import annotations

import os
import re
import sys
import time
from urllib.parse import urlsplit

from production_ingress_smoke import probe, render_origin_error
from render_staging_bootstrap import api, find_production_service


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("service")
    return nested if isinstance(nested, dict) else payload


def service_origin_ready_url(service: dict) -> str:
    """Return the exact Render-owned readiness URL, failing closed otherwise."""
    raw = str(service.get("url") or "").strip().rstrip("/")
    if raw:
        parsed = urlsplit(raw)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme == "https" and hostname.endswith(".onrender.com"):
            return f"{raw}/api/ready"

    # Render's service object guarantees a stable slug even in representations
    # where `url` is omitted. The default provider hostname is derived from it.
    slug = str(service.get("slug") or "").strip().lower()
    if re.fullmatch(r"[a-z0-9][a-z0-9-]{0,126}[a-z0-9]", slug) or re.fullmatch(r"[a-z0-9]", slug):
        return f"https://{slug}.onrender.com/api/ready"

    raise ValueError("el servicio de producción no expone url/slug Render verificable")


def origin_is_locked(origin_ready_url: str) -> bool:
    try:
        return render_origin_error(probe(origin_ready_url, timeout=5.0)) is None
    except OSError:
        return False


def wait_for_origin_lock(
    origin_ready_url: str,
    *,
    attempts: int = 5,
    delay_seconds: float = 1.0,
) -> bool:
    """Allow a few seconds for Render edge policy propagation, then fail closed."""
    total = max(1, int(attempts))
    for attempt in range(total):
        if origin_is_locked(origin_ready_url):
            return True
        if attempt + 1 < total:
            time.sleep(max(0.0, float(delay_seconds)))
    return False


def desired_patch(service: dict, *, origin_locked: bool) -> dict:
    patch: dict = {}
    if str(service.get("autoDeploy") or "").strip().lower() != "no":
        patch["autoDeploy"] = "no"
    if not origin_locked:
        patch["serviceDetails"] = {"renderSubdomainPolicy": "disabled"}
    return patch


def self_test() -> None:
    conforming = {
        "id": "srv-test",
        "name": "chess-studio",
        "slug": "chess-studio",
        "url": "https://chess-studio.onrender.com",
        "autoDeploy": "no",
    }
    assert desired_patch(conforming, origin_locked=True) == {}
    assert service_origin_ready_url(conforming) == "https://chess-studio.onrender.com/api/ready"

    slug_only = {key: value for key, value in conforming.items() if key != "url"}
    assert service_origin_ready_url(slug_only) == "https://chess-studio.onrender.com/api/ready"

    exposed = {**conforming, "autoDeploy": "yes"}
    assert desired_patch(exposed, origin_locked=False) == {
        "autoDeploy": "no",
        "serviceDetails": {"renderSubdomainPolicy": "disabled"},
    }
    assert desired_patch(conforming, origin_locked=False) == {
        "serviceDetails": {"renderSubdomainPolicy": "disabled"},
    }

    wrapped = {"service": conforming}
    assert unwrap_service(wrapped) == conforming

    invalid = {**conforming, "url": "https://example.com", "slug": "not valid!"}
    try:
        service_origin_ready_url(invalid)
    except ValueError:
        pass
    else:
        raise AssertionError("un origen no-Render debe fallar cerrado")

    print("render-production-guardrail self-test OK · autoDeploy off + live onrender 404")


def main() -> None:
    # Detection intentionally uses List services because it can identify the
    # canonical production service without relying on its historical name.
    # Fetch the selected service by ID afterwards: Retrieve service is the
    # authoritative detailed representation for runtime settings and origin.
    selected = find_production_service()
    service_id = str(selected.get("id") or "").strip()
    if not service_id:
        raise SystemExit("No se pudo resolver de forma segura el backend de producción")

    production = unwrap_service(api("GET", f"/services/{service_id}"))
    if str(production.get("id") or "").strip() != service_id:
        raise SystemExit("Render devolvió un detalle de servicio inconsistente con el ID seleccionado")
    service_name = str(production.get("name") or selected.get("name") or "").strip()
    if not service_name:
        raise SystemExit("El backend de producción no expone nombre verificable")

    # Preserve list-only fields (notably slug on some API representations) while
    # letting the detailed service object win whenever both expose a field.
    service_view = {**selected, **production}
    try:
        origin_ready_url = service_origin_ready_url(service_view)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc

    locked_before = origin_is_locked(origin_ready_url)
    patch = desired_patch(production, origin_locked=locked_before)
    changed = bool(patch)
    if patch:
        api("PATCH", f"/services/{service_id}", patch)

    verified = unwrap_service(api("GET", f"/services/{service_id}"))
    actual_autodeploy = str(verified.get("autoDeploy") or "").strip().lower()
    if actual_autodeploy != "no":
        raise SystemExit(
            f"Render production autoDeploy quedó en {actual_autodeploy or '<sin dato>'}, esperaba no"
        )

    # Render's GET service object does not expose renderSubdomainPolicy. Verify
    # the actual security boundary instead: the provider-owned hostname must
    # be unreachable and return the documented 404.
    if not wait_for_origin_lock(origin_ready_url):
        raise SystemExit(
            "Render production mantiene accesible su hostname directo; "
            "esperaba HTTP 404 con renderSubdomainPolicy=disabled"
        )

    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"changed={'true' if changed else 'false'}\n")
            handle.write(f"render_origin_ready_url={origin_ready_url}\n")

    state = "corregido" if changed else "ya conforme"
    print(
        f"Render production guardrail OK: {service_name} · autoDeploy=no · "
        f"onrender=404 · {state}"
    )


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        self_test()
    else:
        main()
