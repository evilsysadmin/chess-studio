#!/usr/bin/env python3
"""Pruebas stdlib del reconciliador de staging; no toca red ni Render."""

from __future__ import annotations

import importlib.util
import tempfile
from pathlib import Path
from unittest.mock import patch


path = Path(__file__).with_name("render_staging_bootstrap.py")
spec = importlib.util.spec_from_file_location("render_staging_bootstrap", path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def check(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_unwrap_service_shapes() -> None:
    rows = module.unwrap_services([
        {"service": {"id": "srv-1", "name": "uno"}, "cursor": "x"},
        {"id": "srv-2", "name": "dos"},
    ])
    check([row["id"] for row in rows] == ["srv-1", "srv-2"], "list services debe admitir ambas formas API")


def test_environment_isolated_and_secrets_stable() -> None:
    values = {
        ("srv-prod", "MONGO_URL"): "mongodb://atlas",
        ("srv-stage", "JWT_SECRET"): "jwt-stable",
        ("srv-stage", "INVITE_CODE"): "invite-stable",
        ("srv-stage", "CHESS_AI_SHARED_SECRET"): "ai-stable",
    }
    with patch.object(module, "read_env", side_effect=lambda service, key: values.get((service, key))):
        result = module.env_values({"id": "srv-prod"}, {"id": "srv-stage"})
    check(result["MONGO_URL"] == "mongodb://atlas?appName=chess-studio-staging", "staging debe reutilizar Atlas con identidad propia")
    check(result["MONGO_DB_NAME"] == "chess_study_staging", "staging debe aislar el nombre de base")
    check(result["JWT_SECRET"] == "jwt-stable", "una reconciliación no debe rotar JWT")
    check(result["INVITE_CODE"] == "invite-stable", "una reconciliación no debe rotar el código privado de altas")
    check(result["ALLOW_REGISTRATION"] == "true", "CI debe poder seguir creando su identidad temporal")
    check(result["CHESS_AI_SHARED_SECRET"] == "ai-stable", "una reconciliación no debe rotar AI secret")

    rewritten = module.with_app_name(
        "mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&appName=chess-studio&w=majority",
        "chess-studio-staging",
    )
    check("appName=chess-studio-staging" in rewritten, "appName staging debe ser visible en Atlas")
    check("appName=chess-studio&" not in rewritten, "no debe sobrevivir la etiqueta de producción")
    check("retryWrites=true" in rewritten and "w=majority" in rewritten, "no debe perder opciones de conexión")


def test_invite_is_exported_only_to_ephemeral_github_env() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        env_file = Path(tmp) / "github-env"
        with patch.dict(module.os.environ, {"GITHUB_ENV": str(env_file)}):
            module.export_github_secret_env("STAGING_INVITE_CODE", "invite-test-secret")
        check(
            env_file.read_text(encoding="utf-8") == "STAGING_INVITE_CODE=invite-test-secret\n",
            "el smoke debe recibir el invite sólo por GITHUB_ENV",
        )


def test_production_discovery_uses_repo_and_mongo_evidence() -> None:
    services = [
        {"id": "srv-static", "name": "chess-studio-web", "repo": "https://github.com/acme/chess-studio"},
        {"id": "srv-prod", "name": "api-prod", "repo": "https://github.com/acme/chess-studio.git"},
        {"id": "srv-other", "name": "other-api", "repo": "https://github.com/acme/other"},
    ]
    with (
        patch.dict(module.os.environ, {"GITHUB_REPOSITORY": "acme/chess-studio"}),
        patch.object(module, "find_service", return_value=None),
        patch.object(module, "api", return_value=[{"service": row} for row in services]),
        patch.object(module, "read_env", side_effect=lambda service, key: "mongodb://atlas" if service == "srv-prod" and key == "MONGO_URL" else None),
    ):
        selected = module.find_production_service()
    check(selected["id"] == "srv-prod", "debe detectar el backend por repo y presencia de MONGO_URL")


def test_create_service_uses_noninteractive_boolean_syntax() -> None:
    captured = []

    def run(command, **_kwargs):
        captured.append(command)
        return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    with (
        patch.dict(module.os.environ, {"GITHUB_REPOSITORY": "acme/chess-studio"}),
        patch.object(module.subprocess, "run", side_effect=run),
    ):
        module.create_service(
            {"MONGO_DB_NAME": "chess_study_staging"},
            {"region": "frankfurt", "ownerId": "tea-owner"},
        )
    check(captured[0] == ["render", "workspace", "set", "tea-owner", "--output", "json"], "debe seleccionar el workspace de producción")
    command = captured[1]
    check("--auto-deploy=false" in command, "Cobra requiere el booleano en el mismo argumento")
    check("--auto-deploy" not in command, "no debe dejar false como argumento posicional")


def test_staging_environment_is_reused_and_service_grouped() -> None:
    production = {"id": "srv-prod", "ownerId": "tea-owner"}
    calls = []

    def fake_api(method, path, payload=None):
        calls.append((method, path, payload))
        if method == "GET" and path.startswith("/projects?"):
            return [{"project": {"id": "prj-1", "name": "Chess studio"}}]
        if method == "GET" and path.startswith("/environments?"):
            return [{"environment": {"id": "env-stage", "name": "Staging"}}]
        if method == "GET" and path.startswith("/services?"):
            return []
        if method == "POST" and path == "/environments/env-stage/resources":
            return {}
        raise AssertionError(f"API inesperada: {method} {path} {payload}")

    with patch.object(module, "api", side_effect=fake_api):
        environment = module.ensure_service_grouped(production, "srv-stage")

    check(environment["id"] == "env-stage", "debe reutilizar el environment Staging existente")
    check(
        ("POST", "/environments/env-stage/resources", {"resourceIds": ["srv-stage"]}) in calls,
        "debe mover el servicio al environment Staging",
    )
    check(not any(method == "POST" and path == "/environments" for method, path, _ in calls), "no debe duplicar Staging")


def test_staging_environment_is_created_when_missing() -> None:
    production = {"id": "srv-prod", "ownerId": "tea-owner"}

    def fake_api(method, path, payload=None):
        if method == "GET" and path.startswith("/projects?"):
            return [{"project": {"id": "prj-1", "name": "Chess studio"}}]
        if method == "GET" and path.startswith("/environments?"):
            return [{"environment": {"id": "env-prod", "name": "Production"}}]
        if method == "POST" and path == "/environments":
            check(payload["projectId"] == "prj-1", "Staging debe crearse dentro del proyecto correcto")
            check(payload["name"] == "Staging", "el environment debe llamarse Staging")
            return {"environment": {"id": "env-stage", "name": "Staging"}}
        raise AssertionError(f"API inesperada: {method} {path} {payload}")

    with patch.object(module, "api", side_effect=fake_api):
        environment = module.ensure_staging_environment(production)
    check(environment["id"] == "env-stage", "debe devolver el environment recién creado")


def test_suspended_staging_is_resumed_before_deploy() -> None:
    calls = []
    with (
        patch.object(module, "service_suspension_state", side_effect=["suspended", "not_suspended"]),
        patch.object(module, "api", side_effect=lambda method, path, payload=None: calls.append((method, path, payload)) or {}),
        patch.object(module.time, "sleep"),
    ):
        module.ensure_service_resumed("srv-stage")
    check(
        ("POST", "/services/srv-stage/resume", None) in calls,
        "staging suspendido debe reanudarse antes de desplegar",
    )


def test_active_staging_does_not_resume_again() -> None:
    with (
        patch.object(module, "service_suspension_state", return_value="not_suspended"),
        patch.object(module, "api") as render_api,
    ):
        module.ensure_service_resumed("srv-stage")
    render_api.assert_not_called()


def test_main_reconciles_without_duplicate_creation() -> None:
    production = {"id": "srv-prod", "name": module.PRODUCTION_NAME, "ownerId": "tea-owner"}
    staging = {"id": "srv-stage", "name": module.SERVICE_NAME}
    calls = []

    def find(name):
        return production if name == module.PRODUCTION_NAME else staging

    with (
        patch.object(module, "find_production_service", return_value=production),
        patch.object(module, "find_service", side_effect=find),
        patch.object(module, "env_values", return_value={"MONGO_DB_NAME": "chess_study_staging", "INVITE_CODE": "invite-stable"}),
        patch.object(module, "api", side_effect=lambda method, path, payload=None: calls.append((method, path, payload)) or {}),
        patch.object(module, "create_service") as create,
        patch.object(module, "reconcile_environment") as reconcile,
        patch.object(module, "ensure_custom_domain") as domain,
        patch.object(module, "ensure_service_grouped", return_value={"id": "env-stage"}) as group,
        patch.object(module, "ensure_service_resumed") as resume,
        patch.object(module, "export_github_secret_env") as export_secret,
    ):
        module.main()
    create.assert_not_called()
    reconcile.assert_called_once_with("srv-stage", {"MONGO_DB_NAME": "chess_study_staging", "INVITE_CODE": "invite-stable"})
    domain.assert_called_once_with("srv-stage")
    group.assert_called_once_with(production, "srv-stage")
    resume.assert_called_once_with("srv-stage")
    export_secret.assert_called_once_with("STAGING_INVITE_CODE", "invite-stable")
    check(("PUT", "/services/srv-prod/env-vars/ENVIRONMENT", {"value": "production"}) in calls, "producción debe declarar su entorno")
    check(("PUT", "/services/srv-prod/env-vars/MONGO_DB_NAME", {"value": "chess_study"}) in calls, "producción debe quedar explícita")


if __name__ == "__main__":
    test_unwrap_service_shapes()
    test_environment_isolated_and_secrets_stable()
    test_invite_is_exported_only_to_ephemeral_github_env()
    test_production_discovery_uses_repo_and_mongo_evidence()
    test_create_service_uses_noninteractive_boolean_syntax()
    test_staging_environment_is_reused_and_service_grouped()
    test_staging_environment_is_created_when_missing()
    test_suspended_staging_is_resumed_before_deploy()
    test_active_staging_does_not_resume_again()
    test_main_reconciles_without_duplicate_creation()
    print("render-staging-bootstrap-smoke OK · idempotencia + Mongo aislado + invite privado + agrupación + auto-resume Render")
