#!/usr/bin/env python3
"""Emergency Cloudflare Tunnel cutover for the existing OCI staging A1.

The Cloudflare tunnel token never enters GitHub logs or OCI Run Command payloads:
Actions stores it in the existing private OCI runtime bucket and the instance
retrieves it with its instance principal. DNS is changed only after Cloudflare
reports a live connector and the backend is locally ready.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shlex
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

CF_API = "https://api.cloudflare.com/client/v4"
ZONE_NAME = "shadowops.dpdns.org"
API_HOSTNAME = "api-staging.chess-studio.shadowops.dpdns.org"
TUNNEL_NAME = "chess-studio-staging"
OCI_COMPARTMENT_NAME = "chess-studio-staging"
RUNTIME_BUCKET = "chess-studio-staging-runtime"
TOKEN_OBJECT = "cloudflared.token"
CLOUDFLARED_VERSION = "2026.9.1"
CLOUDFLARED_SHA256 = "3d97437c71848bd8df68041e12436b484a661d95073ea1937f01a845ce88faa3"
CLOUDFLARED_URL = (
    f"https://github.com/cloudflare/cloudflared/releases/download/{CLOUDFLARED_VERSION}/"
    "cloudflared-linux-arm64"
)
OCI_SDK_VERSION = "2.185.2"
UUID_RE = re.compile(r"^[0-9a-fA-F-]{36}$")


def required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def cf_request(method: str, path: str, payload: object | None = None) -> object:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{CF_API}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {required('CLOUDFLARE_API_TOKEN')}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read()
            body = json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {"errors": [{"message": raw.decode("utf-8", "replace")[:500]}]}
        messages = []
        if isinstance(body, dict):
            for item in body.get("errors") or []:
                if isinstance(item, dict):
                    messages.append(str(item.get("message") or item.get("code") or "error"))
        detail = "; ".join(messages[:4])
        raise SystemExit(f"Cloudflare {method} {path}: HTTP {exc.code}{': ' + detail if detail else ''}") from None
    if not isinstance(body, dict) or body.get("success") is False:
        raise SystemExit(f"Cloudflare {method} {path}: invalid/success=false response")
    return body.get("result")


def account_id() -> str:
    return required("CLOUDFLARE_ACCOUNT_ID")


def list_tunnels() -> list[dict[str, Any]]:
    query = urllib.parse.urlencode({"name": TUNNEL_NAME, "is_deleted": "false", "per_page": "100"})
    result = cf_request("GET", f"/accounts/{account_id()}/cfd_tunnel?{query}")
    rows = result if isinstance(result, list) else []
    return [row for row in rows if isinstance(row, dict) and row.get("name") == TUNNEL_NAME]


def ensure_tunnel() -> str:
    rows = list_tunnels()
    if len(rows) > 1:
        raise SystemExit(f"Expected at most one active tunnel named {TUNNEL_NAME}; found {len(rows)}")
    if rows:
        tunnel_id = str(rows[0].get("id") or "")
    else:
        created = cf_request(
            "POST",
            f"/accounts/{account_id()}/cfd_tunnel",
            {"name": TUNNEL_NAME, "config_src": "cloudflare"},
        )
        tunnel_id = str(created.get("id") or "") if isinstance(created, dict) else ""
    if not UUID_RE.fullmatch(tunnel_id):
        raise SystemExit("Cloudflare returned an invalid tunnel id")
    return tunnel_id


def desired_ingress() -> dict[str, object]:
    return {
        "config": {
            "ingress": [
                {
                    "hostname": API_HOSTNAME,
                    "service": "http://127.0.0.1:4000",
                    "originRequest": {},
                },
                {"service": "http_status:404"},
            ]
        }
    }


def configure_tunnel(tunnel_id: str) -> None:
    cf_request(
        "PUT",
        f"/accounts/{account_id()}/cfd_tunnel/{tunnel_id}/configurations",
        desired_ingress(),
    )


def tunnel_token(tunnel_id: str) -> str:
    result = cf_request("GET", f"/accounts/{account_id()}/cfd_tunnel/{tunnel_id}/token")
    token = str(result or "").strip()
    if len(token) < 80 or any(ch.isspace() for ch in token):
        raise SystemExit("Cloudflare returned an invalid tunnel token")
    return token


def oci_config(oci: Any) -> dict[str, str]:
    config = {
        "tenancy": required("OCI_TENANCY_OCID"),
        "user": required("OCI_USER_OCID"),
        "fingerprint": required("OCI_FINGERPRINT"),
        "key_content": required("OCI_PRIVATE_KEY").replace("\r", ""),
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


def publish_token(oci: Any, config: dict[str, str], token: str) -> tuple[str, str, str]:
    compartment_id = resolve_staging_compartment(oci, config)
    client = oci.object_storage.ObjectStorageClient(config)
    namespace = str(client.get_namespace(compartment_id=config["tenancy"]).data)
    bucket = client.get_bucket(namespace, RUNTIME_BUCKET).data
    if str(getattr(bucket, "compartment_id", "")) != compartment_id:
        raise SystemExit("Tunnel-token bucket is not owned by the staging compartment")
    if str(getattr(bucket, "public_access_type", "")) != "NoPublicAccess":
        raise SystemExit("Tunnel-token bucket must remain NoPublicAccess")
    if str(getattr(bucket, "versioning", "")) != "Disabled":
        raise SystemExit("Tunnel-token bucket versioning must remain Disabled")
    payload = (token + "\n").encode("utf-8")
    client.put_object(
        namespace,
        RUNTIME_BUCKET,
        TOKEN_OBJECT,
        payload,
        content_length=len(payload),
        content_type="text/plain",
    )
    print(f"OCI tunnel token published privately: bucket={RUNTIME_BUCKET} object={TOKEN_OBJECT}")
    return namespace, RUNTIME_BUCKET, TOKEN_OBJECT


def host_command(namespace: str, bucket: str, object_name: str) -> str:
    command = f"""set -euo pipefail
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:4000/api/ready >/dev/null
root="${{HOME:-/tmp}}/.cache/chess-studio-cloudflared"
mkdir -p "$root"
chmod 700 "$root"
token_file="$root/token"
bin="$root/cloudflared-{CLOUDFLARED_VERSION}"
pid_file="$root/pid"
log_file="$root/cloudflared.log"
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
  "$venv/bin/pip" install --disable-pip-version-check --quiet 'oci=={OCI_SDK_VERSION}'
fi
TUNNEL_TOKEN_FILE="$token_file" TUNNEL_NAMESPACE={shlex.quote(namespace)} TUNNEL_BUCKET={shlex.quote(bucket)} TUNNEL_OBJECT={shlex.quote(object_name)} "$venv/bin/python" - <<'PY'
import os
from pathlib import Path
import oci
path = Path(os.environ['TUNNEL_TOKEN_FILE'])
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
response = client.get_object(
    os.environ['TUNNEL_NAMESPACE'], os.environ['TUNNEL_BUCKET'], os.environ['TUNNEL_OBJECT']
)
data = response.data.content
if len(data) < 80 or len(data) > 4096:
    raise SystemExit('invalid tunnel token object size')
path.write_bytes(data)
os.chmod(path, 0o600)
PY
if [ ! -x "$bin" ]; then
  tmp="$bin.tmp"
  curl --fail --location --silent --show-error --max-time 120 {shlex.quote(CLOUDFLARED_URL)} -o "$tmp"
  printf '%s  %s\n' {shlex.quote(CLOUDFLARED_SHA256)} "$tmp" | sha256sum --check --status
  chmod 700 "$tmp"
  mv -f "$tmp" "$bin"
fi
if [ -s "$pid_file" ]; then
  old_pid="$(cat "$pid_file" 2>/dev/null || true)"
  if printf '%s' "$old_pid" | grep -Eq '^[0-9]+$' && kill -0 "$old_pid" 2>/dev/null; then
    kill "$old_pid" || true
    for _ in $(seq 1 20); do
      kill -0 "$old_pid" 2>/dev/null || break
      sleep 0.25
    done
  fi
fi
: >"$log_file"
nohup setsid "$bin" tunnel --no-autoupdate --loglevel info --logfile "$log_file" run --token-file "$token_file" </dev/null >/dev/null 2>&1 &
new_pid=$!
printf '%s\n' "$new_pid" >"$pid_file"
sleep 3
kill -0 "$new_pid"
printf '%s\n' "CHESS_STUDIO_CLOUDFLARED_STARTED pid=$new_pid version={CLOUDFLARED_VERSION}"
"""
    from oci_run_command import assert_nonsecret_command

    assert_nonsecret_command(command)
    return command


def start_connector(oci: Any, config: dict[str, str], namespace: str, bucket: str, object_name: str) -> None:
    from oci_run_command import diagnose_plugin, execute

    diagnose_plugin(oci, config)
    execute(
        oci,
        config,
        host_command(namespace, bucket, object_name),
        display_name="chess-studio-cloudflared-start",
        timeout=600,
    )


def wait_connection(tunnel_id: str, timeout: int = 120) -> None:
    deadline = time.monotonic() + timeout
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        result = cf_request("GET", f"/accounts/{account_id()}/cfd_tunnel/{tunnel_id}/connections")
        rows = result if isinstance(result, list) else []
        if rows:
            print(f"Cloudflare tunnel connected after {attempt} checks; connectors={len(rows)}")
            return
        time.sleep(3)
    raise SystemExit("Cloudflare tunnel did not report a live connector; DNS left unchanged")


def zone_id() -> str:
    query = urllib.parse.urlencode({"name": ZONE_NAME, "account.id": account_id(), "per_page": "50"})
    result = cf_request("GET", f"/zones?{query}")
    rows = result if isinstance(result, list) else []
    matches = [row for row in rows if isinstance(row, dict) and row.get("name") == ZONE_NAME]
    if len(matches) != 1 or not matches[0].get("id"):
        raise SystemExit(f"Expected exactly one Cloudflare zone named {ZONE_NAME}; found {len(matches)}")
    return str(matches[0]["id"])


def ensure_dns(tunnel_id: str) -> None:
    zid = zone_id()
    query = urllib.parse.urlencode({"name": API_HOSTNAME, "per_page": "100"})
    result = cf_request("GET", f"/zones/{zid}/dns_records?{query}")
    rows = [row for row in (result if isinstance(result, list) else []) if isinstance(row, dict)]
    if len(rows) > 1:
        raise SystemExit(f"More than one DNS record exists for {API_HOSTNAME}; refusing ambiguous cutover")
    desired = {
        "type": "CNAME",
        "name": API_HOSTNAME,
        "content": f"{tunnel_id}.cfargotunnel.com",
        "proxied": True,
        "ttl": 1,
        "comment": "Chess Studio staging API · OCI Cloudflare Tunnel",
    }
    if not rows:
        cf_request("POST", f"/zones/{zid}/dns_records", desired)
        action = "created"
    else:
        row = rows[0]
        if row.get("type") != "CNAME" or not row.get("id"):
            raise SystemExit(f"Existing {API_HOSTNAME} record is not an editable CNAME")
        current = str(row.get("content") or "").rstrip(".")
        if current == desired["content"] and bool(row.get("proxied")):
            action = "unchanged"
        else:
            cf_request("PATCH", f"/zones/{zid}/dns_records/{row['id']}", desired)
            action = "updated"
    print(f"Cloudflare DNS {action}: {API_HOSTNAME} -> {desired['content']}")


def wait_public_ready(timeout: int = 120) -> None:
    deadline = time.monotonic() + timeout
    last = ""
    while time.monotonic() < deadline:
        try:
            request = urllib.request.Request(
                f"https://{API_HOSTNAME}/api/ready",
                headers={"Accept": "application/json", "User-Agent": "chess-studio-oci-cutover/1"},
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                body = json.loads(response.read())
            if isinstance(body, dict) and body.get("ok") is True and body.get("storage") == "mongo":
                print(f"OCI staging public readiness OK: https://{API_HOSTNAME}/api/ready")
                return
            last = f"unexpected payload {body!r}"
        except Exception as exc:  # bounded diagnostic; no secrets in this request
            last = f"{type(exc).__name__}: {exc}"
        time.sleep(3)
    raise SystemExit(f"Public OCI staging readiness did not converge: {last[:300]}")


def reconcile(oci: Any) -> None:
    config = oci_config(oci)
    tunnel_id = ensure_tunnel()
    configure_tunnel(tunnel_id)
    token = tunnel_token(tunnel_id)
    namespace, bucket, object_name = publish_token(oci, config, token)
    start_connector(oci, config, namespace, bucket, object_name)
    wait_connection(tunnel_id)
    ensure_dns(tunnel_id)
    wait_public_ready()
    print(f"CHESS_STUDIO_OCI_TUNNEL_OK tunnel_id={tunnel_id} hostname={API_HOSTNAME}")


def self_test() -> None:
    ingress = desired_ingress()
    rules = ingress["config"]["ingress"]  # type: ignore[index]
    assert rules[0]["hostname"] == API_HOSTNAME
    assert rules[0]["service"] == "http://127.0.0.1:4000"
    assert rules[-1]["service"] == "http_status:404"
    command = host_command("namespace", RUNTIME_BUCKET, TOKEN_OBJECT)
    assert "--token-file" in command
    assert CLOUDFLARED_SHA256 in command
    assert "http://127.0.0.1:4000/api/ready" in command
    assert "TUNNEL_TOKEN=" not in command
    assert "eyJ" not in command
    print("OCI Cloudflare tunnel self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("reconcile",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "reconcile":
        parser.error("operation reconcile is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    reconcile(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())