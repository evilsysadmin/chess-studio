#!/usr/bin/env python3
"""Bootstrap and materialize an isolated temporary production runtime on OCI."""
from __future__ import annotations

import argparse
import base64
import shlex
from typing import Any

SECRET_NAME = "chess-studio-production-runtime-env"
VERSION_NAME = "initial-render-production-lift"
PRODUCTION_DB = "chess_study"
STAGING_DB = "chess_study_staging"
PRODUCTION_ORIGIN = "https://chess-studio.shadowops.dpdns.org"
PRODUCTION_AI_URL = "https://ai.shadowops.dpdns.org"
OK_MARKER = "OCI_PRODUCTION_RUNTIME_SYNC_OK"


def validate_production_values(values: dict[str, str]) -> bytes:
    from oci_runtime_config import render_env_file

    db_name = str(values.get("MONGO_DB_NAME") or "").strip()
    if db_name != PRODUCTION_DB or db_name == STAGING_DB:
        raise SystemExit(
            f"Production OCI runtime must use MONGO_DB_NAME={PRODUCTION_DB}; actual={db_name or '<missing>'}"
        )
    environment = str(values.get("ENVIRONMENT") or "").strip().lower()
    if environment != "production":
        raise SystemExit(f"Production OCI runtime requires ENVIRONMENT=production; actual={environment or '<missing>'}")
    cors = str(values.get("CORS_ORIGINS") or "").strip()
    if PRODUCTION_ORIGIN not in cors or "staging" in cors.lower():
        raise SystemExit("Production OCI runtime has unsafe CORS_ORIGINS")
    ai_url = str(values.get("CF_AI_WORKER_URL") or "").strip()
    if ai_url != PRODUCTION_AI_URL or "staging" in ai_url.lower():
        raise SystemExit("Production OCI runtime has unsafe CF_AI_WORKER_URL")
    return render_env_file(values)


def collect_render_production() -> bytes:
    from oci_runtime_config import collect_render_values
    from render_production_deploy import resolve_and_validate

    service_id, _service_name = resolve_and_validate()
    return validate_production_values(collect_render_values(service_id))


def create_secret_details(
    oci: Any,
    *,
    compartment_id: str,
    key_id: str,
    vault_id: str,
    payload: bytes,
) -> Any:
    encoded = base64.b64encode(payload).decode("ascii")
    return oci.vault.models.CreateSecretDetails(
        compartment_id=compartment_id,
        key_id=key_id,
        secret_name=SECRET_NAME,
        vault_id=vault_id,
        description="Temporary Chess Studio production runtime lifted from guarded Render production.",
        freeform_tags={
            "application": "chess-studio",
            "environment": "production",
            "managed-by": "temporary-production-lift",
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

    config = config_from_env(oci)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    client = oci.vault.VaultsClient(config)
    existing = existing_secret_names(oci, client, compartment_id, vault_id)
    if SECRET_NAME in existing:
        print(f"OCI_PRODUCTION_RUNTIME_BOOTSTRAP_EXISTS name={SECRET_NAME}")
        return

    payload = collect_render_production()
    key_id = resolve_key_id(oci, config, compartment_id, vault_id)
    composite = oci.vault.VaultsClientCompositeOperations(client)
    composite.create_secret_and_wait_for_state(
        create_secret_details(
            oci,
            compartment_id=compartment_id,
            key_id=key_id,
            vault_id=vault_id,
            payload=payload,
        ),
        wait_for_states=["ACTIVE"],
        waiter_kwargs={"max_interval_seconds": 5, "max_wait_seconds": 300},
    )
    final = existing_secret_names(oci, client, compartment_id, vault_id)
    if SECRET_NAME not in final:
        raise SystemExit("Production runtime Vault bootstrap did not persist the secret")
    print(f"OCI_PRODUCTION_RUNTIME_BOOTSTRAP_OK name={SECRET_NAME} bytes={len(payload)}")


def host_sync_command(vault_id: str) -> str:
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command
    from oci_runtime_config import ALLOWED_KEYS, REQUIRED_KEYS, RUNTIME_INSTALLER
    from oci_vault_runtime import OCI_SDK_VERSION, validate_vault_id

    vault_id = validate_vault_id(vault_id)
    command = f"""set -euo pipefail
tmp="$(mktemp /tmp/chess-studio-backend.env.production.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
chmod 0600 "$tmp"
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
VAULT_ID={shlex.quote(vault_id)} RUNTIME_TMP="$tmp" "$venv/bin/python" - <<'PY'
import base64, os, re
from pathlib import Path
import oci
required=set({REQUIRED_KEYS!r})
allowed=set({ALLOWED_KEYS!r})
client=oci.secrets.SecretsClient(config={{}}, signer=oci.auth.signers.InstancePrincipalsSecurityTokenSigner())
response=client.get_secret_bundle_by_name(secret_name={SECRET_NAME!r}, vault_id=os.environ["VAULT_ID"], stage="CURRENT")
encoded=str(getattr(response.data.secret_bundle_content,"content","") or "")
try:
    text=base64.b64decode(encoded,validate=True).decode("utf-8")
except Exception:
    raise SystemExit("invalid production runtime secret bundle") from None
values={{}}
for line in text.splitlines():
    if not line or "=" not in line:
        raise SystemExit("malformed production runtime line")
    key,value=line.split("=",1)
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*",key) or key not in allowed or key in values:
        raise SystemExit("unexpected or duplicate production runtime key")
    if key in required and not value:
        raise SystemExit("empty required production runtime value")
    values[key]=value
if required-set(values):
    raise SystemExit("production runtime is missing required keys")
if values.get("MONGO_DB_NAME")!={PRODUCTION_DB!r} or values.get("MONGO_DB_NAME")=={STAGING_DB!r}:
    raise SystemExit("production runtime database guard failed")
if values.get("ENVIRONMENT","").lower()!="production":
    raise SystemExit("production runtime environment guard failed")
cors=values.get("CORS_ORIGINS","")
if {PRODUCTION_ORIGIN!r} not in cors or "staging" in cors.lower():
    raise SystemExit("production runtime CORS guard failed")
if values.get("CF_AI_WORKER_URL")!={PRODUCTION_AI_URL!r}:
    raise SystemExit("production runtime AI target guard failed")
path=Path(os.environ["RUNTIME_TMP"])
path.write_text(text if text.endswith("\n") else text+"\n",encoding="utf-8")
os.chmod(path,0o600)
PY
sudo --non-interactive {shlex.quote(RUNTIME_INSTALLER)} "$tmp" >/dev/null
tmp=''
printf '%s\n' '{OK_MARKER} target=production db={PRODUCTION_DB} mode=0600'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI production runtime sync payload exceeds Run Command inline limit")
    return command


def validate_sync_output(text: str) -> None:
    expected = f"{OK_MARKER} target=production db={PRODUCTION_DB} mode=0600"
    if expected not in {line.strip() for line in text.splitlines() if line.strip()}:
        raise SystemExit("OCI production runtime sync did not return success marker")


def sync_current(oci: Any) -> None:
    from oci_run_command import config_from_env, diagnose_plugin, execute, resolve_staging
    from oci_vault_runtime import resolve_vault_id

    config = config_from_env(oci)
    target = resolve_staging(oci, config)
    diagnose_plugin(oci, config, resolved=target, include_desired_config=False)
    compartment_id, _instance_id = target
    vault_id = resolve_vault_id(oci, config, compartment_id)
    output = execute(
        oci,
        config,
        host_sync_command(vault_id),
        display_name="chess-studio-production-runtime-sync",
        timeout=600,
        resolved=target,
    )
    validate_sync_output(output)
    print("OCI production runtime installed: target=production")


def self_test() -> None:
    from oci_runtime_config import REQUIRED_KEYS
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    values = {key: f"sample-{index}" for index, key in enumerate(REQUIRED_KEYS, start=1)}
    values.update({
        "MONGO_URL": "mongodb+srv://example.invalid/",
        "MONGO_DB_NAME": PRODUCTION_DB,
        "ENVIRONMENT": "production",
        "CORS_ORIGINS": PRODUCTION_ORIGIN,
        "CF_AI_WORKER_URL": PRODUCTION_AI_URL,
    })
    rendered = validate_production_values(values).decode("utf-8")
    assert f"MONGO_DB_NAME={PRODUCTION_DB}\n" in rendered
    assert "MONGO_DB_NAME=chess_study_staging" not in rendered

    bad = dict(values)
    bad["MONGO_DB_NAME"] = STAGING_DB
    try:
        validate_production_values(bad)
    except SystemExit:
        pass
    else:
        raise AssertionError("staging database must be rejected for production")

    sample_vault = "ocid1.vault.oc1.eu-frankfurt-1.testvault"
    command = host_sync_command(sample_vault)
    assert SECRET_NAME in command
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "chess-studio-backend.env.production.XXXXXX" in command
    assert PRODUCTION_DB in command and STAGING_DB in command
    assert "RENDER_API_KEY" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    validate_sync_output(f"{OK_MARKER} target=production db={PRODUCTION_DB} mode=0600")
    print("OCI production runtime self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("bootstrap", "sync-current"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    if args.operation == "bootstrap":
        bootstrap(oci)
    else:
        sync_current(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
