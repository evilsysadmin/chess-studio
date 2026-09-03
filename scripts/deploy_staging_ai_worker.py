#!/usr/bin/env python3
"""Deploy the isolated staging Workers AI service with least privilege.

Wrangler uploads only the Worker script and bindings. The Custom Domain is then
attached through the account-level Workers Domains API, which needs Workers
Scripts Write but not the broader zone-level Workers Routes permission.

The shared secret already lives on the Render staging service. This helper
validates that service, reads the secret through the authenticated Render API
and streams it to Wrangler's stdin. The secret is never written to disk, argv
or logs. The non-sensitive generation SHA is installed through the same binding
mechanism so /health can prove the exact Worker generation at runtime.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import time
import tomllib
import urllib.error
import urllib.parse
import urllib.request

import render_staging_bootstrap as render

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "infra/cloudflare/wrangler.staging.toml"
STAGING_WRAPPER = ROOT / "infra/cloudflare/worker/staging.js"
CF_API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
SERVICE_NAME = "chess-study-backend-staging"
WORKER_NAME = "chess-studio-narrative-ai-staging"
WORKER_HOSTNAME = "ai-staging.shadowops.dpdns.org"
WORKER_URL = f"https://{WORKER_HOSTNAME}"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para desplegar Workers AI de staging")
    return value


def required_deploy_sha() -> str:
    value = required("DEPLOY_SHA").lower()
    if len(value) != 40 or any(char not in "0123456789abcdef" for char in value):
        raise SystemExit(f"DEPLOY_SHA inválido para Workers AI staging: {value!r}")
    return value


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    service = payload.get("service")
    return service if isinstance(service, dict) else payload


def resolve_staging_service() -> dict:
    service = render.find_service(SERVICE_NAME)
    if not service or not service.get("id"):
        raise SystemExit(f"No existe un único servicio Render {SERVICE_NAME}")
    return service


def validate_service(service_id: str) -> str:
    service = unwrap_service(render.api("GET", f"/services/{service_id}"))
    if str(service.get("name") or "") != SERVICE_NAME:
        raise SystemExit("El service ID no corresponde al backend de staging; no se lee ningún secreto")
    if (render.read_env(service_id, "ENVIRONMENT") or "").strip().lower() != "staging":
        raise SystemExit("El servicio no declara ENVIRONMENT=staging; aborto fail-closed")
    if (render.read_env(service_id, "MONGO_DB_NAME") or "").strip() != "chess_study_staging":
        raise SystemExit("El servicio no apunta a chess_study_staging; aborto fail-closed")
    if (render.read_env(service_id, "CF_AI_WORKER_URL") or "").rstrip("/") != WORKER_URL:
        raise SystemExit("CF_AI_WORKER_URL de staging no apunta al Worker aislado esperado")
    secret = render.read_env(service_id, "CHESS_AI_SHARED_SECRET") or ""
    if len(secret) < 32:
        raise SystemExit("CHESS_AI_SHARED_SECRET de staging falta o es demasiado corto")
    return secret


def cf_request(method: str, path: str, payload: dict | None = None) -> tuple[int, object]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{CF_API}{path}",
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
            body = {"errors": [{"message": raw.decode("utf-8", "replace")[:300]}]}
        return exc.code, body


def cf_result(status: int, body: object, *, context: str, allowed: set[int] | None = None) -> object:
    allowed = allowed or {200}
    if status not in allowed or (isinstance(body, dict) and body.get("success") is False):
        errors = body.get("errors") if isinstance(body, dict) else []
        details = []
        for item in (errors if isinstance(errors, list) else []):
            if isinstance(item, dict):
                details.append(str(item.get("message") or item.get("code") or "error"))
        suffix = f": {'; '.join(details[:3])}" if details else ""
        raise SystemExit(f"{context}: Cloudflare respondió HTTP {status}{suffix}")
    return body.get("result") if isinstance(body, dict) else body


def cloudflare_zone_id() -> str:
    account_id = required("CLOUDFLARE_ACCOUNT_ID")
    query = urllib.parse.urlencode({"name": ZONE_NAME, "account.id": account_id, "per_page": "50"})
    status, body = cf_request("GET", f"/zones?{query}")
    rows = cf_result(status, body, context="Resolver zona Cloudflare")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME and row.get("id")]
    if len(matches) != 1:
        raise SystemExit(f"Se esperaba una única zona Cloudflare {ZONE_NAME}; encontradas {len(matches)}")
    return str(matches[0]["id"])


def ensure_custom_domain() -> str:
    account_id = required("CLOUDFLARE_ACCOUNT_ID")
    zone_id = cloudflare_zone_id()
    query = urllib.parse.urlencode({"hostname": WORKER_HOSTNAME})
    status, body = cf_request("GET", f"/accounts/{account_id}/workers/domains?{query}")
    rows = cf_result(status, body, context="Consultar Custom Domain staging")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("hostname") == WORKER_HOSTNAME]
    if len(matches) > 1:
        raise SystemExit(f"Cloudflare devolvió más de un Custom Domain para {WORKER_HOSTNAME}")

    if matches:
        current = matches[0]
        if str(current.get("service") or "") == WORKER_NAME and str(current.get("zone_id") or "") == zone_id:
            print(f"Custom Domain staging ya converge: {WORKER_HOSTNAME} → {WORKER_NAME}")
            return "unchanged"

    desired = {
        "hostname": WORKER_HOSTNAME,
        "service": WORKER_NAME,
        "zone_id": zone_id,
        "zone_name": ZONE_NAME,
    }
    status, body = cf_request("PUT", f"/accounts/{account_id}/workers/domains", desired)
    result = cf_result(status, body, context="Adjuntar Custom Domain staging", allowed={200, 201})
    if not isinstance(result, dict):
        raise SystemExit("Cloudflare no devolvió metadata del Custom Domain staging")
    if str(result.get("hostname") or "") != WORKER_HOSTNAME or str(result.get("service") or "") != WORKER_NAME:
        raise SystemExit("Cloudflare adjuntó un Custom Domain distinto del solicitado")
    print(f"Custom Domain staging reconciliado: {WORKER_HOSTNAME} → {WORKER_NAME}")
    return "updated" if matches else "created"


def runtime_health() -> tuple[int, dict]:
    request = urllib.request.Request(
        f"{WORKER_URL}/health?generation_probe={time.time_ns()}",
        method="GET",
        headers={
            "Accept": "application/json",
            "Cache-Control": "no-cache, no-store",
            "Pragma": "no-cache",
            "User-Agent": "chess-studio-staging-worker-generation/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read()
            try:
                body = json.loads(raw) if raw else {}
            except json.JSONDecodeError:
                body = {}
            return response.status, body if isinstance(body, dict) else {}
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except (urllib.error.URLError, TimeoutError):
        return 0, {}


def wait_for_runtime_build(deploy_sha: str, *, attempts: int = 60, interval: float = 2.0) -> None:
    """Wait until the Custom Domain serves the exact version just deployed.

    Cloudflare version/deployment updates are asynchronous at the edge. A plain
    HTTP-200 health check can therefore observe the previous healthy version for
    a short window after `wrangler secret put BUILD_SHA` returns. Accreditation
    must wait for identity, not merely liveness.
    """
    last_status = 0
    last_build = ""
    for attempt in range(1, attempts + 1):
        last_status, body = runtime_health()
        last_build = str(body.get("build") or "").lower()
        if last_status == 200 and last_build == deploy_sha:
            print(f"Workers AI staging runtime converge: build={deploy_sha} (intento {attempt}/{attempts})")
            return
        print(
            "Workers AI staging aún sirve otra generación "
            f"(HTTP {last_status or 'curl-error'}, build={last_build or '<vacío>'}, intento {attempt}/{attempts})"
        )
        if attempt < attempts:
            time.sleep(interval)
    raise SystemExit(
        "Workers AI staging no convergió a la generación exacta tras "
        f"{attempts * interval:.0f}s: HTTP {last_status or 'error'}, build={last_build or '<vacío>'}, esperaba {deploy_sha}"
    )


def wrangler(args: list[str], *, stdin: str | None = None) -> None:
    required("CLOUDFLARE_API_TOKEN")
    required("CLOUDFLARE_ACCOUNT_ID")
    command = ["npx", "--yes", "wrangler@4", *args, "--config", str(CONFIG)]
    result = subprocess.run(
        command,
        cwd=ROOT,
        env=os.environ.copy(),
        input=stdin,
        text=True,
        check=False,
    )
    if result.returncode:
        raise SystemExit(f"Wrangler falló con código {result.returncode}; staging AI no queda acreditado")


def self_test() -> None:
    text = CONFIG.read_text(encoding="utf-8")
    try:
        config = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise SystemExit(f"wrangler.staging.toml no es TOML válido: {exc}") from exc

    if config.get("name") != WORKER_NAME:
        raise SystemExit(f"Wrangler staging usa identidad inesperada: {config.get('name')!r}")
    if config.get("main") != "worker/staging.js":
        raise SystemExit("Wrangler staging debe usar el wrapper que publica BUILD_SHA")
    if config.get("workers_dev") is not False:
        raise SystemExit("Wrangler staging debe mantener workers_dev=false")
    if "routes" in config:
        raise SystemExit("Wrangler staging no debe declarar routes; Custom Domains se gestionan por API account-level")

    wrapper = STAGING_WRAPPER.read_text(encoding="utf-8") if STAGING_WRAPPER.exists() else ""
    if "BUILD_SHA" not in wrapper or "./index.js" not in wrapper or "'/health'" not in wrapper:
        raise SystemExit("Wrapper staging no acredita build ni delega en el Worker compartido")

    ai = config.get("ai")
    if not isinstance(ai, dict) or ai.get("binding") != "AI":
        raise SystemExit("Wrangler staging no declara el binding AI esperado")

    rate_limits = config.get("ratelimits")
    rate_limits = rate_limits if isinstance(rate_limits, list) else []
    limiter = next((item for item in rate_limits if isinstance(item, dict) and item.get("name") == "AI_RATE_LIMITER"), None)
    if not limiter or str(limiter.get("namespace_id") or "") != "1606602":
        raise SystemExit("Wrangler staging no declara el rate-limit aislado esperado")
    simple = limiter.get("simple")
    if not isinstance(simple, dict) or simple.get("limit") != 300 or simple.get("period") != 60:
        raise SystemExit("Wrangler staging tiene un contrato de rate-limit inesperado")

    production = (ROOT / "infra/cloudflare/wrangler.toml").read_text(encoding="utf-8")
    if f'name = "{WORKER_NAME}"' in production or WORKER_HOSTNAME in production:
        raise SystemExit("La configuración de producción contiene identidad/ruta de staging")
    print("staging-ai-worker self-test OK · wrapper build-aware, script route-free, identidad y rate-limit aislados")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--service-id")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    deploy_sha = required_deploy_sha()
    service_id = str(args.service_id or "").strip()
    if not service_id:
        service_id = str(resolve_staging_service()["id"])

    secret = validate_service(service_id)
    wrangler(["deploy"])
    wrangler(["secret", "put", "CHESS_AI_SHARED_SECRET"], stdin=secret + "\n")
    # Instalado al final para que el runtime que acreditamos siempre publique la
    # generación exacta incluso si un secret update crea una nueva versión.
    wrangler(["secret", "put", "BUILD_SHA"], stdin=deploy_sha + "\n")
    domain_state = ensure_custom_domain()
    wait_for_runtime_build(deploy_sha)
    print(
        f"Workers AI staging desplegado: {WORKER_NAME} · build={deploy_sha} · "
        f"secreto sincronizado sin exponerlo · Custom Domain={domain_state}"
    )


if __name__ == "__main__":
    main()
