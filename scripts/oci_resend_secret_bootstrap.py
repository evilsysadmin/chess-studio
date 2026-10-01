#!/usr/bin/env python3
"""Seed Chess Studio Resend API keys into OCI Vault without exposing plaintext.

GitHub Actions is only the bootstrap transport. Runtime reads the resulting
environment-specific Vault secrets through the A1 instance principal.
"""
from __future__ import annotations

import argparse
import base64
import os
from typing import Any

SECRET_ROWS = (
    ("staging", "chess-studio-staging-resend-api-key"),
    ("production", "chess-studio-production-resend-api-key"),
)
VERSION_NAME = "github-resend-bootstrap-v1"


def read_resend_key() -> str:
    value = os.environ.get("RESEND_API_KEY", "").strip()
    if not value:
        raise SystemExit("RESEND_API_KEY is missing")
    if not value.startswith("re_"):
        raise SystemExit("RESEND_API_KEY has unexpected shape")
    if any(ch in value for ch in ("\x00", "\r", "\n")):
        raise SystemExit("RESEND_API_KEY contains forbidden control characters")
    return value


def create_secret_details(
    oci: Any,
    *,
    compartment_id: str,
    key_id: str,
    vault_id: str,
    secret_name: str,
    environment: str,
    value: str,
) -> Any:
    encoded = base64.b64encode(value.encode("utf-8")).decode("ascii")
    return oci.vault.models.CreateSecretDetails(
        compartment_id=compartment_id,
        key_id=key_id,
        secret_name=secret_name,
        vault_id=vault_id,
        description=f"Chess Studio {environment} Resend API key.",
        freeform_tags={
            "application": "chess-studio",
            "environment": environment,
            "managed-by": "github-bootstrap",
        },
        secret_content=oci.vault.models.Base64SecretContentDetails(
            content_type="BASE64",
            name=VERSION_NAME,
            stage="CURRENT",
            content=encoded,
        ),
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

    created = 0
    retained = 0
    for environment, secret_name in SECRET_ROWS:
        if secret_name in existing:
            print(f"OCI_RESEND_BOOTSTRAP_EXISTS environment={environment} name={secret_name}")
            retained += 1
            continue
        composite.create_secret_and_wait_for_state(
            create_secret_details(
                oci,
                compartment_id=compartment_id,
                key_id=key_id,
                vault_id=vault_id,
                secret_name=secret_name,
                environment=environment,
                value=value,
            ),
            wait_for_states=["ACTIVE"],
            waiter_kwargs={"max_interval_seconds": 5, "max_wait_seconds": 300},
        )
        print(f"OCI_RESEND_BOOTSTRAP_CREATED environment={environment} name={secret_name}")
        created += 1

    final = existing_secret_names(oci, client, compartment_id, vault_id)
    missing = [name for _env, name in SECRET_ROWS if name not in final]
    if missing:
        raise SystemExit("Resend Vault bootstrap incomplete: " + ", ".join(missing))
    print(f"OCI_RESEND_BOOTSTRAP_OK created={created} existing={retained} total={len(SECRET_ROWS)}")


def self_test() -> None:
    assert SECRET_ROWS == (
        ("staging", "chess-studio-staging-resend-api-key"),
        ("production", "chess-studio-production-resend-api-key"),
    )
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
