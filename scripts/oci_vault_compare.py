#!/usr/bin/env python3
"""Compare prospective Vault+Git runtime with the persisted private OCI runtime source."""
from __future__ import annotations

import argparse
import shlex
from typing import Any

from oci_runtime_manifest import DECLARATIVE_KEYS, load_declarative
from oci_vault_runtime import OCI_SDK_VERSION, SECRET_NAMES, resolve_vault_id, validate_vault_id

OK_MARKER = "OCI_VAULT_RUNTIME_COMPARE_OK"


def host_compare_command(vault_id: str, namespace: str, declarative: dict[str, str]) -> str:
    from oci_run_command import RUNTIME_BUCKET, RUNTIME_OBJECT, validate_namespace

    vault_id = validate_vault_id(vault_id)
    namespace = validate_namespace(namespace)
    if set(declarative) != set(DECLARATIVE_KEYS):
        raise SystemExit("declarative runtime keys do not match comparison contract")
    declarative_rows = tuple((key, declarative[key]) for key in DECLARATIVE_KEYS)
    command = f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} RUNTIME_NAMESPACE={shlex.quote(namespace)} "$venv/bin/python" - <<'PY'
import base64, os
import oci

secret_rows = {repr(SECRET_NAMES)}
expected = dict({repr(declarative_rows)})
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
secrets = oci.secrets.SecretsClient(config={{}}, signer=signer)
storage = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
for key, name in secret_rows:
    response = secrets.get_secret_bundle_by_name(secret_name=name, vault_id=os.environ["VAULT_ID"], stage="CURRENT")
    content = getattr(response.data, "secret_bundle_content", None)
    encoded = str(getattr(content, "content", "") or "")
    try:
        value = base64.b64decode(encoded, validate=True).decode("utf-8")
    except Exception:
        raise SystemExit("invalid CURRENT secret bundle: " + name) from None
    if not value or any(ch in value for ch in ("\\x00", "\\r", "\\n")):
        raise SystemExit("invalid CURRENT secret value shape: " + name)
    expected[key] = value

runtime = storage.get_object(os.environ["RUNTIME_NAMESPACE"], {RUNTIME_BUCKET!r}, {RUNTIME_OBJECT!r})
try:
    text = runtime.data.content.decode("utf-8")
except Exception:
    raise SystemExit("persisted runtime object is not valid UTF-8") from None
if "\\x00" in text or "\\r" in text:
    raise SystemExit("persisted runtime object contains forbidden control characters")
actual = {{}}
for raw in text.splitlines():
    if not raw or "=" not in raw:
        raise SystemExit("persisted runtime object contains malformed line")
    key, value = raw.split("=", 1)
    if key == "COMMIT_SHA":
        continue
    if key in actual:
        raise SystemExit("persisted runtime object contains duplicate key: " + key)
    actual[key] = value

missing = sorted(set(expected) - set(actual))
extra = sorted(set(actual) - set(expected))
different = sorted(key for key in set(expected) & set(actual) if expected[key] != actual[key])
for key in missing:
    print("OCI_VAULT_RUNTIME_MISSING key=" + key)
for key in extra:
    print("OCI_VAULT_RUNTIME_EXTRA key=" + key)
for key in different:
    print("OCI_VAULT_RUNTIME_DIFF key=" + key)
if missing or extra or different:
    raise SystemExit(43)
print("{OK_MARKER} target=object-storage keys=" + str(len(expected)))
PY
"""
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Vault comparison payload exceeds Run Command inline limit")
    return command


def validate_output(text: str) -> None:
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    if not any(line.startswith(f"{OK_MARKER} target=object-storage keys=") for line in lines):
        raise SystemExit("OCI Vault runtime comparison did not return success marker")


def compare_current(oci: Any) -> None:
    from oci_run_command import config_from_env, diagnose_plugin, execute, resolve_staging, runtime_namespace

    config = config_from_env(oci)
    diagnose_plugin(oci, config)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    namespace = runtime_namespace(oci, config)
    output = execute(
        oci,
        config,
        host_compare_command(vault_id, namespace, load_declarative()),
        display_name="chess-studio-vault-runtime-compare",
        timeout=300,
    )
    validate_output(output)
    print("OCI Vault+Git runtime matches persisted private runtime source")


def self_test() -> None:
    from oci_run_command import RUNTIME_BUCKET, RUNTIME_OBJECT, RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    command = host_compare_command(
        "ocid1.vault.oc1.eu-frankfurt-1.testvault",
        "chessnamespace",
        load_declarative(),
    )
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "ObjectStorageClient" in command and "get_object" in command
    assert RUNTIME_BUCKET in command and RUNTIME_OBJECT in command
    assert "/etc/chess-studio/backend.env" not in command
    assert OK_MARKER in command and 'stage="CURRENT"' in command
    assert 'if key == "COMMIT_SHA"' in command
    assert "print(value" not in command and "print(encoded" not in command
    assert "sudo " not in command and "systemctl" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    validate_output(f"{OK_MARKER} target=object-storage keys=19")
    try:
        validate_output("OCI_VAULT_RUNTIME_DIFF key=JWT_SECRET")
    except SystemExit:
        pass
    else:
        raise AssertionError("comparison mismatch must fail closed")
    print("OCI Vault runtime comparison self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("compare-current",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "compare-current":
        parser.error("compare-current is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    compare_current(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
