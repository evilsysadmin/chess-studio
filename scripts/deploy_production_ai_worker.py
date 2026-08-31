#!/usr/bin/env python3
"""Deploy the production Workers AI script only after staging promotion.

The worker's shared secret is read from the validated Render production service
and streamed to Wrangler stdin. The helper never writes or prints the secret and
refuses to deploy if the production Custom Domain or Render environment contract
is not exactly what Chess Studio expects.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import tomllib
import urllib.error
import urllib.parse
import urllib.request

from render_staging_bootstrap import find_production_service, read_env

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "infra/cloudflare/wrangler.toml"
CF_API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
WORKER_NAME = "chess-studio-narrative-ai"
WORKER_HOSTNAME = "ai.shadowops.dpdns.org"
WORKER_URL = f"https://{WORKER_HOSTNAME}"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para desplegar Workers AI de producción")
    return value


def validate_production_service() -> tuple[str, str]:
    service = find_production_service()
    service_id = str(service.get("id") or "").strip()
    if not service_id:
        raise SystemExit("No se pudo resolver el backend de producción")
    environment = (read_env(service_id, "ENVIRONMENT") or "").strip().lower()
    database = (read_env(service_id, "MONGO_DB_NAME") or "").strip()
    worker_url = (read_env(service_id, "CF_AI_WORKER_URL") or "").rstrip("/")
    secret = read_env(service_id, "CHESS_AI_SHARED_SECRET") or ""
    if environment not in {"production", "prod"}:
        raise SystemExit("El backend de producción no declara ENVIRONMENT=production")
    if database != "chess_study":
        raise SystemExit("El backend de producción no apunta a chess_study")
    if worker_url != WORKER_URL:
        raise SystemExit(f"CF_AI_WORKER_URL de producción no apunta a {WORKER_URL}")
    if len(secret) < 32:
        raise SystemExit("CHESS_AI_SHARED_SECRET de producción falta o es demasiado corto")
    return service_id, secret


def cf_request(path: str) -> object:
    request = urllib.request.Request(
        f"{CF_API}{path}",
        headers={
            "Authorization": f"Bearer {required('CLOUDFLARE_API_TOKEN')}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            body = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(f"Cloudflare GET {path}: HTTP {exc.code}: {detail}") from None
    if not isinstance(body, dict) or body.get("success") is False:
        raise SystemExit(f"Cloudflare GET {path} no devolvió un resultado válido")
    return body.get("result")


def validate_custom_domain() -> None:
    account_id = required("CLOUDFLARE_ACCOUNT_ID")
    query = urllib.parse.urlencode({"hostname": WORKER_HOSTNAME})
    rows = cf_request(f"/accounts/{account_id}/workers/domains?{query}")
    rows = rows if isinstance(rows, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("hostname") == WORKER_HOSTNAME]
    if len(matches) != 1:
        raise SystemExit(f"Se esperaba un único Custom Domain {WORKER_HOSTNAME}; encontrados {len(matches)}")
    domain = matches[0]
    if str(domain.get("service") or "") != WORKER_NAME:
        raise SystemExit(f"{WORKER_HOSTNAME} apunta a otro Worker: {domain.get('service')}")
    zone_name = str(domain.get("zone_name") or "")
    if zone_name and zone_name != ZONE_NAME:
        raise SystemExit(f"{WORKER_HOSTNAME} pertenece a zona inesperada: {zone_name}")


def wrangler(args: list[str], *, stdin: str | None = None) -> None:
    required("CLOUDFLARE_API_TOKEN")
    required("CLOUDFLARE_ACCOUNT_ID")
    result = subprocess.run(
        ["npx", "--yes", "wrangler@4", *args, "--config", str(CONFIG)],
        cwd=ROOT,
        env=os.environ.copy(),
        input=stdin,
        text=True,
        check=False,
    )
    if result.returncode:
        raise SystemExit(f"Wrangler falló con código {result.returncode}; producción AI no queda acreditada")


def self_test() -> None:
    try:
        config = tomllib.loads(CONFIG.read_text(encoding="utf-8"))
    except tomllib.TOMLDecodeError as exc:
        raise SystemExit(f"wrangler.toml no es TOML válido: {exc}") from exc
    if config.get("name") != WORKER_NAME:
        raise SystemExit(f"Wrangler production usa identidad inesperada: {config.get('name')!r}")
    if config.get("workers_dev") is not False:
        raise SystemExit("Wrangler production debe declarar workers_dev=false")
    if "routes" in config:
        raise SystemExit("Wrangler production no debe administrar el Custom Domain como route")
    ai = config.get("ai")
    if not isinstance(ai, dict) or ai.get("binding") != "AI":
        raise SystemExit("Wrangler production no declara el binding AI esperado")
    limits = config.get("ratelimits") if isinstance(config.get("ratelimits"), list) else []
    limiter = next((item for item in limits if isinstance(item, dict) and item.get("name") == "AI_RATE_LIMITER"), None)
    if not limiter or str(limiter.get("namespace_id") or "") != "1606601":
        raise SystemExit("Wrangler production no declara el namespace de rate-limit esperado")
    simple = limiter.get("simple")
    if not isinstance(simple, dict) or simple.get("limit") != 300 or simple.get("period") != 60:
        raise SystemExit("Wrangler production tiene un contrato de rate-limit inesperado")
    staging = (ROOT / "infra/cloudflare/wrangler.staging.toml").read_text(encoding="utf-8")
    if WORKER_HOSTNAME in staging or f'name = "{WORKER_NAME}"' in staging:
        raise SystemExit("La configuración staging contiene identidad/ruta de producción")
    print("production-ai-worker self-test OK · identidad, workers.dev y rate-limit aislados")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    _service_id, secret = validate_production_service()
    validate_custom_domain()
    wrangler(["deploy"])
    wrangler(["secret", "put", "CHESS_AI_SHARED_SECRET", "--name", WORKER_NAME], stdin=secret + "\n")
    validate_custom_domain()
    print(f"Workers AI production desplegado: {WORKER_NAME} · secreto sincronizado · Custom Domain verificado")


if __name__ == "__main__":
    main()
