#!/usr/bin/env python3
"""Promote exactly one staging-approved Git SHA to Render production.

This helper is intentionally fail-closed: it resolves the production service
using the existing repository/Mongo guardrails, requires Render auto-deploy to
remain disabled, refuses the staging database and waits until Render marks the
requested commit live. Secrets are only read by the shared Render API client.
"""
from __future__ import annotations

import argparse
import os
import time

import render_staging_bootstrap as render

PRODUCTION_DB = "chess_study"
STAGING_DB = "chess_study_staging"
TERMINAL_FAILURES = {
    "build_failed",
    "update_failed",
    "pre_deploy_failed",
    "canceled",
    "deactivated",
}


def unwrap_service(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("service")
    return nested if isinstance(nested, dict) else payload


def unwrap_deploy(payload: object) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get("deploy")
    return nested if isinstance(nested, dict) else payload


def deploy_commit(deploy: dict) -> str:
    commit = deploy.get("commit")
    if isinstance(commit, dict):
        return str(commit.get("id") or "").strip().lower()
    return str(deploy.get("commitId") or "").strip().lower()


def validate_sha(value: str) -> str:
    sha = value.strip().lower()
    if len(sha) != 40 or any(ch not in "0123456789abcdef" for ch in sha):
        raise SystemExit(f"DEPLOY_SHA no es un commit completo: {value!r}")
    return sha


def validate_production_service(service: dict, service_id: str) -> None:
    name = str(service.get("name") or "").strip()
    if not name or name == render.SERVICE_NAME or name.endswith("-staging"):
        raise SystemExit(f"Servicio Render de producción inesperado: {name or '<sin nombre>'}")

    auto_deploy = str(service.get("autoDeploy") or "").strip().lower()
    if auto_deploy != "no":
        raise SystemExit(f"Render production autoDeploy={auto_deploy or '<sin dato>'}; debe ser no antes de promocionar")

    db_name = (render.read_env(service_id, "MONGO_DB_NAME") or "").strip()
    if db_name == STAGING_DB:
        raise SystemExit("Producción apunta a la base de staging; aborto fail-closed")
    if db_name != PRODUCTION_DB:
        raise SystemExit(f"Producción debe usar MONGO_DB_NAME={PRODUCTION_DB}; actual={db_name or '<ausente>'}")


def promote(sha: str, *, poll_seconds: int = 5, max_attempts: int = 180) -> tuple[str, str]:
    production = render.find_production_service()
    service_id = str(production.get("id") or "").strip()
    if not service_id:
        raise SystemExit("No se pudo resolver de forma segura el backend Render de producción")

    service = unwrap_service(render.api("GET", f"/services/{service_id}"))
    validate_production_service(service, service_id)

    created = unwrap_deploy(
        render.api(
            "POST",
            f"/services/{service_id}/deploys",
            {"clearCache": "do_not_clear", "commitId": sha},
        )
    )
    deploy_id = str(created.get("id") or "").strip()
    if not deploy_id:
        raise SystemExit("Render no devolvió deploy id para producción")

    for attempt in range(1, max_attempts + 1):
        deploy = unwrap_deploy(render.api("GET", f"/services/{service_id}/deploys/{deploy_id}"))
        status = str(deploy.get("status") or "unknown").strip().lower()
        actual_sha = deploy_commit(deploy)
        print(f"Render production: {status} · {actual_sha or 'commit-pendiente'} (intento {attempt}/{max_attempts})")

        if status == "live":
            if actual_sha and actual_sha != sha:
                raise SystemExit(f"Render marcó live {actual_sha}, esperaba {sha}")
            return service_id, deploy_id
        if status in TERMINAL_FAILURES:
            raise SystemExit(f"Deploy de producción terminó en {status}")
        time.sleep(poll_seconds)

    raise SystemExit(f"Render production no llegó a live tras {max_attempts * poll_seconds} segundos")


def self_test() -> None:
    assert validate_sha("a" * 40) == "a" * 40
    assert deploy_commit({"commit": {"id": "B" * 40}}) == "b" * 40
    assert deploy_commit({"commitId": "C" * 40}) == "c" * 40
    assert unwrap_deploy({"deploy": {"id": "dep-1"}})["id"] == "dep-1"
    print("render-production-deploy self-test OK · SHA y payloads normalizados")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha", default=os.environ.get("DEPLOY_SHA", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return

    sha = validate_sha(args.sha)
    service_id, deploy_id = promote(sha)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"deploy_id={deploy_id}\n")
    print(f"Render production promocionado: {sha} · deploy={deploy_id}")


if __name__ == "__main__":
    main()
