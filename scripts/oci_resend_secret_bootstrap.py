#!/usr/bin/env python3
"""Seed Resend recovery into OCI Vault without exposing plaintext.

GitHub Actions is only the bootstrap transport. Staging stores Resend as an
environment-scoped secret. Production folds the key into its existing encrypted
runtime bundle so the A1 keeps a single compact Instance Principal read path.
"""
from __future__ import annotations

import argparse
import base64
import os
import uuid
from typing import Any

STAGING_SECRET_NAME = "chess-studio-staging-resend-api-key"
PRODUCTION_RUNTIME_SECRET_NAME = "chess-studio-production-runtime-env"
VERSION_NAME = "github-resend-bootstrap-v1"
PRODUCTION_RESET_URL = "https://chess-studio.shadowops.dpdns.org/"
DEFAULT_FROM = "Chess Studio <onboarding@resend.dev>"


def read_resend_key() -> str:
    value = os.environ.get("RESEND_API_KEY", "").strip()
    if not value:
        raise SystemExit("RESEND_API_KEY is missing")
    if not value.startswith("re_"):
        raise SystemExit("RESEND_API_KEY has unexpected shape")
    if any(ch in value for ch in ("\x00", "\r", "\n")):
        raise SystemExit("RESEND_API_KEY contains forbidden control characters")
    return value


def create_staging_secret_details(
    oci: Any,
    *,
    compartment_id: str,
    key_id: str,
    vault_id: str,
    value: str,
) -> Any:
    encoded = base64.b64encode(value.encode("utf-8")).decode("ascii")
    return oci.vault.models.CreateSecretDetails(
        compartment_id=compartment_id,
        key_id=key_id,
        secret_name=STAGING_SECRET_NAME,
        vault_id=vault_id,
        description="Chess Studio staging Resend API key.",
        freeform_tags={
            "application": "chess-studio",
            "environment": "staging",
            "managed-by": "github-bootstrap",
        },
        secret_content=oci.vault.models.Base64SecretContentDetails(
            content_type="BASE64",
            name=VERSION_NAME,
            stage="CURRENT",
            content=encoded,
        ),
    )


def production_recovery_values(values: dict[str, str], resend_key: str) -> dict[str, str]:
    merged = dict(values)
    merged["RESEND_API_KEY"] = resend_key
    merged["ENABLE_EMAIL_RECOVERY"] = "true"
    merged["PASSWORD_RESET_URL"] = PRODUCTION_RESET_URL
    if not str(merged.get("PASSWORD_RESET_FROM") or "").strip():
        merged["PASSWORD_RESET_FROM"] = DEFAULT_FROM
    return merged


def resolve_secret_id(
    oci: Any,
    client: Any,
    *,
    compartment_id: str,
    vault_id: str,
    secret_name: str,
) -> str:
    rows = oci.pagination.list_call_get_all_results(
        client.list_secrets,
        compartment_id,
        vault_id=vault_id,
    ).data
    matches = [
        row
        for row in rows
        if str(getattr(row, "secret_name", None) or getattr(row, "name", None) or "") == secret_name
        and str(getattr(row, "lifecycle_state", "") or "").upper() == "ACTIVE"
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one ACTIVE Vault secret named {secret_name}; found {len(matches)}")
    secret_id = str(getattr(matches[0], "id", "") or "").strip()
    if not secret_id:
        raise SystemExit(f"Vault secret {secret_name} has no OCID")
    return secret_id


def update_production_bundle(
    oci: Any,
    *,
    client: Any,
    compartment_id: str,
    vault_id: str,
    resend_key: str,
) -> None:
    from oci_production_runtime import read_current_production_values, render_production_env

    current = read_current_production_values(oci)
    merged = production_recovery_values(current, resend_key)
    if merged == current:
        print(
            "OCI_RESEND_PRODUCTION_BUNDLE_EXISTS "
            f"name={PRODUCTION_RUNTIME_SECRET_NAME} recovery=current"
        )
        return
    payload = render_production_env(merged)
    secret_id = resolve_secret_id(
        oci,
        client,
        compartment_id=compartment_id,
        vault_id=vault_id,
        secret_name=PRODUCTION_RUNTIME_SECRET_NAME,
    )
    encoded = base64.b64encode(payload).decode("ascii")
    details = oci.vault.models.UpdateSecretDetails(
        secret_content=oci.vault.models.Base64SecretContentDetails(
            content_type="BASE64",
            name=f"{VERSION_NAME}-{uuid.uuid4().hex[:16]}",
            stage="CURRENT",
            content=encoded,
        )
    )
    composite = oci.vault.VaultsClientCompositeOperations(client)
    composite.update_secret_and_wait_for_state(
        secret_id,
        details,
        wait_for_states=["ACTIVE"],
        waiter_kwargs={"max_interval_seconds": 5, "max_wait_seconds": 300},
    )
    print(
        "OCI_RESEND_PRODUCTION_BUNDLE_UPDATED "
        f"name={PRODUCTION_RUNTIME_SECRET_NAME} bytes={len(payload)}"
    )


def bootstrap(oci: Any) -> None:
    from oci_run_command import config_from_env, resolve_staging
    from oci_vault_bootstrap import existing_secret_names, resolve_key_id
    from oci_vault_runtime import resolve_vault_id

    value = read_resend_key()
    config = config_from_env(oci)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    key_id = resolve_key_id(oci, config, compartment_id, vault_id)

    client = oci.vault.VaultsClient(config)
    composite = oci.vault.VaultsClientCompositeOperations(client)
    existing = existing_secret_names(oci, client, compartment_id, vault_id)

    if STAGING_SECRET_NAME in existing:
        print(f"OCI_RESEND_BOOTSTRAP_EXISTS environment=staging name={STAGING_SECRET_NAME}")
    else:
        composite.create_secret_and_wait_for_state(
            create_staging_secret_details(
                oci,
                compartment_id=compartment_id,
                key_id=key_id,
                vault_id=vault_id,
                value=value,
            ),
            wait_for_states=["ACTIVE"],
            waiter_kwargs={"max_interval_seconds": 5, "max_wait_seconds": 300},
        )
        print(f"OCI_RESEND_BOOTSTRAP_CREATED environment=staging name={STAGING_SECRET_NAME}")

    update_production_bundle(
        oci,
        client=client,
        compartment_id=compartment_id,
        vault_id=vault_id,
        resend_key=value,
    )

    final = existing_secret_names(oci, client, compartment_id, vault_id)
    if STAGING_SECRET_NAME not in final or PRODUCTION_RUNTIME_SECRET_NAME not in final:
        raise SystemExit("Resend Vault bootstrap incomplete")
    print("OCI_RESEND_BOOTSTRAP_OK staging=separate production=bundled")


def self_test() -> None:
    assert STAGING_SECRET_NAME == "chess-studio-staging-resend-api-key"
    assert PRODUCTION_RUNTIME_SECRET_NAME == "chess-studio-production-runtime-env"

    base = {
        "MONGO_URL": "mongodb+srv://example.invalid/",
        "MONGO_DB_NAME": "chess_study",
        "JWT_SECRET": "jwt",
        "ENVIRONMENT": "production",
        "ENABLE_EMAIL_RECOVERY": "false",
    }
    merged = production_recovery_values(base, "re_test_123")
    assert merged["RESEND_API_KEY"] == "re_test_123"
    assert merged["ENABLE_EMAIL_RECOVERY"] == "true"
    assert merged["PASSWORD_RESET_URL"] == PRODUCTION_RESET_URL
    assert merged["PASSWORD_RESET_FROM"] == DEFAULT_FROM
    existing_sender = production_recovery_values(
        {**base, "PASSWORD_RESET_FROM": "Chess Studio <mail@example.test>"},
        "re_test_456",
    )
    assert existing_sender["PASSWORD_RESET_FROM"] == "Chess Studio <mail@example.test>"

    # Replaying the bootstrap with the same Resend key is a no-op. A real
    # rotation changes the desired bundle and therefore needs a new OCI version.
    already_configured = production_recovery_values(base, "re_test_123")
    assert production_recovery_values(already_configured, "re_test_123") == already_configured
    rotated = production_recovery_values(already_configured, "re_test_456")
    assert rotated != already_configured
    assert rotated["RESEND_API_KEY"] == "re_test_456"

    old = os.environ.get("RESEND_API_KEY")
    try:
        os.environ["RESEND_API_KEY"] = "re_test_123"
        assert read_resend_key() == "re_test_123"
        os.environ["RESEND_API_KEY"] = "not-a-resend-key"
        try:
            read_resend_key()
        except SystemExit:
            pass
        else:
            raise AssertionError("invalid Resend key shape must fail closed")
    finally:
        if old is None:
            os.environ.pop("RESEND_API_KEY", None)
        else:
            os.environ["RESEND_API_KEY"] = old
    print("OCI Resend secret bootstrap self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("bootstrap",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "bootstrap":
        parser.error("bootstrap is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    bootstrap(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
