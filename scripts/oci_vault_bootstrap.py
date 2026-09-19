#!/usr/bin/env python3
"""One-time, idempotent migration of OCI staging runtime values into Vault.

Render staging is still the temporary source during migration. This helper reads
the existing allow-listed runtime values, creates only missing OCI Vault
secrets, and never updates an existing secret. Plaintext is never printed and
never enters Terraform state or OCI Run Command payloads.

The staging service historically did not carry the Grafana OTLP transport pair.
Bootstrap may therefore inherit OTEL_EXPORTER_OTLP_ENDPOINT and
OTEL_EXPORTER_OTLP_HEADERS from production exactly once so staging can join the
same Grafana Cloud gateway. No application/runtime secret outside that telemetry
pair is ever allowed to fall back to production. Missing optional telemetry
values are omitted rather than blocking application runtime bootstrap.
"""
from __future__ import annotations

import argparse
import base64
from typing import Any

KEY_NAME = "chess-studio-staging-secrets"
INITIAL_VERSION_NAME = "initial-render-migration"
PRODUCTION_FALLBACK_KEYS = ("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS")


def required_vault_values(
    values: dict[str, str],
    secret_rows: tuple[tuple[str, str], ...],
    optional_keys: tuple[str, ...] = (),
) -> dict[str, str]:
    selected: dict[str, str] = {}
    optional = set(optional_keys)
    for key, secret_name in secret_rows:
        value = str(values.get(key) or "")
        if not value:
            if key in optional:
                continue
            raise SystemExit(f"Render staging runtime is missing required Vault bootstrap key: {key}")
        if any(ch in value for ch in ("\x00", "\r", "\n")):
            raise SystemExit(f"Render staging runtime contains invalid control characters for: {key}")
        selected[secret_name] = value
    return selected


def apply_production_fallbacks(staging: dict[str, str], production: dict[str, str]) -> dict[str, str]:
    merged = dict(staging)
    for key in PRODUCTION_FALLBACK_KEYS:
        if not str(merged.get(key) or ""):
            value = str(production.get(key) or "")
            if value:
                merged[key] = value
    return merged


def collect_bootstrap_source() -> dict[str, str]:
    from oci_runtime_config import collect_render_values, list_render_env_values, resolve_render_staging
    from render_staging_bootstrap import find_production_service

    staging = collect_render_values(resolve_render_staging())
    if all(str(staging.get(key) or "") for key in PRODUCTION_FALLBACK_KEYS):
        return staging
    production_service = find_production_service()
    production_id = str(production_service.get("id") or "").strip()
    if not production_id:
        raise SystemExit("Render production resolver returned no service id")
    production = list_render_env_values(production_id)
    merged = apply_production_fallbacks(staging, production)
    inherited = [
        key
        for key in PRODUCTION_FALLBACK_KEYS
        if not str(staging.get(key) or "") and str(merged.get(key) or "")
    ]
    if inherited:
        print("OCI_VAULT_BOOTSTRAP_INHERITED_PRODUCTION keys=" + ",".join(inherited))
    return merged


def resolve_key_id(
    oci: Any,
    config: dict[str, str],
    compartment_id: str,
    vault_id: str,
) -> str:
    vault_client = oci.key_management.KmsVaultClient(config)
    vault = vault_client.get_vault(
        vault_id,
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    endpoint = str(getattr(vault, "management_endpoint", "") or "").strip()
    if not endpoint:
        raise SystemExit("staging Vault does not expose a management endpoint")
    key_client = oci.key_management.KmsManagementClient(config, endpoint)
    rows = oci.pagination.list_call_get_all_results(
        key_client.list_keys,
        compartment_id,
    ).data
    matches = [
        row
        for row in rows
        if str(getattr(row, "display_name", "") or "") == KEY_NAME
        and str(getattr(row, "lifecycle_state", "") or "").upper() == "ENABLED"
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one ENABLED key named {KEY_NAME}; found {len(matches)}")
    return str(matches[0].id)


def existing_secret_names(
    oci: Any,
    client: Any,
    compartment_id: str,
    vault_id: str,
) -> set[str]:
    rows = oci.pagination.list_call_get_all_results(
        client.list_secrets,
        compartment_id,
        vault_id=vault_id,
    ).data
    ignored_states = {"DELETED", "PENDING_DELETION"}
    return {
        str(getattr(row, "secret_name", None) or getattr(row, "name", None) or "")
        for row in rows
        if str(getattr(row, "lifecycle_state", "") or "").upper() not in ignored_states
        and str(getattr(row, "secret_name", None) or getattr(row, "name", None) or "")
    }


def create_secret_details(
    oci: Any,
    *,
    compartment_id: str,
    key_id: str,
    vault_id: str,
    secret_name: str,
    value: str,
) -> Any:
    encoded = base64.b64encode(value.encode("utf-8")).decode("ascii")
    return oci.vault.models.CreateSecretDetails(
        compartment_id=compartment_id,
        key_id=key_id,
        secret_name=secret_name,
        vault_id=vault_id,
        description="Chess Studio OCI staging runtime value migrated from Render staging.",
        freeform_tags={
            "application": "chess-studio",
            "environment": "staging",
            "managed-by": "operator-vault-lifecycle",
        },
        secret_content=oci.vault.models.Base64SecretContentDetails(
            content_type="BASE64",
            name=INITIAL_VERSION_NAME,
            stage="CURRENT",
            content=encoded,
        ),
    )


def bootstrap(oci: Any) -> None:
    from oci_run_command import config_from_env, resolve_staging
    from oci_runtime_config import OPTIONAL_KEYS
    from oci_vault_runtime import SECRET_NAMES, resolve_vault_id

    config = config_from_env(oci)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    key_id = resolve_key_id(oci, config, compartment_id, vault_id)
    source = collect_bootstrap_source()
    desired = required_vault_values(source, SECRET_NAMES, OPTIONAL_KEYS)

    client = oci.vault.VaultsClient(config)
    existing = existing_secret_names(oci, client, compartment_id, vault_id)
    composite = oci.vault.VaultsClientCompositeOperations(client)
    created = 0
    retained = 0
    for key, secret_name in SECRET_NAMES:
        if secret_name in existing:
            print(f"OCI_VAULT_BOOTSTRAP_EXISTS name={secret_name}")
            retained += 1
            continue
        if secret_name not in desired:
            print(f"OCI_VAULT_BOOTSTRAP_OPTIONAL_MISSING key={key} name={secret_name}")
            continue
        composite.create_secret_and_wait_for_state(
            create_secret_details(
                oci,
                compartment_id=compartment_id,
                key_id=key_id,
                vault_id=vault_id,
                secret_name=secret_name,
                value=desired[secret_name],
            ),
            wait_for_states=["ACTIVE"],
            waiter_kwargs={"max_interval_seconds": 5, "max_wait_seconds": 300},
        )
        print(f"OCI_VAULT_BOOTSTRAP_CREATED name={secret_name}")
        created += 1

    final_names = existing_secret_names(oci, client, compartment_id, vault_id)
    missing = [name for name in desired if name not in final_names]
    if missing:
        raise SystemExit("OCI Vault bootstrap incomplete; missing names: " + ", ".join(missing))
    print(
        f"OCI_VAULT_BOOTSTRAP_OK vault=chess-studio-staging "
        f"created={created} existing={retained} total={len(SECRET_NAMES)}"
    )


def self_test() -> None:
    rows = (
        ("A", "secret-a"),
        ("B", "secret-b"),
    )
    selected = required_vault_values({"A": "alpha", "B": "bravo"}, rows)
    assert selected == {"secret-a": "alpha", "secret-b": "bravo"}
    optional = required_vault_values({"A": "alpha", "B": ""}, rows, ("B",))
    assert optional == {"secret-a": "alpha"}
    try:
        required_vault_values({"A": "alpha", "B": ""}, rows)
    except SystemExit as exc:
        assert "B" in str(exc)
    else:
        raise AssertionError("empty bootstrap values must fail closed")
    try:
        required_vault_values({"A": "alpha\nleak", "B": "bravo"}, rows)
    except SystemExit as exc:
        assert "A" in str(exc)
    else:
        raise AssertionError("multiline bootstrap values must fail closed")

    staging = {"MONGO_URL": "staging-mongo", "JWT_SECRET": "staging-jwt"}
    production = {
        "MONGO_URL": "production-mongo",
        "JWT_SECRET": "production-jwt",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otlp.example.test/otlp",
        "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic sample",
    }
    merged = apply_production_fallbacks(staging, production)
    assert merged["MONGO_URL"] == "staging-mongo"
    assert merged["JWT_SECRET"] == "staging-jwt"
    assert merged["OTEL_EXPORTER_OTLP_ENDPOINT"] == "https://otlp.example.test/otlp"
    assert merged["OTEL_EXPORTER_OTLP_HEADERS"] == "Authorization=Basic sample"
    assert PRODUCTION_FALLBACK_KEYS == (
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "OTEL_EXPORTER_OTLP_HEADERS",
    )
    source = open(__file__, encoding="utf-8").read().split("def self_test", 1)[0]
    assert "find_production_service" in source
    assert "PRODUCTION_RENDER_SERVICE_NAME" not in source

    already_set = apply_production_fallbacks(
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "https://staging.example.test/otlp"},
        {"OTEL_EXPORTER_OTLP_ENDPOINT": "https://production.example.test/otlp"},
    )
    assert already_set["OTEL_EXPORTER_OTLP_ENDPOINT"] == "https://staging.example.test/otlp"

    sample = "hello-secret"
    encoded = base64.b64encode(sample.encode("utf-8")).decode("ascii")
    assert base64.b64decode(encoded).decode("utf-8") == sample
    print("OCI Vault bootstrap self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("bootstrap",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "bootstrap":
        parser.error("bootstrap operation is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    bootstrap(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
