#!/usr/bin/env python3
"""Pruebas stdlib del reconciliador de staging; no toca red ni Render."""

from __future__ import annotations

import importlib.util
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
        ("srv-stage", "CHESS_AI_SHARED_SECRET"): "ai-stable",
    }
    with patch.object(module, "read_env", side_effect=lambda service, key: values.get((service, key))):
        result = module.env_values({"id": "srv-prod"}, {"id": "srv-stage"})
    check(result["MONGO_URL"] == "mongodb://atlas?appName=chess-studio-staging", "staging debe reutilizar Atlas con identidad propia")
    check(result["MONGO_DB_NAME"] == "chess_study_staging", "staging debe aislar el nombre de base")
    check(result["JWT_SECRET"] == "jwt-stable", "una reconciliación no debe rotar JWT")
    check(result["CHESS_AI_SHARED_SECRET"] == "ai-stable", "una reconciliación no debe rotar AI secret")

    rewritten = module.with_app_name(
        "mongodb+srv://user:pass@cluster.mongodb.net/?retryWrites=true&appName=chess-studio&w=majority",
        "chess-studio-staging",
    )
    check("appName=chess-studio-staging" in rewritten, "appName staging debe ser visible en Atlas")
    check("appName=chess-studio&" not in rewritten, "no debe sobrevivir la etiqueta de producción")
    check("retryWrites=true" in rewritten and "w=majority" in rewritten, "no debe perder opciones de conexión")


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


def test_main_reconciles_without_duplicate_creation() -> None:
    production = {"id": "srv-prod", "name": module.PRODUCTION_NAME}
    staging = {"id": "srv-stage", "name": module.SERVICE_NAME}
    calls = []

    def find(name):
        return production if name == module.PRODUCTION_NAME else staging

    with (
        patch.object(module, "find_production_service", return_value=production),
        patch.object(module, "find_service", side_effect=find),
        patch.object(module, "env_values", return_value={"MONGO_DB_NAME": "chess_study_staging"}),
        patch.object(module, "api", side_effect=lambda method, path, payload=None: calls.append((method, path, payload)) or {}),
        patch.object(module, "create_service") as create,
        patch.object(module, "reconcile_environment") as reconcile,
        patch.object(module, "ensure_custom_domain") as domain,
    ):
        module.main()
    create.assert_not_called()
    reconcile.assert_called_once_with("srv-stage", {"MONGO_DB_NAME": "chess_study_staging"})
    domain.assert_called_once_with("srv-stage")
    check(("PUT", "/services/srv-prod/env-vars/ENVIRONMENT", {"value": "production"}) in calls, "producción debe declarar su entorno")
    check(("PUT", "/services/srv-prod/env-vars/MONGO_DB_NAME", {"value": "chess_study"}) in calls, "producción debe quedar explícita")


if __name__ == "__main__":
    test_unwrap_service_shapes()
    test_environment_isolated_and_secrets_stable()
    test_production_discovery_uses_repo_and_mongo_evidence()
    test_main_reconciles_without_duplicate_creation()
    print("render-staging-bootstrap-smoke OK · idempotencia + Mongo aislado + secretos estables")
