#!/usr/bin/env python3
"""Probe staging Mongo connectivity from the OCI A1 without exporting secrets.

The A1 fetches the already-published private runtime object with its instance
principal. MONGO_URL never crosses OCI Run Command and never appears in logs.
Only aggregate DNS/TCP/TLS results and exception class/code are emitted.
"""
from __future__ import annotations

import argparse
import shlex
from typing import Any

from oci_run_command import assert_nonsecret_command, diagnose_plugin, execute
from oci_runtime_config import (
    DEFAULT_BUCKET,
    DEFAULT_OBJECT,
    oci_config,
    resolve_staging_compartment,
    validate_storage_name,
)

PYMONGO_SPEC = "pymongo[srv]>=4.9,<5"


def probe_command(namespace: str, bucket_name: str, object_name: str) -> str:
    namespace = validate_storage_name("namespace", namespace)
    bucket_name = validate_storage_name("bucket", bucket_name)
    object_name = validate_storage_name("object", object_name)
    command = f"""set -euo pipefail

venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
test -x "$venv/bin/python"
if ! "$venv/bin/python" -c 'import pymongo, dns' >/dev/null 2>&1; then
  "$venv/bin/pip" install --disable-pip-version-check --quiet {shlex.quote(PYMONGO_SPEC)} >/dev/null 2>&1
fi
PROBE_NAMESPACE={shlex.quote(namespace)} PROBE_BUCKET={shlex.quote(bucket_name)} PROBE_OBJECT={shlex.quote(object_name)} "$venv/bin/python" - <<'PY'
import os
import socket
import ssl
import warnings

import oci
from pymongo import MongoClient, uri_parser
from pymongo.errors import ConfigurationError, OperationFailure, ServerSelectionTimeoutError

warnings.filterwarnings("ignore")
signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
response = client.get_object(
    os.environ["PROBE_NAMESPACE"],
    os.environ["PROBE_BUCKET"],
    os.environ["PROBE_OBJECT"],
)
expected = int(response.headers.get("content-length", "0"))
if expected <= 0 or expected > 65536:
    raise SystemExit("OCI_MONGO_PROBE runtime_object=invalid_size")
buffer = bytearray()
for chunk in response.data.raw.stream(1024 * 1024, decode_content=False):
    buffer.extend(chunk)
if len(buffer) != expected:
    raise SystemExit("OCI_MONGO_PROBE runtime_object=truncated")
text = bytes(buffer).decode("utf-8")
values = {{}}
for line in text.splitlines():
    if not line or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key] = value
mongo_key = "MONGO" + "_URL"
uri = values.get(mongo_key, "").strip()
if not uri:
    raise SystemExit("OCI_MONGO_PROBE mongo_uri=missing")

scheme = uri.split("://", 1)[0].lower() if "://" in uri else "unknown"
provider = "unknown-or-self-managed"
authority = uri.split("://", 1)[1].split("/", 1)[0] if "://" in uri else ""
host_part = authority.rsplit("@", 1)[-1].lower()
raw_hosts = [item.strip() for item in host_part.split(",") if item.strip()]
def host_only(value):
    if value.startswith("[") and "]" in value:
        return value[1:value.index("]")]
    if value.count(":") == 1 and value.rsplit(":", 1)[1].isdigit():
        return value.rsplit(":", 1)[0]
    return value
seed_hosts = [host_only(value) for value in raw_hosts]
if seed_hosts and all(host == "mongodb.net" or host.endswith(".mongodb.net") for host in seed_hosts):
    provider = "mongodb-atlas"
print(f"OCI_MONGO_PROBE target scheme={{scheme}} provider={{provider}} seeds={{len(seed_hosts)}}")

try:
    parsed = uri_parser.parse_uri(uri, validate=True, warn=False)
    nodes = list(parsed.get("nodelist") or [])
except Exception as exc:
    print(f"OCI_MONGO_PROBE stage=srv result=failed error={{type(exc).__name__}}")
    raise SystemExit(0)

print(f"OCI_MONGO_PROBE stage=srv result=ok nodes={{len(nodes)}}")
dns_ok = 0
tcp_ok = 0
tls_ok = 0
context = ssl.create_default_context()
for host, port in nodes:
    try:
        socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        dns_ok += 1
    except OSError:
        continue
    raw = None
    try:
        raw = socket.create_connection((host, port), timeout=3)
        tcp_ok += 1
        raw.settimeout(4)
        wrapped = context.wrap_socket(raw, server_hostname=host)
        tls_ok += 1
        wrapped.close()
        raw = None
    except (OSError, ssl.SSLError):
        pass
    finally:
        if raw is not None:
            try:
                raw.close()
            except OSError:
                pass
print(f"OCI_MONGO_PROBE stage=network dns={{dns_ok}}/{{len(nodes)}} tcp={{tcp_ok}}/{{len(nodes)}} tls={{tls_ok}}/{{len(nodes)}}")

mongo = None
try:
    mongo = MongoClient(
        uri,
        serverSelectionTimeoutMS=6000,
        connectTimeoutMS=3000,
        socketTimeoutMS=3000,
    )
    mongo.admin.command("ping")
    print("OCI_MONGO_PROBE stage=driver result=ping-ok")
except OperationFailure as exc:
    code = int(getattr(exc, "code", 0) or 0)
    print(f"OCI_MONGO_PROBE stage=driver result=failed error=OperationFailure code={{code}}")
except ServerSelectionTimeoutError:
    print("OCI_MONGO_PROBE stage=driver result=failed error=ServerSelectionTimeoutError")
except ConfigurationError:
    print("OCI_MONGO_PROBE stage=driver result=failed error=ConfigurationError")
except Exception as exc:
    print(f"OCI_MONGO_PROBE stage=driver result=failed error={{type(exc).__name__}}")
finally:
    if mongo is not None:
        mongo.close()
PY
"""
    assert_nonsecret_command(command)
    return command


def resolve_private_runtime(oci: Any, config: dict[str, str]) -> tuple[str, str, str]:
    bucket_name = validate_storage_name("bucket", DEFAULT_BUCKET)
    object_name = validate_storage_name("object", DEFAULT_OBJECT)
    compartment_id = resolve_staging_compartment(oci, config)
    storage = oci.object_storage.ObjectStorageClient(config)
    namespace = validate_storage_name(
        "namespace", str(storage.get_namespace(compartment_id=config["tenancy"]).data)
    )
    bucket = storage.get_bucket(namespace, bucket_name).data
    if str(getattr(bucket, "compartment_id", "")) != compartment_id:
        raise SystemExit("Runtime bucket is not owned by the staging compartment")
    if str(getattr(bucket, "public_access_type", "")) != "NoPublicAccess":
        raise SystemExit("Runtime bucket must remain NoPublicAccess")
    storage.head_object(namespace, bucket_name, object_name)
    return namespace, bucket_name, object_name


def diagnose(oci: Any) -> None:
    config = oci_config(oci)
    namespace, bucket_name, object_name = resolve_private_runtime(oci, config)
    diagnose_plugin(oci, config)
    execute(
        oci,
        config,
        probe_command(namespace, bucket_name, object_name),
        display_name="chess-studio-mongo-network-probe",
        timeout=240,
    )


def self_test() -> None:
    command = probe_command("namespace", "runtime-bucket", "backend.env")
    assert "InstancePrincipalsSecurityTokenSigner" in command
    assert "stage=network" in command
    assert "stage=driver" in command
    assert "docker" not in command
    assert "MONGO_URL=" not in command
    assert "password" not in command.lower()
    assert "print(uri" not in command
    print("OCI Mongo network diagnostics self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    diagnose(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
