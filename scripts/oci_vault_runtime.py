#!/usr/bin/env python3
"""Validate OCI staging runtime values from Vault without exposing plaintext.

The control plane resolves only the non-secret Vault OCID, then asks the A1 to
read secret bundles with its Instance Principal. Normal validation reads
CURRENT. Rotation validation reads PENDING for exactly one selected key and
CURRENT for every other key, so a candidate can be staged without changing the
active runtime contract.
"""
from __future__ import annotations

import argparse
import re
import shlex
from typing import Any

from oci_runtime_config import OPTIONAL_KEYS

VAULT_NAME = "chess-studio-staging"
VAULT_OCID_RE = re.compile(r"^ocid1\.vault\.[A-Za-z0-9._-]+$")
OCI_SDK_VERSION = "2.185.2"
SECRET_NAMES = (
    ("MONGO_URL", "chess-studio-staging-mongo-url"),
    ("JWT_SECRET", "chess-studio-staging-jwt-secret"),
    ("INVITE_CODE", "chess-studio-staging-invite-code"),
    ("CHESS_AI_SHARED_SECRET", "chess-studio-staging-ai-shared-secret"),
    ("OTEL_EXPORTER_OTLP_ENDPOINT", "chess-studio-staging-otel-endpoint"),
    ("OTEL_EXPORTER_OTLP_HEADERS", "chess-studio-staging-otel-headers"),
)
SECRET_KEYS = tuple(key for key, _name in SECRET_NAMES)
OPTIONAL_SECRET_KEYS = tuple(key for key in SECRET_KEYS if key in OPTIONAL_KEYS)


def validate_vault_id(value: str) -> str:
    normalized = value.strip()
    if not VAULT_OCID_RE.fullmatch(normalized):
        raise SystemExit("invalid OCI Vault OCID")
    return normalized


def validate_pending_key(value: str) -> str:
    normalized = value.strip()
    if normalized not in SECRET_KEYS:
        raise SystemExit("pending secret key is not part of the staging Vault contract")
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
        and str(getattr(row, "lifecycle_state", "") or "").upper() == "ACTIVE"
    ]
    if len(matches) != 1:
        raise SystemExit(f"Expected exactly one ACTIVE Vault named {VAULT_NAME}; found {len(matches)}")
    return validate_vault_id(str(matches[0].id))


def host_validate_command(vault_id: str, pending_key: str = "") -> str:
    vault_id = validate_vault_id(vault_id)
    if pending_key:
        pending_key = validate_pending_key(pending_key)
    secret_rows = repr(SECRET_NAMES)
    command = f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} PENDING_KEY={shlex.quote(pending_key)} "$venv/bin/python" - <<'PY'
import base64
import os
import oci

secret_rows = {secret_rows}
optional_keys = set({OPTIONAL_SECRET_KEYS!r})
pending_key = os.environ.get("PENDING_KEY", "")
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.secrets.SecretsClient(config={{}}, signer=signer)
missing = []
for key, name in secret_rows:
    stage = "PENDING" if pending_key and key == pending_key else "CURRENT"
    try:
        response = client.get_secret_bundle_by_name(
            secret_name=name,
            vault_id=os.environ["VAULT_ID"],
            stage=stage,
        )
    except oci.exceptions.ServiceError as exc:
        if exc.status == 404:
            if stage == "CURRENT" and key in optional_keys:
                print(f"OCI_VAULT_SECRET_OPTIONAL_MISSING key={key} name={name} stage={stage}")
                continue
            missing.append((name, stage))
            continue
        raise
    bundle_content = getattr(response.data, "secret_bundle_content", None)
    encoded = str(getattr(bundle_content, "content", "") or "")
    try:
        value = base64.b64decode(encoded, validate=True)
    except Exception:
        raise SystemExit(f"invalid {{stage}} secret bundle: {{name}}") from None
    if not value or b"\\x00" in value or b"\\r" in value or b"\\n" in value:
        raise SystemExit(f"invalid {{stage}} secret value shape: {{name}}")
    version = int(getattr(response.data, "version_number", 0) or 0)
    if version <= 0:
        raise SystemExit(f"invalid {{stage}} secret version metadata: {{name}}")
    print(f"OCI_VAULT_SECRET_OK key={{key}} name={{name}} stage={{stage}} version={{version}}")
if missing:
    for name, stage in missing:
        print(f"OCI_VAULT_SECRET_MISSING name={{name}} stage={{stage}}")
    raise SystemExit(42)
mode = "pending" if pending_key else "current"
print(f"OCI_VAULT_RUNTIME_VALIDATE_OK mode={{mode}} key={{pending_key or '-'}}")
PY
"""
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Vault validation payload exceeds Run Command inline limit")
    return command


def validate_output(text: str, pending_key: str = "") -> None:
    if pending_key:
        pending_key = validate_pending_key(pending_key)
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    expected_mode = "pending" if pending_key else "current"
    expected_final = f"OCI_VAULT_RUNTIME_VALIDATE_OK mode={expected_mode} key={pending_key or '-'}"
    if expected_final not in lines:
        missing = sorted(
            line.removeprefix("OCI_VAULT_SECRET_MISSING name=")
            for line in lines
            if line.startswith("OCI_VAULT_SECRET_MISSING name=")
        )
        detail = ", ".join(missing) if missing else "unknown Vault validation failure"
        raise SystemExit(f"OCI Vault runtime validation failed: {detail}")
    for key, name in SECRET_NAMES:
        stage = "PENDING" if pending_key and key == pending_key else "CURRENT"
        prefix = f"OCI_VAULT_SECRET_OK key={key} name={name} stage={stage} version="
        optional_missing = f"OCI_VAULT_SECRET_OPTIONAL_MISSING key={key} name={name} stage={stage}"
        if stage == "CURRENT" and key in OPTIONAL_SECRET_KEYS and optional_missing in lines:
            continue
        if not any(line.startswith(prefix) for line in lines):
            raise SystemExit(f"OCI Vault validation output missing {stage} marker for {name}")


def validate_runtime(oci: Any, config: dict[str, str], pending_key: str = "") -> None:
    from oci_run_command import diagnose_plugin, execute, resolve_staging

    if pending_key:
        pending_key = validate_pending_key(pending_key)
    diagnose_plugin(oci, config)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    output = execute(
        oci,
        config,
        host_validate_command(vault_id, pending_key),
        display_name=(
            f"chess-studio-vault-pending-{pending_key.lower()}"
            if pending_key
            else "chess-studio-vault-validate"
        ),
        timeout=300,
    )
    validate_output(output, pending_key)
    mode = f"PENDING {pending_key}" if pending_key else "CURRENT"
    print(f"OCI Vault runtime validated: vault={VAULT_NAME} mode={mode} values={len(SECRET_NAMES)}")


def sample_output(pending_key: str = "") -> str:
    rows = []
    for index, (key, name) in enumerate(SECRET_NAMES, start=1):
        stage = "PENDING" if pending_key and key == pending_key else "CURRENT"
        rows.append(f"OCI_VAULT_SECRET_OK key={key} name={name} stage={stage} version={index}")
    mode = "pending" if pending_key else "current"
    rows.append(f"OCI_VAULT_RUNTIME_VALIDATE_OK mode={mode} key={pending_key or '-'}")
    return "\n".join(rows)


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
    assert validate_pending_key("JWT_SECRET") == "JWT_SECRET"
    try:
        validate_pending_key("NOT_A_RUNTIME_KEY")
    except SystemExit:
        pass
    else:
        raise AssertionError("unknown pending key must be rejected")

    current = host_validate_command(sample_vault)
    pending = host_validate_command(sample_vault, "JWT_SECRET")
    for command in (current, pending):
        assert "InstancePrincipalsSecurityTokenSigner" in command
        assert "SecretsClient" in command
        assert "OCI_VAULT_RUNTIME_VALIDATE_OK" in command
        assert "secret_bundle_content" in command
        assert "print(value" not in command
        assert "print(encoded" not in command
        from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

        assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
        assert_nonsecret_command(command)
    assert 'stage = "PENDING" if pending_key and key == pending_key else "CURRENT"' in pending
    assert "OCI_VAULT_SECRET_OPTIONAL_MISSING" in current
    validate_output(sample_output())
    validate_output(sample_output("JWT_SECRET"), "JWT_SECRET")
    optional_headers_ok = (
        "OCI_VAULT_SECRET_OK key=OTEL_EXPORTER_OTLP_HEADERS "
        "name=chess-studio-staging-otel-headers stage=CURRENT version=6"
    )
    optional_headers_missing = (
        "OCI_VAULT_SECRET_OPTIONAL_MISSING key=OTEL_EXPORTER_OTLP_HEADERS "
        "name=chess-studio-staging-otel-headers stage=CURRENT"
    )
    validate_output(sample_output().replace(optional_headers_ok, optional_headers_missing))
    try:
        validate_output("OCI_VAULT_SECRET_MISSING name=chess-studio-staging-jwt-secret stage=PENDING", "JWT_SECRET")
    except SystemExit as exc:
        assert "jwt-secret" in str(exc)
    else:
        raise AssertionError("missing PENDING secret must fail validation")
    print("OCI Vault runtime self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("validate", "validate-pending"))
    parser.add_argument("--key", choices=SECRET_KEYS, default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")
    if args.operation == "validate-pending" and not args.key:
        parser.error("--key is required for validate-pending")
    if args.operation == "validate" and args.key:
        parser.error("--key is only valid for validate-pending")

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    from oci_run_command import config_from_env

    validate_runtime(oci, config_from_env(oci), args.key if args.operation == "validate-pending" else "")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
