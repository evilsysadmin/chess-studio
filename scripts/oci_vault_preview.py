#!/usr/bin/env python3
"""Materialize a disposable Vault+Git runtime preview on the A1, never install it."""
from __future__ import annotations

import argparse
import shlex
from typing import Any

from oci_runtime_config import ALLOWED_KEYS
from oci_runtime_manifest import DECLARATIVE_KEYS, load_declarative
from oci_vault_runtime import OCI_SDK_VERSION, SECRET_NAMES, resolve_vault_id, validate_vault_id

OK_MARKER = "OCI_VAULT_RUNTIME_PREVIEW_OK"


def host_preview_command(vault_id: str, declarative: dict[str, str]) -> str:
    vault_id = validate_vault_id(vault_id)
    if set(declarative) != set(DECLARATIVE_KEYS):
        raise SystemExit("declarative runtime keys do not match preview contract")
    declarative_rows = tuple((key, declarative[key]) for key in DECLARATIVE_KEYS)
    command = f"""set -euo pipefail
preview="$(mktemp /tmp/chess-studio-vault-preview.XXXXXX)"
trap 'rm -f "$preview"' EXIT
chmod 0600 "$preview"
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} PREVIEW_PATH="$preview" "$venv/bin/python" - <<'PY'
import base64, os, stat
from pathlib import Path
import oci

secret_rows = {repr(SECRET_NAMES)}
ordered_keys = {repr(tuple(ALLOWED_KEYS))}
values = dict({repr(declarative_rows)})
client = oci.secrets.SecretsClient(config={{}}, signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner())
for key, name in secret_rows:
    response = client.get_secret_bundle_by_name(secret_name=name, vault_id=os.environ["VAULT_ID"], stage="CURRENT")
    content = getattr(response.data, "secret_bundle_content", None)
    encoded = str(getattr(content, "content", "") or "")
    try:
        value = base64.b64decode(encoded, validate=True).decode("utf-8")
    except Exception:
        raise SystemExit("invalid CURRENT secret bundle: " + name) from None
    if not value or any(ch in value for ch in ("\\x00", "\\r", "\\n")):
        raise SystemExit("invalid CURRENT secret value shape: " + name)
    values[key] = value

if set(values) != set(ordered_keys):
    raise SystemExit("preview runtime key set does not match backend.env contract")
path = Path(os.environ["PREVIEW_PATH"])
path.write_text("".join(f"{{key}}={{values[key]}}\\n" for key in ordered_keys), encoding="utf-8")
os.chmod(path, 0o600)

observed = {{}}
for raw in path.read_text(encoding="utf-8").splitlines():
    if not raw or "=" not in raw:
        raise SystemExit("preview runtime contains malformed line")
    key, value = raw.split("=", 1)
    if key in observed:
        raise SystemExit("preview runtime contains duplicate key: " + key)
    if not value or any(ch in value for ch in ("\\x00", "\\r", "\\n")):
        raise SystemExit("preview runtime contains invalid value shape: " + key)
    observed[key] = value
if set(observed) != set(ordered_keys):
    raise SystemExit("preview runtime validation lost or added keys")
if stat.S_IMODE(path.stat().st_mode) != 0o600:
    raise SystemExit("preview runtime mode is not 0600")
print("{OK_MARKER} keys=" + str(len(observed)) + " mode=0600")
PY
test -s "$preview"
"""
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Vault preview payload exceeds Run Command inline limit")
    return command


def validate_output(text: str) -> None:
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    if not any(line.startswith(f"{OK_MARKER} keys=") and line.endswith(" mode=0600") for line in lines):
        raise SystemExit("OCI Vault runtime preview did not return success marker")


def preview_current(oci: Any) -> None:
    from oci_run_command import config_from_env, diagnose_plugin, execute, resolve_staging

    config = config_from_env(oci)
    diagnose_plugin(oci, config)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    output = execute(
        oci,
        config,
        host_preview_command(vault_id, load_declarative()),
        display_name="chess-studio-vault-runtime-preview",
        timeout=300,
    )
    validate_output(output)
    print("OCI Vault+Git runtime preview validated and discarded")


def self_test() -> None:
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    command = host_preview_command(
        "ocid1.vault.oc1.eu-frankfurt-1.testvault",
        load_declarative(),
    )
    assert "mktemp /tmp/chess-studio-vault-preview.XXXXXX" in command
    assert "trap 'rm -f \"$preview\"' EXIT" in command
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert 'stage="CURRENT"' in command
    assert "chmod 0600" in command and "mode=0600" in command
    assert "/etc/chess-studio/backend.env" not in command
    assert "chess-studio-install-runtime" not in command
    assert "sudo " not in command and "systemctl" not in command
    assert "print(value" not in command and "print(encoded" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    validate_output(f"{OK_MARKER} keys={len(ALLOWED_KEYS)} mode=0600")
    try:
        validate_output("OCI_VAULT_RUNTIME_PREVIEW_OK keys=19 mode=0644")
    except SystemExit:
        pass
    else:
        raise AssertionError("unsafe preview mode must fail validation")
    print("OCI Vault runtime preview self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("preview-current",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "preview-current":
        parser.error("preview-current is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    preview_current(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
