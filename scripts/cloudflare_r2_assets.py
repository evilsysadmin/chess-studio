#!/usr/bin/env python3
"""Reconcile Chess Studio's public R2 asset bucket without Terraform state.

This helper intentionally uses the Cloudflare REST API and only the existing
CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID pair. The repository's production
Cloudflare Terraform currently rebuilds local state on every Actions run, while
R2 custom domains do not support Terraform import. Keeping this tiny resource
set idempotent avoids a create-once/fail-forever trap.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_CONFIG = ROOT / "infra/cloudflare/r2-assets.json"
API_BASE = "https://api.cloudflare.com/client/v4"
BUCKET_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$")
LOCATIONS = {"apac", "eeur", "enam", "weur", "wnam", "oc"}
STORAGE_CLASSES = {"Standard", "InfrequentAccess"}
TLS_VERSIONS = {"1.0", "1.1", "1.2", "1.3"}
METHODS = {"GET", "PUT", "POST", "DELETE", "HEAD"}


class ConfigError(ValueError):
    pass


@dataclass
class CloudflareError(RuntimeError):
    status: int
    method: str
    path: str
    payload: Any

    def __str__(self) -> str:
        errors = self.payload.get("errors") if isinstance(self.payload, dict) else None
        detail = errors if errors else self.payload
        return f"Cloudflare API {self.method} {self.path}: HTTP {self.status}: {detail}"


def load_config(path: pathlib.Path) -> dict[str, Any]:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"No se pudo leer {path}: {exc}") from exc
    validate_config(raw)
    return raw


def validate_config(config: dict[str, Any]) -> None:
    if not isinstance(config, dict):
        raise ConfigError("La configuración R2 debe ser un objeto JSON")

    bucket = config.get("bucket")
    if not isinstance(bucket, str) or not BUCKET_RE.fullmatch(bucket):
        raise ConfigError("bucket debe tener 3-63 caracteres: minúsculas, números y guiones")

    if config.get("locationHint") not in LOCATIONS:
        raise ConfigError(f"locationHint inválido: {config.get('locationHint')!r}")
    if config.get("storageClass") not in STORAGE_CLASSES:
        raise ConfigError(f"storageClass inválido: {config.get('storageClass')!r}")
    if config.get("minTls") not in TLS_VERSIONS:
        raise ConfigError(f"minTls inválido: {config.get('minTls')!r}")

    zone = config.get("zoneName")
    domain = config.get("customDomain")
    if not isinstance(zone, str) or not zone or "." not in zone:
        raise ConfigError("zoneName inválido")
    if not isinstance(domain, str) or not domain.endswith("." + zone):
        raise ConfigError("customDomain debe ser un subdominio de zoneName")
    if config.get("disableR2Dev") is not True:
        raise ConfigError("disableR2Dev debe permanecer true para producción")

    cors = config.get("cors")
    if not isinstance(cors, dict):
        raise ConfigError("cors debe ser un objeto")
    origins = cors.get("origins")
    methods = cors.get("methods")
    exposed = cors.get("exposeHeaders")
    max_age = cors.get("maxAgeSeconds")
    if not isinstance(origins, list) or not origins or not all(isinstance(x, str) and x for x in origins):
        raise ConfigError("cors.origins debe ser una lista no vacía")
    if not isinstance(methods, list) or not methods or not set(methods) <= METHODS:
        raise ConfigError("cors.methods contiene métodos no soportados")
    if not isinstance(exposed, list) or not all(isinstance(x, str) and x for x in exposed):
        raise ConfigError("cors.exposeHeaders debe ser una lista de cabeceras")
    if not isinstance(max_age, int) or not 0 <= max_age <= 86400:
        raise ConfigError("cors.maxAgeSeconds debe estar entre 0 y 86400")


def api_request(
    token: str,
    method: str,
    path: str,
    *,
    query: dict[str, str] | None = None,
    body: dict[str, Any] | None = None,
) -> Any:
    url = API_BASE + path
    if query:
        url += "?" + urllib.parse.urlencode(query)
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            **({"Content-Type": "application/json"} if data is not None else {}),
            "User-Agent": "chess-studio-r2-assets/1",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as exc:
        try:
            payload = json.loads(exc.read().decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            payload = {"errors": [{"message": str(exc)}]}
        raise CloudflareError(exc.code, method, path, payload) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"Cloudflare API no accesible para {method} {path}: {exc}") from exc

    if isinstance(payload, dict) and payload.get("success") is False:
        raise CloudflareError(getattr(response, "status", 200), method, path, payload)
    return payload.get("result") if isinstance(payload, dict) and "result" in payload else payload


def require_env() -> tuple[str, str]:
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "").strip()
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID", "").strip()
    missing = [name for name, value in (("CLOUDFLARE_API_TOKEN", token), ("CLOUDFLARE_ACCOUNT_ID", account_id)) if not value]
    if missing:
        raise RuntimeError("Faltan variables requeridas: " + ", ".join(missing))
    return token, account_id


def resolve_zone_id(token: str, account_id: str, zone_name: str) -> str:
    result = api_request(
        token,
        "GET",
        "/zones",
        query={"name": zone_name, "account.id": account_id},
    )
    rows = result if isinstance(result, list) else []
    active = [row for row in rows if isinstance(row, dict) and row.get("name") == zone_name and row.get("status") == "active"]
    if len(active) != 1:
        raise RuntimeError(f"Se esperaba una única zona activa {zone_name!r}; recibidas: {rows!r}")
    return str(active[0]["id"])


def bucket_path(account_id: str, bucket: str) -> str:
    return f"/accounts/{account_id}/r2/buckets/{urllib.parse.quote(bucket, safe='')}"


def get_bucket(token: str, account_id: str, bucket: str) -> dict[str, Any] | None:
    path = bucket_path(account_id, bucket)
    try:
        result = api_request(token, "GET", path)
    except CloudflareError as exc:
        if exc.status == 404:
            return None
        raise
    return result if isinstance(result, dict) else {}


def ensure_bucket(token: str, account_id: str, config: dict[str, Any]) -> dict[str, Any]:
    bucket = config["bucket"]
    current = get_bucket(token, account_id, bucket)
    if current is None:
        print(f"CREATE bucket {bucket}")
        created = api_request(
            token,
            "POST",
            f"/accounts/{account_id}/r2/buckets",
            body={
                "name": bucket,
                "locationHint": config["locationHint"],
                "storageClass": config["storageClass"],
            },
        )
        return created if isinstance(created, dict) else {}

    actual_class = current.get("storage_class") or current.get("storageClass")
    if actual_class and actual_class != config["storageClass"]:
        print(f"UPDATE bucket storage class {actual_class} -> {config['storageClass']}")
        updated = api_request(
            token,
            "PATCH",
            bucket_path(account_id, bucket),
            body={"storageClass": config["storageClass"]},
        )
        return updated if isinstance(updated, dict) else current

    print(f"OK bucket {bucket}")
    return current


def desired_cors(config: dict[str, Any]) -> dict[str, Any]:
    cors = config["cors"]
    return {
        "rules": [
            {
                "id": "public-static-assets",
                "allowed": {
                    "origins": list(cors["origins"]),
                    "methods": list(cors["methods"]),
                    "headers": [],
                },
                "exposeHeaders": list(cors["exposeHeaders"]),
                "maxAgeSeconds": cors["maxAgeSeconds"],
            }
        ]
    }


def normalize_cors(payload: Any) -> list[dict[str, Any]]:
    rules = payload.get("rules", []) if isinstance(payload, dict) else []
    normalized: list[dict[str, Any]] = []
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        allowed = rule.get("allowed") if isinstance(rule.get("allowed"), dict) else {}
        normalized.append(
            {
                "origins": sorted(str(x) for x in allowed.get("origins", []) or []),
                "methods": sorted(str(x) for x in allowed.get("methods", []) or []),
                "headers": sorted(str(x) for x in allowed.get("headers", []) or []),
                "exposeHeaders": sorted(str(x) for x in rule.get("exposeHeaders", []) or []),
                "maxAgeSeconds": int(rule.get("maxAgeSeconds") or 0),
            }
        )
    return sorted(normalized, key=lambda row: json.dumps(row, sort_keys=True))


def ensure_cors(token: str, account_id: str, config: dict[str, Any]) -> None:
    path = bucket_path(account_id, config["bucket"]) + "/cors"
    wanted = desired_cors(config)
    try:
        current = api_request(token, "GET", path)
    except CloudflareError as exc:
        if exc.status == 404:
            current = {"rules": []}
        else:
            raise
    if normalize_cors(current) == normalize_cors(wanted):
        print("OK CORS")
        return
    print("UPDATE CORS")
    api_request(token, "PUT", path, body=wanted)


def ensure_r2_dev_disabled(token: str, account_id: str, config: dict[str, Any]) -> None:
    path = bucket_path(account_id, config["bucket"]) + "/domains/managed"
    current = api_request(token, "GET", path)
    if isinstance(current, dict) and current.get("enabled") is False:
        print("OK r2.dev disabled")
        return
    print("DISABLE r2.dev")
    api_request(token, "PUT", path, body={"enabled": False})


def custom_domains(token: str, account_id: str, bucket: str) -> list[dict[str, Any]]:
    result = api_request(token, "GET", bucket_path(account_id, bucket) + "/domains/custom")
    rows = result.get("domains", []) if isinstance(result, dict) else []
    return [row for row in rows if isinstance(row, dict)]


def ensure_custom_domain(token: str, account_id: str, zone_id: str, config: dict[str, Any]) -> dict[str, Any]:
    bucket = config["bucket"]
    domain = config["customDomain"]
    base = bucket_path(account_id, bucket) + "/domains/custom"
    rows = custom_domains(token, account_id, bucket)
    matching = [row for row in rows if row.get("domain") == domain]
    if len(matching) > 1:
        raise RuntimeError(f"Dominio R2 duplicado inesperadamente: {matching!r}")
    if not matching:
        print(f"ATTACH custom domain {domain}")
        result = api_request(
            token,
            "POST",
            base,
            body={
                "domain": domain,
                "enabled": True,
                "zoneId": zone_id,
                "minTLS": config["minTls"],
            },
        )
        return result if isinstance(result, dict) else {}

    current = matching[0]
    current_zone = current.get("zoneId")
    if current_zone and current_zone != zone_id:
        raise RuntimeError(f"{domain} está asociado a una zoneId inesperada: {current_zone}")
    current_tls = current.get("minTLS") or current.get("min_tls")
    if current.get("enabled") is not True or (current_tls and current_tls != config["minTls"]):
        print(f"UPDATE custom domain {domain}")
        api_request(
            token,
            "PUT",
            base + "/" + urllib.parse.quote(domain, safe=""),
            body={"enabled": True, "minTLS": config["minTls"]},
        )
    else:
        print(f"OK custom domain {domain}")
    return current


def check(token: str, account_id: str, config: dict[str, Any]) -> None:
    errors: list[str] = []
    current = get_bucket(token, account_id, config["bucket"])
    if current is None:
        errors.append(f"bucket ausente: {config['bucket']}")
    else:
        actual_class = current.get("storage_class") or current.get("storageClass")
        if actual_class and actual_class != config["storageClass"]:
            errors.append(f"storage class {actual_class!r}, esperado {config['storageClass']!r}")

    if current is not None:
        domains = custom_domains(token, account_id, config["bucket"])
        match = [row for row in domains if row.get("domain") == config["customDomain"]]
        if len(match) != 1:
            errors.append(f"custom domain esperado una vez, encontrado {len(match)}")
        else:
            domain = match[0]
            if domain.get("enabled") is not True:
                errors.append("custom domain no está enabled")
            status = domain.get("status") if isinstance(domain.get("status"), dict) else {}
            if status.get("ownership") in {"blocked", "error"}:
                errors.append(f"custom domain ownership={status.get('ownership')}")
            if status.get("ssl") == "error":
                errors.append("custom domain SSL=error")

        managed = api_request(token, "GET", bucket_path(account_id, config["bucket"]) + "/domains/managed")
        if isinstance(managed, dict) and managed.get("enabled") is not False:
            errors.append("r2.dev sigue habilitado")

        cors = api_request(token, "GET", bucket_path(account_id, config["bucket"]) + "/cors")
        if normalize_cors(cors) != normalize_cors(desired_cors(config)):
            errors.append("CORS no coincide con la configuración declarada")

    if errors:
        raise RuntimeError("R2 assets check falló: " + "; ".join(errors))
    print(f"R2 assets OK: https://{config['customDomain']} · bucket={config['bucket']}")


def reconcile(token: str, account_id: str, config: dict[str, Any]) -> None:
    zone_id = resolve_zone_id(token, account_id, config["zoneName"])
    ensure_bucket(token, account_id, config)
    ensure_custom_domain(token, account_id, zone_id, config)
    ensure_r2_dev_disabled(token, account_id, config)
    ensure_cors(token, account_id, config)
    print(f"Reconciled R2 assets: https://{config['customDomain']}")


def self_test() -> None:
    config = {
        "bucket": "chess-studio-assets",
        "locationHint": "weur",
        "storageClass": "Standard",
        "customDomain": "assets.chess-studio.shadowops.dpdns.org",
        "zoneName": "shadowops.dpdns.org",
        "minTls": "1.2",
        "disableR2Dev": True,
        "cors": {
            "origins": ["*"],
            "methods": ["GET", "HEAD"],
            "exposeHeaders": ["ETag", "Content-Length"],
            "maxAgeSeconds": 86400,
        },
    }
    validate_config(config)
    wanted = desired_cors(config)
    reordered = {
        "rules": [
            {
                "allowed": {"methods": ["HEAD", "GET"], "origins": ["*"], "headers": []},
                "exposeHeaders": ["Content-Length", "ETag"],
                "maxAgeSeconds": 86400,
            }
        ]
    }
    assert normalize_cors(wanted) == normalize_cors(reordered)
    bad = dict(config)
    bad["bucket"] = "NOPE"
    try:
        validate_config(bad)
    except ConfigError:
        pass
    else:
        raise AssertionError("bucket inválido aceptado")
    print("cloudflare_r2_assets self-test OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("check", "reconcile", "self-test", "validate"))
    parser.add_argument("--config", type=pathlib.Path, default=DEFAULT_CONFIG)
    args = parser.parse_args(argv)

    if args.command == "self-test":
        self_test()
        return 0

    config = load_config(args.config)
    if args.command == "validate":
        print(f"R2 assets config OK: {args.config}")
        return 0

    token, account_id = require_env()
    if args.command == "reconcile":
        reconcile(token, account_id, config)
    else:
        check(token, account_id, config)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ConfigError, CloudflareError, RuntimeError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
