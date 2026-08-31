#!/usr/bin/env python3
"""Crea o reconcilia el backend de staging en Render de forma idempotente.

Los secretos entran únicamente por el entorno del runner. Nunca se imprimen ni
se escriben en disco. La API pública de Render no crea Blueprints, por lo que
se usa el CLI oficial para crear el servicio y la API para reconciliar valores.
"""

from __future__ import annotations

import json
import os
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


API = "https://api.render.com/v1"
SERVICE_NAME = "chess-study-backend-staging"
PRODUCTION_NAME = "chess-study-backend"
CUSTOM_DOMAIN = "api-staging.chess-studio.shadowops.dpdns.org"


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Falta el secret/variable obligatorio {name}")
    return value


def api(method: str, path: str, payload: dict | None = None) -> object:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {required('RENDER_API_KEY')}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:500]
        raise SystemExit(f"Render API {method} {path}: HTTP {exc.code}: {detail}") from None


def unwrap_services(payload: object) -> list[dict]:
    rows = payload if isinstance(payload, list) else []
    services = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        service = row.get("service") if isinstance(row.get("service"), dict) else row
        if isinstance(service, dict):
            services.append(service)
    return services


def find_service(name: str) -> dict | None:
    query = urllib.parse.urlencode({"name": name, "limit": "20"})
    matches = [row for row in unwrap_services(api("GET", f"/services?{query}")) if row.get("name") == name]
    if len(matches) > 1:
        raise SystemExit(f"Render devolvió más de un servicio llamado {name}")
    return matches[0] if matches else None


def service_repo(service: dict) -> str:
    value = service.get("repo") or service.get("repoUrl") or ""
    normalized = str(value).strip().lower().removesuffix(".git").rstrip("/")
    return normalized


def find_production_service() -> dict:
    """Resuelve producción sin depender de un nombre histórico de Render."""
    configured_name = os.environ.get("RENDER_PRODUCTION_SERVICE_NAME", "").strip() or PRODUCTION_NAME
    exact = find_service(configured_name)
    if exact and exact.get("id"):
        return exact

    repository = required("GITHUB_REPOSITORY").lower()
    expected_repos = {repository, f"https://github.com/{repository}"}
    rows = unwrap_services(api("GET", "/services?limit=100"))
    candidates = [
        row for row in rows
        if row.get("id")
        and row.get("name") != SERVICE_NAME
        and not str(row.get("name") or "").endswith("-staging")
    ]
    repo_matches = [row for row in candidates if service_repo(row) in expected_repos]
    if repo_matches:
        candidates = repo_matches
    mongo_candidates = [row for row in candidates if read_env(str(row["id"]), "MONGO_URL")]
    if len(mongo_candidates) == 1:
        selected = mongo_candidates[0]
        print(f"Producción detectada por repositorio y MONGO_URL: {selected.get('name')}")
        return selected

    visible_names = ", ".join(sorted(str(row.get("name") or "<sin nombre>") for row in candidates)) or "ninguno"
    raise SystemExit(
        "No se pudo identificar un único backend de producción. "
        f"Define RENDER_PRODUCTION_SERVICE_NAME. Candidatos públicos: {visible_names}"
    )


def read_env(service_id: str, key: str) -> str | None:
    encoded = urllib.parse.quote(key, safe="")
    try:
        payload = api("GET", f"/services/{service_id}/env-vars/{encoded}")
    except SystemExit as exc:
        if "HTTP 404" in str(exc):
            return None
        raise
    if not isinstance(payload, dict):
        return None
    row = payload.get("envVar") if isinstance(payload.get("envVar"), dict) else payload
    value = row.get("value") if isinstance(row, dict) else None
    return str(value) if value else None


def stable_staging_secret(service: dict | None, key: str) -> str:
    if service and service.get("id"):
        current = read_env(str(service["id"]), key)
        if current:
            return current
    return secrets.token_urlsafe(48)


def with_app_name(mongo_url: str, app_name: str) -> str:
    """Cambia sólo la etiqueta de cliente Atlas, nunca host/credenciales/DB."""
    parts = urllib.parse.urlsplit(mongo_url)
    query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    updated = [(key, value) for key, value in query if key.lower() != "appname"]
    updated.append(("appName", app_name))
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc, parts.path, urllib.parse.urlencode(updated), parts.fragment))


def env_values(production: dict, staging: dict | None) -> dict[str, str]:
    production_id = str(production.get("id") or "")
    mongo_url = read_env(production_id, "MONGO_URL")
    if not mongo_url:
        raise SystemExit("Producción no tiene MONGO_URL; no se puede clonar la conexión Atlas")
    return {
        "MONGO_URL": with_app_name(mongo_url, "chess-studio-staging"),
        "MONGO_DB_NAME": "chess_study_staging",
        "JWT_SECRET": stable_staging_secret(staging, "JWT_SECRET"),
        "ENVIRONMENT": "staging",
        "EXPOSE_API_DOCS": "false",
        "ALLOW_REGISTRATION": "true",
        "ENABLE_EMAIL_RECOVERY": "false",
        "CF_AI_WORKER_URL": "https://ai-staging.shadowops.dpdns.org",
        "CHESS_AI_SHARED_SECRET": stable_staging_secret(staging, "CHESS_AI_SHARED_SECRET"),
        "CORS_ORIGINS": "https://staging.chess-studio.shadowops.dpdns.org",
        "OTEL_SERVICE_NAME": "chess-studio-backend-staging",
        "OTEL_TRACES_ENABLED": "true",
        "OTEL_METRICS_ENABLED": "true",
        "OTEL_LOGS_ENABLED": "true",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    }


def set_cli_workspace(production: dict) -> None:
    owner = production.get("owner") if isinstance(production.get("owner"), dict) else {}
    owner_id = str(production.get("ownerId") or owner.get("id") or "").strip()
    if not owner_id:
        raise SystemExit("El servicio de producción no expone ownerId; no se puede fijar el workspace de Render")
    result = subprocess.run(
        ["render", "workspace", "set", owner_id, "--output", "json"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        print(result.stderr.strip()[:1000], file=sys.stderr)
        raise SystemExit("Render CLI no pudo seleccionar el workspace de producción")


def create_service(values: dict[str, str], production: dict) -> None:
    set_cli_workspace(production)
    region = str((production or {}).get("region") or "frankfurt")
    repository = required("GITHUB_REPOSITORY")
    command = [
        "render", "services", "create",
        "--name", SERVICE_NAME,
        "--repo", f"https://github.com/{repository}",
        "--branch", "main",
        "--type", "web_service",
        "--runtime", "docker",
        "--root-directory", "backend-python",
        "--plan", "free",
        "--region", region,
        "--auto-deploy=false",
        "--health-check-path", "/api/ready",
        "--output", "json",
        "--confirm",
    ]
    for key, value in values.items():
        command.extend(("--env-var", f"{key}={value}"))
    result = subprocess.run(command, text=True, capture_output=True, check=False)
    if result.returncode:
        # El CLI recibe secretos como argumentos: no imprimimos el comando ni
        # stdout. Saneamos stderr por defensa adicional antes de mostrarlo.
        diagnostic = result.stderr.strip()
        for value in values.values():
            if value:
                diagnostic = diagnostic.replace(value, "[REDACTED]")
        print(diagnostic[:1400], file=sys.stderr)
        raise SystemExit("Render CLI no pudo crear el servicio de staging")


def reconcile_environment(service_id: str, values: dict[str, str]) -> None:
    for key, value in values.items():
        encoded = urllib.parse.quote(key, safe="")
        api("PUT", f"/services/{service_id}/env-vars/{encoded}", {"value": value})


def ensure_custom_domain(service_id: str) -> None:
    payload = api("GET", f"/services/{service_id}/custom-domains?limit=100")
    rows = payload if isinstance(payload, list) else []
    names = {
        str((row.get("customDomain") if isinstance(row, dict) and isinstance(row.get("customDomain"), dict) else row).get("name"))
        for row in rows if isinstance(row, dict)
    }
    if CUSTOM_DOMAIN not in names:
        api("POST", f"/services/{service_id}/custom-domains", {"name": CUSTOM_DOMAIN})


def wait_for_service() -> dict:
    for _ in range(24):
        service = find_service(SERVICE_NAME)
        if service:
            return service
        time.sleep(5)
    raise SystemExit("Render no devolvió el servicio recién creado")


def main() -> None:
    production = find_production_service()
    service = find_service(SERVICE_NAME)
    values = env_values(production, service)
    created = service is None
    if created:
        create_service(values, production)
        service = wait_for_service()
    service_id = str(service.get("id") or "")
    if not service_id:
        raise SystemExit("El servicio staging no tiene ID")
    # Migra producción fuera del default implícito antes de que el nuevo
    # guardarraíl del backend llegue a desplegarse.
    api("PUT", f"/services/{production['id']}/env-vars/ENVIRONMENT", {"value": "production"})
    api("PUT", f"/services/{production['id']}/env-vars/MONGO_DB_NAME", {"value": "chess_study"})
    reconcile_environment(service_id, values)
    ensure_custom_domain(service_id)
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with open(output, "a", encoding="utf-8") as handle:
            handle.write(f"service_id={service_id}\n")
            handle.write(f"created={'true' if created else 'false'}\n")
    print(f"Staging reconciliado: {SERVICE_NAME} ({service_id})")


if __name__ == "__main__":
    main()
