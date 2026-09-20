#!/usr/bin/env python3
"""Bootstrap and materialize an isolated temporary production runtime on OCI."""
from __future__ import annotations

import argparse
import base64
import os
import shlex
from pathlib import Path
from typing import Any

SECRET_NAME = "chess-studio-production-runtime-env"
VERSION_NAME = "initial-render-production-lift"
PRODUCTION_DB = "chess_study"
STAGING_DB = "chess_study_staging"
PRODUCTION_ORIGIN = "https://chess-studio.shadowops.dpdns.org"
PRODUCTION_AI_URL = "https://ai.shadowops.dpdns.org"
OK_MARKER = "OCI_PRODUCTION_RUNTIME_SYNC_OK"

PRODUCTION_ALLOWED_KEYS = (
    "MONGO_URL",
    "MONGO_DB_NAME",
    "JWT_SECRET",
    "RESEND_API_KEY",
    "PASSWORD_RESET_URL",
    "PASSWORD_RESET_FROM",
    "ENVIRONMENT",
    "EXPOSE_API_DOCS",
    "ALLOW_REGISTRATION",
    "INVITE_CODE",
    "ENABLE_EMAIL_RECOVERY",
    "ADMIN_USERNAMES",
    "CF_AI_WORKER_URL",
    "CHESS_AI_SHARED_SECRET",
    "CORS_ORIGINS",
    "OTEL_SERVICE_NAME",
    "OTEL_TRACES_ENABLED",
    "OTEL_METRICS_ENABLED",
    "OTEL_LOGS_ENABLED",
    "OTEL_EXPORTER_OTLP_PROTOCOL",
    "OTEL_TRACES_SAMPLER",
    "OTEL_TRACES_SAMPLER_ARG",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
    "CHESS_STUDIO_RUNTIME_SCHEMA",
)
PRODUCTION_DEFAULTS = {
    # Mirror backend defaults for keys that are safe to materialize explicitly.
    # Environment identity/origin are pinned because this stack is production.
    "MONGO_DB_NAME": PRODUCTION_DB,
    "ENVIRONMENT": "production",
    "EXPOSE_API_DOCS": "false",
    "ALLOW_REGISTRATION": "true",
    "ENABLE_EMAIL_RECOVERY": "false",
    "CORS_ORIGINS": PRODUCTION_ORIGIN,
    "OTEL_SERVICE_NAME": "chess-studio-backend",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
    "OTEL_TRACES_SAMPLER": "parentbased_traceidratio",
    "OTEL_TRACES_SAMPLER_ARG": "0.20",
    "CHESS_STUDIO_RUNTIME_SCHEMA": "render-production-lift-v3",
}
PRODUCTION_SECRET_KEYS = (
    "MONGO_URL",
    "JWT_SECRET",
    "RESEND_API_KEY",
    "INVITE_CODE",
    "CHESS_AI_SHARED_SECRET",
    "OTEL_EXPORTER_OTLP_ENDPOINT",
    "OTEL_EXPORTER_OTLP_HEADERS",
)
PRODUCTION_ALWAYS_REQUIRED = (
    "MONGO_URL",
    "MONGO_DB_NAME",
    "JWT_SECRET",
    "ENVIRONMENT",
    "EXPOSE_API_DOCS",
    "ALLOW_REGISTRATION",
    "ENABLE_EMAIL_RECOVERY",
    "CORS_ORIGINS",
    "CHESS_STUDIO_RUNTIME_SCHEMA",
)
TRUE_VALUES = {"1", "true", "yes", "on"}
RUNNER_READABLE_KEYS = frozenset({"INVITE_CODE"})


def _clean_value(key: str, value: object, *, allow_empty: bool = False) -> str:
    text = "" if value is None else str(value)
    if any(ch in text for ch in ("\x00", "\r", "\n")):
        raise SystemExit(f"Production OCI runtime contains invalid control characters for {key}")
    if not allow_empty and not text:
        raise SystemExit(f"Production OCI runtime value {key} is missing or empty")
    return text


def effective_production_values(actual: dict[str, str]) -> dict[str, str]:
    """Compose the effective Render production runtime without leaking unknown keys."""
    values = dict(PRODUCTION_DEFAULTS)
    allowed = set(PRODUCTION_ALLOWED_KEYS)
    for key, raw in actual.items():
        if key not in allowed:
            continue
        value = _clean_value(key, raw, allow_empty=True)
        if value:
            values[key] = value
        elif key in {"INVITE_CODE", "ADMIN_USERNAMES"}:
            values[key] = ""

    for key in PRODUCTION_ALWAYS_REQUIRED:
        _clean_value(key, values.get(key, ""))

    if str(values["MONGO_DB_NAME"]).strip() != PRODUCTION_DB:
        raise SystemExit(
            f"Production OCI runtime must use MONGO_DB_NAME={PRODUCTION_DB}; "
            f"actual={values.get('MONGO_DB_NAME') or '<missing>'}"
        )
    if str(values["ENVIRONMENT"]).strip().lower() != "production":
        raise SystemExit(
            f"Production OCI runtime requires ENVIRONMENT=production; "
            f"actual={values.get('ENVIRONMENT') or '<missing>'}"
        )

    cors = str(values["CORS_ORIGINS"]).strip()
    if PRODUCTION_ORIGIN not in cors or "staging" in cors.lower():
        raise SystemExit("Production OCI runtime has unsafe CORS_ORIGINS")
    ai_url = str(values.get("CF_AI_WORKER_URL") or "").strip()
    if ai_url:
        if ai_url != PRODUCTION_AI_URL or "staging" in ai_url.lower():
            raise SystemExit("Production OCI runtime has unsafe CF_AI_WORKER_URL")
        _clean_value("CHESS_AI_SHARED_SECRET", values.get("CHESS_AI_SHARED_SECRET", ""))

    email_enabled = str(values["ENABLE_EMAIL_RECOVERY"]).strip().lower() in TRUE_VALUES
    if email_enabled:
        reset_url = str(values.get("PASSWORD_RESET_URL") or "").strip()
        if not reset_url.startswith(PRODUCTION_ORIGIN) or "staging" in reset_url.lower():
            raise SystemExit("Production OCI runtime has unsafe PASSWORD_RESET_URL")

    return values


def render_production_env(values: dict[str, str]) -> bytes:
    unknown = set(values) - set(PRODUCTION_ALLOWED_KEYS)
    if unknown:
        raise SystemExit(
            "Refusing unexpected production runtime keys: " + ", ".join(sorted(unknown))
        )
    for key in PRODUCTION_ALWAYS_REQUIRED:
        _clean_value(key, values.get(key, ""))
    ordered = [key for key in PRODUCTION_ALLOWED_KEYS if key in values]
    return "".join(
        f"{key}={_clean_value(key, values[key], allow_empty=key in {'INVITE_CODE', 'ADMIN_USERNAMES'})}\n"
        for key in ordered
    ).encode("utf-8")


def validate_production_values(values: dict[str, str]) -> bytes:
    return render_production_env(effective_production_values(values))


def parse_production_env(payload: bytes) -> dict[str, str]:
    """Parse the CURRENT production runtime without exposing secret values."""
    if not payload or len(payload) > 65536:
        raise SystemExit("Invalid production runtime secret bundle size")
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit("Production runtime secret bundle is not valid UTF-8") from exc
    if "\x00" in text or "\r" in text:
        raise SystemExit("Production runtime secret bundle contains forbidden control characters")

    allowed = set(PRODUCTION_ALLOWED_KEYS)
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line or "=" not in line:
            raise SystemExit("Malformed production runtime line")
        key, value = line.split("=", 1)
        if key not in allowed or key in values:
            raise SystemExit("Unexpected or duplicate production runtime key")
        if "\x00" in value or "\r" in value or "\n" in value:
            raise SystemExit("Production runtime value contains forbidden control characters")
        values[key] = value
    return effective_production_values(values)


def read_current_production_values(oci: Any) -> dict[str, str]:
    """Read and validate the production runtime directly from OCI Vault."""
    from oci_run_command import config_from_env, resolve_staging
    from oci_vault_runtime import resolve_vault_id

    config = config_from_env(oci)
    compartment_id, _instance_id = resolve_staging(oci, config)
    vault_id = resolve_vault_id(oci, config, compartment_id)
    client = oci.secrets.SecretsClient(config)
    response = client.get_secret_bundle_by_name(
        secret_name=SECRET_NAME,
        vault_id=vault_id,
        stage="CURRENT",
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    )
    bundle_content = getattr(response.data, "secret_bundle_content", None)
    encoded = str(getattr(bundle_content, "content", "") or "")
    try:
        payload = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise SystemExit("Invalid production runtime secret bundle encoding") from exc
    return parse_production_env(payload)


def export_synthetic_invite(oci: Any) -> None:
    """Expose only INVITE_CODE to a trusted Actions step through GITHUB_ENV."""
    values = read_current_production_values(oci)
    key = "INVITE_CODE"
    if key not in RUNNER_READABLE_KEYS:
        raise SystemExit("Synthetic invite key is outside runner allowlist")
    value = _clean_value(key, values.get(key, ""))
    github_env = str(os.environ.get("GITHUB_ENV") or "").strip()
    if not github_env:
        raise SystemExit("GITHUB_ENV is required for synthetic invite export")
    print(f"::add-mask::{value}")
    with Path(github_env).open("a", encoding="utf-8") as handle:
        handle.write(f"CHESS_SYNTHETIC_INVITE_CODE={value}\n")
    print("OCI_PRODUCTION_SYNTHETIC_INVITE_OK configured=true source=vault")


def collect_render_production() -> bytes:
    from oci_runtime_config import list_render_env_values
    from render_production_deploy import resolve_and_validate

    service_id, _service_name = resolve_and_validate()
    actual = list_render_env_values(service_id)
    effective = effective_production_values(actual)
    if (
        str(effective["ENABLE_EMAIL_RECOVERY"]).strip().lower() in TRUE_VALUES
        and not str(effective.get("RESEND_API_KEY") or "").strip()
    ):
        print(
            "OCI_PRODUCTION_RUNTIME_WARNING "
            "email_recovery_enabled_without_resend_key=true parity=render"
        )
    return render_production_env(effective)


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
    from oci_runtime_config import RUNTIME_INSTALLER
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
required=set({PRODUCTION_ALWAYS_REQUIRED!r})
allowed=set({PRODUCTION_ALLOWED_KEYS!r})
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
ai_url=values.get("CF_AI_WORKER_URL","")
if ai_url and (ai_url!={PRODUCTION_AI_URL!r} or "staging" in ai_url.lower()):
    raise SystemExit("production runtime AI target guard failed")
if ai_url and not values.get("CHESS_AI_SHARED_SECRET"):
    raise SystemExit("production runtime AI secret guard failed")
email_enabled=values.get("ENABLE_EMAIL_RECOVERY","").lower() in {TRUE_VALUES!r}
reset_url=values.get("PASSWORD_RESET_URL","")
if email_enabled and ({PRODUCTION_ORIGIN!r} not in reset_url or "staging" in reset_url.lower()):
    raise SystemExit("production runtime password reset target guard failed")
path=Path(os.environ["RUNTIME_TMP"])
path.write_text(text if text.endswith("\\n") else text+"\\n",encoding="utf-8")
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
    from oci_run_command import RUN_COMMAND_INLINE_MAX_BYTES, assert_nonsecret_command

    # Missing optional flags must behave exactly like the backend defaults:
    # email recovery stays OFF, OTEL enablement is endpoint-driven, and AI
    # narrative stays disabled unless Render explicitly configured its URL.
    actual = {
        "MONGO_URL": "mongodb+srv://example.invalid/",
        "JWT_SECRET": "jwt-secret",
        "INVITE_CODE": "invite-secret",
        "OTEL_EXPORTER_OTLP_ENDPOINT": "https://otel.example.test",
        "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Basic sample",
        "ALLOW_REGISTRATION": "false",
        "ADMIN_USERNAMES": "evilsysadmin",
    }
    effective = effective_production_values(actual)
    assert effective["MONGO_DB_NAME"] == PRODUCTION_DB
    assert effective["ENVIRONMENT"] == "production"
    assert effective["EXPOSE_API_DOCS"] == "false"
    assert effective["ENABLE_EMAIL_RECOVERY"] == "false"
    assert "RESEND_API_KEY" not in effective
    assert "PASSWORD_RESET_URL" not in effective
    assert "CF_AI_WORKER_URL" not in effective
    assert "OTEL_TRACES_ENABLED" not in effective
    assert effective["OTEL_TRACES_SAMPLER_ARG"] == "0.20"
    assert effective["ALLOW_REGISTRATION"] == "false"

    rendered_bytes = render_production_env(effective)
    rendered = rendered_bytes.decode("utf-8")
    parsed = parse_production_env(rendered_bytes)
    assert parsed["INVITE_CODE"] == "invite-secret"
    assert parsed["MONGO_DB_NAME"] == PRODUCTION_DB
    assert f"MONGO_DB_NAME={PRODUCTION_DB}\n" in rendered
    assert "MONGO_DB_NAME=chess_study_staging" not in rendered
    assert "EXPOSE_API_DOCS=false\n" in rendered
    assert "ENABLE_EMAIL_RECOVERY=false\n" in rendered
    assert "RESEND_API_KEY=" not in rendered
    assert "PASSWORD_RESET_URL=" not in rendered
    assert "CF_AI_WORKER_URL=" not in rendered
    assert "OTEL_TRACES_SAMPLER_ARG=0.20\n" in rendered

    email_enabled = {
        **actual,
        "ENABLE_EMAIL_RECOVERY": "true",
        "RESEND_API_KEY": "resend-secret",
        "PASSWORD_RESET_URL": PRODUCTION_ORIGIN + "/",
        "PASSWORD_RESET_FROM": "Chess Studio <prod@example.test>",
    }
    enabled = effective_production_values(email_enabled)
    assert enabled["ENABLE_EMAIL_RECOVERY"] == "true"
    assert enabled["RESEND_API_KEY"] == "resend-secret"
    assert enabled["PASSWORD_RESET_URL"] == PRODUCTION_ORIGIN + "/"

    missing_resend = dict(email_enabled)
    missing_resend.pop("RESEND_API_KEY")
    degraded = effective_production_values(missing_resend)
    assert degraded["ENABLE_EMAIL_RECOVERY"] == "true"
    assert "RESEND_API_KEY" not in degraded
    degraded_rendered = render_production_env(degraded).decode("utf-8")
    assert "ENABLE_EMAIL_RECOVERY=true\n" in degraded_rendered
    assert "RESEND_API_KEY=" not in degraded_rendered

    ai_enabled = {
        **actual,
        "CF_AI_WORKER_URL": PRODUCTION_AI_URL,
        "CHESS_AI_SHARED_SECRET": "ai-secret",
    }
    assert effective_production_values(ai_enabled)["CF_AI_WORKER_URL"] == PRODUCTION_AI_URL

    bad_ai = dict(ai_enabled, CF_AI_WORKER_URL="https://ai-staging.shadowops.dpdns.org")
    try:
        effective_production_values(bad_ai)
    except SystemExit:
        pass
    else:
        raise AssertionError("staging AI URL must be rejected for production")

    bad_db = dict(actual, MONGO_DB_NAME=STAGING_DB)
    try:
        effective_production_values(bad_db)
    except SystemExit:
        pass
    else:
        raise AssertionError("staging database must be rejected for production")

    sample_vault = "ocid1.vault.oc1.eu-frankfurt-1.testvault"
    command = host_sync_command(sample_vault)
    embedded_python = command.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    compile(embedded_python, "<oci-production-runtime-sync>", "exec")
    assert SECRET_NAME in command
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "chess-studio-backend.env.production.XXXXXX" in command
    assert PRODUCTION_DB in command and STAGING_DB in command
    assert "RESEND_API_KEY=" not in command
    assert "RENDER_API_KEY" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert_nonsecret_command(command)
    embedded = command.split("<<'PY'\n", 1)[1].split("\nPY\n", 1)[0]
    compile(embedded, "<oci-production-runtime-sync>", "exec")
    validate_sync_output(f"{OK_MARKER} target=production db={PRODUCTION_DB} mode=0600")
    print("OCI production runtime self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("bootstrap", "sync-current", "export-synthetic-invite"))
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
    elif args.operation == "sync-current":
        sync_current(oci)
    else:
        export_synthetic_invite(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
