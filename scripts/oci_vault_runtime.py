#!/usr/bin/env python3
"""Validate OCI staging runtime secrets from Vault without exposing values.

The control plane resolves only the non-secret Vault OCID, then asks the A1 to
read CURRENT secret bundles with its Instance Principal. Secret plaintext never
enters GitHub Actions, Terraform, Run Command payloads or command output.
"""
from __future__ import annotations

import argparse
import re
import shlex
from typing import Any

VAULT_NAME = "chess-studio-staging"
VAULT_OCID_RE = re.compile(r"^ocid1\.vault\.[A-Za-z0-9._-]+$")
OCI_SDK_VERSION = "2.185.2"
SECRET_NAMES = (
    ("MONGO_URL", "chess-studio-staging-mongo-url"),
    ("JWT_SECRET", "chess-studio-staging-jwt-secret"),
    ("INVITE_CODE", "chess-studio-staging-invite-code"),
    ("CHESS_AI_SHARED_SECRET", "chess-studio-staging-ai-shared-secret"),
    ("OTEL_EXPORTER_OTLP_HEADERS", "chess-studio-staging-otel-headers"),
)


def validate_vault_id(value: str) -> str:
    normalized = value.strip()
    if not VAULT_OCID_RE.fullmatch(normalized):
        raise SystemExit("invalid OCI Vault OCID")
    return normalized


def resolve_vault_id(oci: Any, config: dict[str, str], compartment_id: str) -> str:
    client = oci.key_management.KmsVaultClient(config)
    rows = oci.pagination.list_call_get_all_results(
        client.list_vaults,
        compartment_id,
    ).data
    matches = [
        row
        for row in rows
        if str(getattr(row, "display_name", "") or "") == VAULT_NAME
        and str(getattr(row, "lifecycle_state", "") or "").upper() in {"ACTIVE", "CREATING"}
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one usable Vault named {VAULT_NAME}; found {len(matches)}")
    return validate_vault_id(str(matches[0].id))


def host_validate_command(vault_id: str) -> str:
    vault_id = validate_vault_id(vault_id)
    secret_rows = repr(SECRET_NAMES)
    command = f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} "$venv/bin/python" - <<'PY'
import base64
import os
import oci

secret_rows = {secret_rows}
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.secrets.SecretsClient(config={{}}, signer=signer)
missing = []
for key, name in secret_rows:
    try:
        response = client.get_secret_bundle_by_name(
            secret_name=name,
            vault_id=os.environ["VAULT_ID"],
            stage="CURRENT",
        )
    except oci.exceptions.ServiceError as exc:
        if exc.status == 404:
            missing.append(name)
            continue
        raise
    bundle_content = getattr(response.data, "secret_bundle_content", None)
    encoded = str(getattr(bundle_content, "content", "") or "")
    try:
        value = base64.b64decode(encoded, validate=True)
    except Exception:
        raise SystemExit(f"invalid CURRENT secret bundle: {{name}}") from None
    if not value or b"\\x00" in value or b"\\r" in value or b"\\n" in value:
        raise SystemExit(f"invalid CURRENT secret value shape: {{name}}")
    print(f"OCI_VAULT_SECRET_OK key={{key}} name={{name}}")
if missing:
    for name in missing:
        print(f"OCI_VAULT_SECRET_MISSING name={{name}}")
    raise SystemExit(42)
print("OCI_VAULT_RUNTIME_VALIDATE_OK")
PY
"""
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Vault validation payload exceeds Run Command inline limit")
    return command


def validate_output(text: str) -> None:
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    if "OCI_VAULT_RUNTIME_VALIDATE_OK" not in lines:
        missing = sorted(
            line.removeprefix("OCI_VAULT_SECRET_MISSING name=")
            for line in lines
            if line.startswith("OCI_VAULT_SECRET_MISSING name=")
        )
        detail = ", ".join(missing) if missing else "unknown Vault validation failure"
        raise SystemExit(f"OCI Vault runtime validation failed: {detail}")
    for key, name in SECRET_NAMES:
        marker = f"OCI_VAULT_SECRET_OK key={key} name={name}"
        if marker not in lines:
            raise SystemExit(f"OCI Vault validation output missing marker for {name}")


def validate_runtime(oci: Any, config: dict[str, str]) -> None:
    from oci_run_command import diagnose_plugin, execute, resolve_staging

    diagnose_plugin(oci, config)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    output = execute(
        oci,
        config,
        host_validate_command(vault_id),
        display_name="chess-studio-vault-validate",
        timeout=300,
    )
    validate_output(output)
    print(f"OCI Vault runtime validated: vault={VAULT_NAME} secrets={len(SECRET_NAMES)}")


def self_test() -> None:
    sample_vault = "ocid1.vault.oc1.eu-frankfurt-1.testvault"
    assert validate_vault_id(sample_vault) == sample_vault
    for bad in ("", "vault", "ocid1.key.oc1..wrong"):
        try:
            validate_vault_id(bad)
        except SystemExit:
            pass
        else:
            raise AssertionError("invalid Vault OCID must be rejected")

    command = host_validate_command(sample_vault)
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "SecretsClient" in command
    assert 'stage="CURRENT"' in command
    assert "OCI_VAULT_RUNTIME_VALIDATE_OK" in command
    assert "secret_bundle_content" in command
    assert "print(value" not in command
    assert "print(encoded" not in command
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    success = "\n".join(
        [f"OCI_VAULT_SECRET_OK key={key} name={name}" for key, name in SECRET_NAMES]
        + ["OCI_VAULT_RUNTIME_VALIDATE_OK"]
    )
    validate_output(success)
    try:
        validate_output("OCI_VAULT_SECRET_MISSING name=chess-studio-staging-jwt-secret")
    except SystemExit as exc:
        assert "jwt-secret" in str(exc)
    else:
        raise AssertionError("missing CURRENT secret must fail validation")
    print("OCI Vault runtime self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("validate",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "validate":
        parser.error("validate operation is required unless --self-test is used")

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    from oci_run_command import config_from_env

    validate_runtime(oci, config_from_env(oci))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
