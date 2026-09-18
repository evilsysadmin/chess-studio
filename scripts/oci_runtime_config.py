#!/usr/bin/env python3
"""Move Render staging runtime config through private OCI Object Storage.

The control plane sees only metadata. Secret values move from Render staging
to a non-versioned, private OCI bucket and are then fetched by the A1 itself
using an instance principal. OCI Run Command never carries application secrets.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

RENDER_API = "https://api.render.com/v1"
RENDER_SERVICE_NAME = "chess-study-backend-staging"
OCI_COMPARTMENT_NAME = "chess-studio-staging"
DEFAULT_BUCKET = "chess-studio-staging-runtime"
DEFAULT_OBJECT = "backend.env"
RUNTIME_INSTALLER = "/usr/local/sbin/chess-studio-install-runtime"
OCI_SDK_VERSION = "2.185.2"

REQUIRED_KEYS = (
    "MONGO_URL",
    "MONGO_DB_NAME",
    "JWT_SECRET",
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
)
OPTIONAL_KEYS = ("OTEL_EXPORTER_OTLP_ENDPOINT", "OTEL_EXPORTER_OTLP_HEADERS", "CHESS_STUDIO_RUNTIME_SCHEMA")
ALLOWED_KEYS = REQUIRED_KEYS + OPTIONAL_KEYS
SAFE_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")
SAFE_OBJECT_RE = re.compile(r"^[A-Za-z0-9._/-]+$")


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def validate_storage_name(kind: str, value: str) -> str:
    normalized = value.strip()
    pattern = SAFE_OBJECT_RE if kind == "object" else SAFE_NAME_RE
    if not normalized or not pattern.fullmatch(normalized) or ".." in normalized.split("/"):
        raise SystemExit(f"Invalid OCI runtime {kind} name")
    return normalized


def render_api(method: str, path: str) -> object:
    request = urllib.request.Request(
        f"{RENDER_API}{path}",
        method=method,
        headers={
            "Authorization": f"Bearer {required_env('RENDER_API_KEY')}",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
            return json.loads(body) if body else {}
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"Render API {method} {path}: HTTP {exc.code}") from None


def unwrap_services(payload: object) -> list[dict[str, Any]]:
    if not isinstance(payload, list):
        return []
    result: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        candidate = row.get("service") if isinstance(row.get("service"), dict) else row
        if isinstance(candidate, dict):
            result.append(candidate)
    return result


def resolve_render_staging() -> str:
    query = urllib.parse.urlencode({"name": RENDER_SERVICE_NAME, "limit": "20"})
    rows = [
        row
        for row in unwrap_services(render_api("GET", f"/services?{query}"))
        if str(row.get("name") or "") == RENDER_SERVICE_NAME and row.get("id")
    ]
    if len(rows) != 1:
        raise SystemExit(
            f"Expected exactly one Render staging service named {RENDER_SERVICE_NAME}; found {len(rows)}"
        )
    return str(rows[0]["id"])


def read_render_env(service_id: str, key: str) -> str | None:
    encoded = urllib.parse.quote(key, safe="")
    try:
        payload = render_api("GET", f"/services/{service_id}/env-vars/{encoded}")
    except SystemExit as exc:
        if "HTTP 404" in str(exc):
            return None
        raise
    if not isinstance(payload, dict):
        return None
    row = payload.get("envVar") if isinstance(payload.get("envVar"), dict) else payload
    value = row.get("value") if isinstance(row, dict) else None
    return None if value is None else str(value)


def validate_value(key: str, value: str, *, required: bool) -> str:
    if any(ch in value for ch in ("\x00", "\r", "\n")):
        raise SystemExit(f"Runtime value {key} contains forbidden control characters")
    if required and not value:
        raise SystemExit(f"Render staging runtime value {key} is missing or empty")
    return value


def unwrap_render_env_vars(payload: object) -> list[tuple[str, str]]:
    if not isinstance(payload, list):
        raise SystemExit("Render env vars response must be a list")
    result: list[tuple[str, str]] = []
    for item in payload:
        if not isinstance(item, dict):
            continue
        row = item.get("envVar") if isinstance(item.get("envVar"), dict) else item
        if not isinstance(row, dict):
            continue
        key = str(row.get("key") or "").strip()
        if not key:
            continue
        value = row.get("value")
        result.append((key, "" if value is None else str(value)))
    return result


def list_render_env_values(service_id: str) -> dict[str, str]:
    values: dict[str, str] = {}
    cursor = ""
    while True:
        query_args = {"limit": "100"}
        if cursor:
            query_args["cursor"] = cursor
        query = urllib.parse.urlencode(query_args)
        payload = render_api("GET", f"/services/{service_id}/env-vars?{query}")
        rows = unwrap_render_env_vars(payload)
        for key, value in rows:
            if key in values:
                raise SystemExit(f"Render staging contains duplicate runtime key: {key}")
            values[key] = value
        if not isinstance(payload, list) or len(payload) < 100:
            break
        last = payload[-1] if payload else {}
        next_cursor = str(last.get("cursor") or "").strip() if isinstance(last, dict) else ""
        if not next_cursor or next_cursor == cursor:
            break
        cursor = next_cursor
    return values


def collect_render_values(service_id: str) -> dict[str, str]:
    available = list_render_env_values(service_id)
    values: dict[str, str] = {}
    for key in REQUIRED_KEYS:
        values[key] = validate_value(key, available.get(key, ""), required=True)
    for key in OPTIONAL_KEYS:
        raw = available.get(key, "")
        if raw:
            values[key] = validate_value(key, raw, required=False)
    return values


def render_env_file(values: dict[str, str]) -> bytes:
    unknown = set(values) - set(ALLOWED_KEYS)
    missing = set(REQUIRED_KEYS) - set(values)
    if unknown:
        raise SystemExit(f"Refusing unexpected runtime keys: {', '.join(sorted(unknown))}")
    if missing:
        raise SystemExit(f"Missing required runtime keys: {', '.join(sorted(missing))}")
    ordered = [key for key in ALLOWED_KEYS if key in values]
    for key in ordered:
        validate_value(key, values[key], required=key in REQUIRED_KEYS)
    return ("".join(f"{key}={values[key]}\n" for key in ordered)).encode("utf-8")


def oci_config(oci: Any) -> dict[str, str]:
    config = {
        "tenancy": required_env("OCI_TENANCY_OCID"),
        "user": required_env("OCI_USER_OCID"),
        "fingerprint": required_env("OCI_FINGERPRINT"),
        "key_content": required_env("OCI_PRIVATE_KEY").replace("\r", ""),
        "region": os.environ.get("OCI_REGION", "eu-frankfurt-1").strip() or "eu-frankfurt-1",
    }
    oci.config.validate_config(config)
    return config


def resolve_staging_compartment(oci: Any, config: dict[str, str]) -> str:
    identity = oci.identity.IdentityClient(config)
    rows = oci.pagination.list_call_get_all_results(
        identity.list_compartments,
        config["tenancy"],
        access_level="ACCESSIBLE",
        compartment_id_in_subtree=True,
        name=OCI_COMPARTMENT_NAME,
        lifecycle_state="ACTIVE",
    ).data
    matches = [row for row in rows if row.name == OCI_COMPARTMENT_NAME]
    if len(matches) != 1:
        raise SystemExit(
            f"Expected exactly one active OCI compartment named {OCI_COMPARTMENT_NAME}; found {len(matches)}"
        )
    return str(matches[0].id)


def publish(oci: Any, *, bucket_name: str, object_name: str) -> tuple[str, str, str]:
    bucket_name = validate_storage_name("bucket", bucket_name)
    object_name = validate_storage_name("object", object_name)
    values = collect_render_values(resolve_render_staging())
    payload = render_env_file(values)

    config = oci_config(oci)
    compartment_id = resolve_staging_compartment(oci, config)
    client = oci.object_storage.ObjectStorageClient(config)
    namespace = validate_storage_name(
        "namespace", str(client.get_namespace(compartment_id=config["tenancy"]).data)
    )
    bucket = client.get_bucket(namespace, bucket_name).data
    if str(getattr(bucket, "compartment_id", "")) != compartment_id:
        raise SystemExit("Runtime bucket is not owned by the staging compartment")
    if str(getattr(bucket, "public_access_type", "")) != "NoPublicAccess":
        raise SystemExit("Runtime bucket must remain NoPublicAccess")
    if str(getattr(bucket, "versioning", "")) != "Disabled":
        raise SystemExit("Runtime bucket versioning must remain Disabled to avoid retaining old secret bundles")

    client.put_object(
        namespace,
        bucket_name,
        object_name,
        payload,
        content_length=len(payload),
        content_type="text/plain",
    )
    head = client.head_object(namespace, bucket_name, object_name)
    observed = int(head.headers.get("content-length", "-1"))
    if observed != len(payload):
        raise SystemExit(
            f"Runtime object size verification failed: expected {len(payload)}, got {observed}"
        )
    print(
        f"OCI runtime config published: bucket={bucket_name} object={object_name} "
        f"keys={len(values)} bytes={len(payload)}"
    )
    return namespace, bucket_name, object_name


def install_command(namespace: str, bucket_name: str, object_name: str) -> str:
    namespace = validate_storage_name("namespace", namespace)
    bucket_name = validate_storage_name("bucket", bucket_name)
    object_name = validate_storage_name("object", object_name)
    required = repr(REQUIRED_KEYS)
    allowed = repr(ALLOWED_KEYS)
    command = f"""set -euo pipefail

tmp="$(mktemp /tmp/chess-studio-backend.env.XXXXXX)"
trap 'rm -f "$tmp"' EXIT
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
RUNTIME_TMP="$tmp" RUNTIME_NAMESPACE={shlex.quote(namespace)} RUNTIME_BUCKET={shlex.quote(bucket_name)} RUNTIME_OBJECT={shlex.quote(object_name)} "$venv/bin/python" - <<'PY'
import os
import re
from pathlib import Path
import oci

path = Path(os.environ["RUNTIME_TMP"])
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
response = client.get_object(
    os.environ["RUNTIME_NAMESPACE"],
    os.environ["RUNTIME_BUCKET"],
    os.environ["RUNTIME_OBJECT"],
)
expected = int(response.headers.get("content-length", "0"))
if expected <= 0 or expected > 65536:
    raise SystemExit("invalid runtime object size")
with path.open("wb") as handle:
    for chunk in response.data.raw.stream(1024 * 1024, decode_content=False):
        handle.write(chunk)
if path.stat().st_size != expected:
    raise SystemExit("runtime object truncated")
os.chmod(path, 0o600)

required = set({required})
allowed = set({allowed})
seen = set()
text = path.read_text(encoding="utf-8")
if "\\x00" in text or "\\r" in text:
    raise SystemExit("runtime object contains forbidden control characters")
for line in text.splitlines():
    if not line or "=" not in line:
        raise SystemExit("runtime object contains malformed line")
    key, value = line.split("=", 1)
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", key) or key not in allowed or key in seen:
        raise SystemExit("runtime object contains unexpected or duplicate key")
    if key in required and not value:
        raise SystemExit("runtime object contains empty required value")
    seen.add(key)
if required - seen:
    raise SystemExit("runtime object is missing required keys")
PY
test -s "$tmp"
test -x {shlex.quote(RUNTIME_INSTALLER)}
sudo --non-interactive {shlex.quote(RUNTIME_INSTALLER)} "$tmp"
trap - EXIT
"""
    from oci_run_command import assert_nonsecret_command

    assert_nonsecret_command(command)
    return command


def install(
    oci: Any,
    config: dict[str, str],
    *,
    namespace: str,
    bucket_name: str,
    object_name: str,
) -> None:
    from oci_run_command import diagnose_plugin, execute

    diagnose_plugin(oci, config)
    execute(
        oci,
        config,
        install_command(namespace, bucket_name, object_name),
        display_name="chess-studio-runtime-sync",
        timeout=600,
    )


def sync(oci: Any, *, bucket_name: str, object_name: str) -> None:
    namespace, bucket_name, object_name = publish(
        oci, bucket_name=bucket_name, object_name=object_name
    )
    install(
        oci,
        oci_config(oci),
        namespace=namespace,
        bucket_name=bucket_name,
        object_name=object_name,
    )
    print("OCI runtime config installed on staging")


def self_test() -> None:
    sample = {key: f"value-{index}" for index, key in enumerate(REQUIRED_KEYS, start=1)}
    sample["OTEL_EXPORTER_OTLP_ENDPOINT"] = "https://otel.example.test"
    rendered = render_env_file(sample).decode("utf-8")
    assert rendered.startswith("MONGO_URL=value-1\n")
    assert "OTEL_EXPORTER_OTLP_ENDPOINT=https://otel.example.test\n" in rendered
    assert "RENDER_API_KEY" not in ALLOWED_KEYS
    assert "OCI_PRIVATE_KEY" not in ALLOWED_KEYS
    assert "RESEND_API_KEY" not in ALLOWED_KEYS

    env_rows = unwrap_render_env_vars([
        {"envVar": {"key": "MONGO_URL", "value": "mongodb://example"}, "cursor": "c1"},
        {"key": "JWT_SECRET", "value": "secret", "cursor": "c2"},
        {"envVar": {"key": "IGNORED", "value": None}},
    ])
    assert env_rows == [
        ("MONGO_URL", "mongodb://example"),
        ("JWT_SECRET", "secret"),
        ("IGNORED", ""),
    ]

    try:
        validate_value("JWT_SECRET", "bad\nvalue", required=True)
    except SystemExit:
        pass
    else:
        raise AssertionError("multiline runtime values must be rejected")
    try:
        render_env_file({**sample, "SURPRISE_SECRET": "nope"})
    except SystemExit:
        pass
    else:
        raise AssertionError("unexpected runtime keys must be rejected")
    missing = dict(sample)
    missing.pop("JWT_SECRET")
    try:
        render_env_file(missing)
    except SystemExit:
        pass
    else:
        raise AssertionError("missing required runtime keys must be rejected")
    for kind, bad in (("bucket", "bad name"), ("object", "../backend.env")):
        try:
            validate_storage_name(kind, bad)
        except SystemExit:
            pass
        else:
            raise AssertionError("unsafe Object Storage names must be rejected")

    command = install_command("chessnamespace", DEFAULT_BUCKET, DEFAULT_OBJECT)
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert RUNTIME_INSTALLER in command
    assert "sudo --non-interactive" in command
    assert "MONGO_URL=" not in command
    assert "JWT_SECRET=" not in command
    assert "CHESS_AI_SHARED_SECRET=" not in command
    print("OCI runtime config self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("publish", "sync"))
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--object", dest="object_name", default=DEFAULT_OBJECT)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation not in {"publish", "sync"}:
        parser.error("operation publish or sync is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    if args.operation == "publish":
        publish(oci, bucket_name=args.bucket, object_name=args.object_name)
    else:
        sync(oci, bucket_name=args.bucket, object_name=args.object_name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
