#!/usr/bin/env python3
"""Install OCI staging runtime from CURRENT Vault values + versioned Git config."""
from __future__ import annotations

import argparse
import shlex
from typing import Any

from oci_runtime_config import ALLOWED_KEYS, OPTIONAL_KEYS, REQUIRED_KEYS, RUNTIME_INSTALLER
from oci_runtime_manifest import DECLARATIVE_KEYS, load_declarative
from oci_vault_runtime import OCI_SDK_VERSION, SECRET_NAMES, resolve_vault_id, validate_vault_id

OK_MARKER = "OCI_VAULT_RUNTIME_SYNC_OK"


def host_sync_command(vault_id: str, declarative: dict[str, str]) -> str:
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    vault_id = validate_vault_id(vault_id)
    if set(declarative) != set(DECLARATIVE_KEYS):
        raise SystemExit("declarative runtime keys do not match sync contract")
    declarative_rows = tuple((key, declarative[key]) for key in DECLARATIVE_KEYS)
    optional_secret_keys = tuple(key for key, _name in SECRET_NAMES if key in OPTIONAL_KEYS)
    command = f"""set -euo pipefail
tmp="$(mktemp /tmp/chess-studio-backend.env.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
chmod 0600 "$tmp"
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} RUNTIME_TMP="$tmp" "$venv/bin/python" - <<'PY'
import base64, os
from pathlib import Path
import oci
secret_rows={SECRET_NAMES!r}
optional_secret_keys=set({optional_secret_keys!r})
ordered={tuple(ALLOWED_KEYS)!r}
required=set({tuple(REQUIRED_KEYS)!r})
values=dict({declarative_rows!r})
client=oci.secrets.SecretsClient(config={{}}, signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner())
missing=[]
for key,name in secret_rows:
    try:
        response=client.get_secret_bundle_by_name(secret_name=name,vault_id=os.environ["VAULT_ID"],stage="CURRENT")
    except oci.exceptions.ServiceError as exc:
        if exc.status==404:
            if key in optional_secret_keys:
                print("OCI_VAULT_SECRET_OPTIONAL_MISSING key="+key+" name="+name+" stage=CURRENT")
                continue
            missing.append(name)
            continue
        print("OCI_VAULT_SECRET_ERROR name="+name+" status="+str(exc.status)+" code="+str(exc.code or "-"))
        raise SystemExit(43) from None
    content=getattr(response.data,"secret_bundle_content",None)
    encoded=str(getattr(content,"content","") or "")
    try:
        value=base64.b64decode(encoded,validate=True).decode("utf-8")
    except Exception:
        raise SystemExit("invalid CURRENT secret bundle: "+name) from None
    if not value or any(ch in value for ch in ("\\x00","\\r","\\n")):
        raise SystemExit("invalid CURRENT secret value shape: "+name)
    values[key]=value
if missing:
    for name in missing:
        print("OCI_VAULT_SECRET_MISSING name="+name+" stage=CURRENT")
    raise SystemExit(42)
present=set(values)
if required-present:
    raise SystemExit("runtime is missing required backend.env keys")
if present-set(ordered):
    raise SystemExit("runtime contains unexpected backend.env keys")
path=Path(os.environ["RUNTIME_TMP"])
path.write_text("".join(f"{{key}}={{values[key]}}\\n" for key in ordered if key in values),encoding="utf-8")
os.chmod(path,0o600)
PY
sudo --non-interactive {shlex.quote(RUNTIME_INSTALLER)} "$tmp" >/dev/null
tmp=''
printf '%s\n' '{OK_MARKER} target=installed keys={len(ALLOWED_KEYS)} mode=0600'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Vault runtime sync payload exceeds Run Command inline limit")
    return command


def validate_output(text: str) -> None:
    lines = {line.strip() for line in text.splitlines() if line.strip()}
    if not any(line.startswith(f"{OK_MARKER} target=installed keys=") and line.endswith(" mode=0600") for line in lines):
        raise SystemExit("OCI Vault runtime sync did not return success marker")


def sync_current(
    oci: Any,
    *,
    config: dict[str, str] | None = None,
    resolved: tuple[str, str] | None = None,
    diagnose: bool = True,
) -> None:
    from oci_run_command import config_from_env, diagnose_plugin, execute, resolve_staging

    runtime_config = config or config_from_env(oci)
    target = resolved or resolve_staging(oci, runtime_config)
    if diagnose:
        diagnose_plugin(
            oci,
            runtime_config,
            resolved=target,
            include_desired_config=False,
        )
    compartment_id, _instance_id = target
    vault_id = resolve_vault_id(oci, runtime_config, compartment_id)
    output = execute(
        oci,
        runtime_config,
        host_sync_command(vault_id, load_declarative()),
        display_name="chess-studio-vault-runtime-sync",
        timeout=600,
        resolved=target,
    )
    validate_output(output)
    print("OCI Vault+Git CURRENT runtime installed on staging")


def self_test() -> None:
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    declarative = load_declarative()
    command = host_sync_command(
        "ocid1.vault.oc1.eu-frankfurt-1.testvault",
        declarative,
    )
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert 'stage="CURRENT"' in command
    assert "mktemp /tmp/chess-studio-backend.env.XXXXXX" in command
    assert RUNTIME_INSTALLER in command
    assert "sudo --non-interactive" in command
    assert "CHESS_STUDIO_RUNTIME_SCHEMA" in command
    assert "vault-git-v1" in command
    assert "RENDER_API_KEY" not in command
    assert "ObjectStorageClient" not in command
    assert "put_object" not in command
    assert "OCI_VAULT_SECRET_MISSING" in command
    assert "OCI_VAULT_SECRET_OPTIONAL_MISSING" in command
    assert "OCI_VAULT_SECRET_ERROR" in command
    assert "MONGO_URL=" not in command
    assert "JWT_SECRET=" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    validate_output(f"{OK_MARKER} target=installed keys={len(ALLOWED_KEYS)} mode=0600")
    try:
        validate_output("OCI_VAULT_RUNTIME_DIFF key=OTEL_EXPORTER_OTLP_ENDPOINT")
    except SystemExit:
        pass
    else:
        raise AssertionError("missing sync marker must fail closed")
    print("OCI Vault runtime sync self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("sync-current",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "sync-current":
        parser.error("sync-current is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    sync_current(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
