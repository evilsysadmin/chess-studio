#!/usr/bin/env python3
"""Promote one explicit Git commit to the Render production backend.

This helper deliberately does not accept a branch name. Production auto-deploy
must already be disabled and the service must prove the production environment
contract before any deploy is created.
"""
from __future__ import annotations

import argparse
import os
import re
import time

from render_staging_bootstrap import api, find_production_service, read_env

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
TERMINAL_FAILURES = {
    "build_failed",
    "update_failed",
    "pre_deploy_failed",
    "canceled",
    "deactivated",
}


def validate_commit(value: str) -> str:
    commit = str(value or "").strip().lower()
    if not SHA_RE.fullmatch(commit):
        raise SystemExit("El commit de producción debe ser un SHA Git completo de 40 hex")
    return commit


def unwrap(payload: object, key: str) -> dict:
    if not isinstance(payload, dict):
        return {}
    nested = payload.get(key)
    return nested if isinstance(nested, dict) else payload


def validate_production_service() -> dict:
    service = find_production_service()
    service_id = str(service.get("id") or "").strip()
    if not service_id:
        raise SystemExit("No se pudo resolver de forma segura el backend de producción")

    environment = (read_env(service_id, "ENVIRONMENT") or "").strip().lower()
    database = (read_env(service_id, "MONGO_DB_NAME") or "").strip()
    auto_deploy = str(service.get("autoDeploy") or "").strip().lower()
    if environment not in {"production", "prod"}:
        raise SystemExit(f"Render production declara ENVIRONMENT={environment or '<vacío>'}; aborto fail-closed")
    if database != "chess_study":
        raise SystemExit(f"Render production declara MONGO_DB_NAME={database or '<vacío>'}; aborto fail-closed")
    if auto_deploy != "no":
        raise SystemExit(f"Render production autoDeploy={auto_deploy or '<sin dato>'}; debe estar en no antes de promocionar")
    return service


def deploy_commit(commit: str, *, poll_seconds: float = 5.0, max_attempts: int = 180) -> tuple[str, str]:
    service = validate_production_service()
    service_id = str(service["id"])
    created = unwrap(
        api(
            "POST",
            f"/services/{service_id}/deploys",
            {"clearCache": "do_not_clear", "commitId": commit},
        ),
        "deploy",
    )
    deploy_id = str(created.get("id") or "").strip()
    if not deploy_id:
        raise SystemExit("Render no devolvió deploy id para producción")

    for attempt in range(1, max_attempts + 1):
        deploy = unwrap(api("GET", f"/services/{service_id}/deploys/{deploy_id}"), "deploy")
        status = str(deploy.get("status") or "unknown").strip().lower()
        commit_meta = deploy.get("commit") if isinstance(deploy.get("commit"), dict) else {}
        deployed_commit = str(commit_meta.get("id") or deploy.get("commitId") or "").strip().lower()
        print(f"Render production: {status} · intento {attempt}/{max_attempts}")
        if status == "live":
            if deployed_commit and deployed_commit != commit:
                raise SystemExit(f"Render marcó live el commit {deployed_commit}; esperaba {commit}")
            return service_id, deploy_id
        if status in TERMINAL_FAILURES:
            raise SystemExit(f"Deploy de producción terminó en {status}")
        time.sleep(poll_seconds)

    raise SystemExit("Render production no llegó a live dentro de la ventana de promoción")


def self_test() -> None:
    assert validate_commit("0" * 40) == "0" * 40
    for bad in ("", "main", "a" * 39, "g" * 40, "A" * 39):
        try:
            validate_commit(bad)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"Se aceptó commit inválido: {bad!r}")
    assert unwrap({"deploy": {"id": "dep-1"}}, "deploy") == {"id": "dep-1"}
    assert unwrap({"id": "dep-2"}, "deploy") == {"id": "dep-2"}
    print("render-production-deploy self-test OK · SHA explícito + contrato fail-closed")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--commit")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    commit = validate_commit(args.commit or os.environ.get("DEPLOY_SHA", ""))
    service_id, deploy_id = deploy_commit(commit)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"deploy_id={deploy_id}\n")
    print(f"Render production acreditado: deploy {deploy_id} · commit {commit}")


if __name__ == "__main__":
    main()
