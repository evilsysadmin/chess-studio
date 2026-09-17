#!/usr/bin/env python3
"""Pure contract for composing OCI staging runtime without Render.

This module is deliberately side-effect free: it validates the versioned
non-secret configuration and can compose it with an in-memory map of Vault
values. It does not call OCI, Render, Run Command, or install backend.env.
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DECLARATIVE_PATH = ROOT / "infra" / "oci" / "runtime" / "backend.staging.env"
KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

VAULT_KEYS = (
    "MONGO_URL",
    "JWT_SECRET",
    "INVITE_CODE",
    "CHESS_AI_SHARED_SECRET",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
)
DECLARATIVE_KEYS = (
    "MONGO_DB_NAME",
    "ENVIRONMENT",
    "EXPOSE_API_DOCS",
    "ALLOW_REGISTRATION",
    "ENABLE_EMAIL_RECOVERY",
    "ADMIN_USERNAMES",
    "CF_AI_WORKER_URL",
    "CORS_ORIGINS",
    "OTEL_SERVICE_NAME",
    "OTEL_TRACES_ENABLED",
    "OTEL_METRICS_ENABLED",
    "OTEL_LOGS_ENABLED",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
)


def validate_value(key: str, value: str) -> str:
    if not isinstance(value, str) or not value:
        raise ValueError(f"runtime value {key} must be non-empty")
    if any(ch in value for ch in ("\x00", "\r", "\n")):
        raise ValueError(f"runtime value {key} contains forbidden control characters")
    return value


def parse_env(text: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError("declarative runtime line must be KEY=VALUE")
        key, value = line.split("=", 1)
        if not KEY_RE.fullmatch(key):
            raise ValueError(f"invalid runtime key: {key}")
        if key in values:
            raise ValueError(f"duplicate runtime key: {key}")
        values[key] = validate_value(key, value)
    return values


def load_declarative(path: Path = DECLARATIVE_PATH) -> dict[str, str]:
    values = parse_env(path.read_text(encoding="utf-8"))
    expected = set(DECLARATIVE_KEYS)
    actual = set(values)
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        raise ValueError(f"declarative runtime partition mismatch: missing={missing} extra={extra}")
    return values


def compose_runtime(
    declarative: dict[str, str],
    vault_values: dict[str, str],
) -> dict[str, str]:
    if set(declarative) != set(DECLARATIVE_KEYS):
        raise ValueError("declarative runtime keys do not match contract")
    if set(vault_values) != set(VAULT_KEYS):
        raise ValueError("Vault runtime keys do not match contract")

    merged: dict[str, str] = {}
    for key in (*VAULT_KEYS, *DECLARATIVE_KEYS):
        source = vault_values if key in VAULT_KEYS else declarative
        merged[key] = validate_value(key, source[key])
    return merged


def render_env(values: dict[str, str]) -> bytes:
    from oci_runtime_config import ALLOWED_KEYS

    if set(values) != set(ALLOWED_KEYS):
        raise ValueError("composed runtime does not match backend.env allowlist")
    return "".join(f"{key}={validate_value(key, values[key])}\n" for key in ALLOWED_KEYS).encode("utf-8")


def self_test() -> None:
    from oci_runtime_config import ALLOWED_KEYS
    from oci_vault_runtime import SECRET_KEYS

    assert tuple(SECRET_KEYS) == VAULT_KEYS
    assert set(ALLOWED_KEYS) == set(VAULT_KEYS) | set(DECLARATIVE_KEYS)
    assert not (set(VAULT_KEYS) & set(DECLARATIVE_KEYS))

    declarative = load_declarative()
    assert declarative == {
        "MONGO_DB_NAME": "chess_study_staging",
        "ENVIRONMENT": "staging",
        "EXPOSE_API_DOCS": "false",
        "ALLOW_REGISTRATION": "true",
        "ENABLE_EMAIL_RECOVERY": "false",
        "ADMIN_USERNAMES": "evilsysadmin",
        "CF_AI_WORKER_URL": "https://ai-staging.shadowops.dpdns.org",
        "CORS_ORIGINS": "https://staging.chess-studio.shadowops.dpdns.org",
        "OTEL_SERVICE_NAME": "chess-studio-backend-staging",
        "OTEL_TRACES_ENABLED": "true",
        "OTEL_METRICS_ENABLED": "true",
        "OTEL_LOGS_ENABLED": "true",
        "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    }
    assert not set(declarative) & set(VAULT_KEYS)

    sample_vault = {key: f"sample-{index}" for index, key in enumerate(VAULT_KEYS, start=1)}
    rendered = render_env(compose_runtime(declarative, sample_vault)).decode("utf-8")
    assert rendered.startswith("MONGO_URL=sample-1\nMONGO_DB_NAME=chess_study_staging\n")
    assert "JWT_SECRET=sample-2\n" in rendered
    assert "CORS_ORIGINS=https://staging.chess-studio.shadowops.dpdns.org\n" in rendered
    assert "RENDER_API_KEY" not in rendered

    try:
        compose_runtime(declarative, {**sample_vault, "SURPRISE": "nope"})
    except ValueError:
        pass
    else:
        raise AssertionError("unexpected Vault keys must fail closed")

    try:
        compose_runtime({"JWT_SECRET": "must-not-live-here"}, sample_vault)
    except ValueError:
        pass
    else:
        raise AssertionError("secret-bearing declarative config must fail partition validation")

    try:
        load_declarative(Path(__file__))
    except (UnicodeDecodeError, ValueError):
        pass
    else:
        raise AssertionError("non-manifest input must fail declarative validation")

    print("OCI declarative runtime manifest self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if not args.self_test:
        parser.error("--self-test is required; runtime materialization is not enabled yet")
    self_test()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
