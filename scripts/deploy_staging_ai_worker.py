#!/usr/bin/env python3
"""Deploys the isolated staging Workers AI service without exposing its secret.

The shared secret already lives on the Render staging service. This helper
validates that the supplied service really is Chess Studio staging, reads that
single value through the authenticated Render API and streams it to Wrangler's
stdin. The secret is never written to disk, argv or logs.
"""
from __future__ import annotations

import argparse
import os
import pathlib
import subprocess

import render_staging_bootstrap as render

ROOT = pathlib.Path(__file__).resolve().parents[1]
CONFIG = ROOT / "infra/cloudflare/wrangler.staging.toml"
SERVICE_NAME = "chess-study-backend-staging"
WORKER_NAME = "chess-studio-narrative-ai-staging"
WORKER_URL = "https://ai-staging.shadowops.dpdns.org"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta {name} para desplegar Workers AI de staging")
    return value


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    service = payload.get("service")
    return service if isinstance(service, dict) else payload


def validate_service(service_id: str) -> str:
    service = unwrap_service(render.api("GET", f"/services/{service_id}"))
    if str(service.get("name") or "") != SERVICE_NAME:
        raise SystemExit("El service ID no corresponde al backend de staging; no se lee ningún secreto")
    if (render.read_env(service_id, "ENVIRONMENT") or "").strip().lower() != "staging":
        raise SystemExit("El servicio no declara ENVIRONMENT=staging; aborto fail-closed")
    if (render.read_env(service_id, "CF_AI_WORKER_URL") or "").rstrip("/") != WORKER_URL:
        raise SystemExit("CF_AI_WORKER_URL de staging no apunta al Worker aislado esperado")
    secret = render.read_env(service_id, "CHESS_AI_SHARED_SECRET") or ""
    if len(secret) < 32:
        raise SystemExit("CHESS_AI_SHARED_SECRET de staging falta o es demasiado corto")
    return secret


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
    required_fragments = (
        f'name = "{WORKER_NAME}"',
        'workers_dev = false',
        'pattern = "ai-staging.shadowops.dpdns.org"',
        'custom_domain = true',
        'binding = "AI"',
        'name = "AI_RATE_LIMITER"',
        'namespace_id = "1606602"',
    )
    missing = [fragment for fragment in required_fragments if fragment not in text]
    if missing:
        raise SystemExit(f"wrangler.staging.toml incompleto: {missing}")
    production = (ROOT / "infra/cloudflare/wrangler.toml").read_text(encoding="utf-8")
    if f'name = "{WORKER_NAME}"' in production or "ai-staging.shadowops.dpdns.org" in production:
        raise SystemExit("La configuración de producción contiene identidad/ruta de staging")
    print("staging-ai-worker self-test OK · identidad, ruta y rate-limit aislados")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--service-id")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    service_id = str(args.service_id or "").strip()
    if not service_id:
        raise SystemExit("Falta --service-id del bootstrap de Render staging")

    secret = validate_service(service_id)
    wrangler(["deploy"])
    wrangler(["secret", "put", "CHESS_AI_SHARED_SECRET"], stdin=secret + "\n")
    print(f"Workers AI staging desplegado: {WORKER_NAME} · secreto sincronizado sin exponerlo")


if __name__ == "__main__":
    main()
