#!/usr/bin/env python3
"""Diagnose OCI staging Mongo readiness without exposing runtime secrets."""
from __future__ import annotations

import os
import shlex
from pathlib import Path

from oci_run_command import (
    OCI_SDK_VERSION,
    RUNTIME_BUCKET,
    RUNTIME_OBJECT,
    config_from_env,
    diagnose_plugin,
    execute,
    runtime_namespace,
)

MOTOR_VERSION = "3.7.1"


def diagnostic_command(namespace: str) -> str:
    safe_namespace = shlex.quote(namespace)
    return f"""set -euo pipefail
venv="${{HOME:-/tmp}}/.cache/chess-studio-oci-runtime"
if [ ! -x "$venv/bin/python" ]; then
  python3 -m venv "$venv"
fi
if ! "$venv/bin/python" -c 'import oci; raise SystemExit(0 if oci.__version__ == "{OCI_SDK_VERSION}" else 1)' >/dev/null 2>&1; then
  "$venv/bin/python" -m pip install --disable-pip-version-check --quiet --upgrade 'oci=={OCI_SDK_VERSION}'
fi
if ! "$venv/bin/python" -c 'import motor, pymongo, dns' >/dev/null 2>&1; then
  "$venv/bin/python" -m pip install --disable-pip-version-check --quiet 'motor=={MOTOR_VERSION}' 'dnspython>=2.6,<3'
fi
DIAG_NAMESPACE={safe_namespace} "$venv/bin/python" - <<'PY'
import json
import os
import urllib.request

import oci
from pymongo import MongoClient


def category(exc):
    text = str(exc).lower()
    if any(token in text for token in ("authentication failed", "not authorized", "auth failed")):
        return "auth"
    if any(token in text for token in ("certificate", "ssl", "tls")):
        return "tls"
    if any(token in text for token in ("nxdomain", "dns", "name or service not known", "srv")):
        return "dns"
    if any(token in text for token in ("timed out", "timeout")):
        return "timeout"
    if "connection refused" in text:
        return "refused"
    if any(token in text for token in ("connection reset", "connection closed", "closed connection")):
        return "connection"
    return "other"


try:
    request = urllib.request.Request(
        "http://169.254.169.254/opc/v2/vnics/",
        headers={{"Authorization": "Bearer Oracle"}},
    )
    with urllib.request.urlopen(request, timeout=3) as response:
        vnics = json.loads(response.read().decode("utf-8"))
    public_ip = next((str(row.get("publicIp") or "").strip() for row in vnics if row.get("publicIp")), "unknown")
except Exception:
    public_ip = "unknown"
print(f"OCI_EGRESS_PUBLIC_IP={{public_ip}}")

signer = oci.auth.signers.InstancePrincipalsSecurityTokenSigner()
client = oci.object_storage.ObjectStorageClient(config={{}}, signer=signer)
response = client.get_object(
    os.environ["DIAG_NAMESPACE"],
    "{RUNTIME_BUCKET}",
    "{RUNTIME_OBJECT}",
)
data = response.data.content.decode("utf-8")
env = {{}}
for line in data.splitlines():
    if not line or "=" not in line:
        continue
    key, value = line.split("=", 1)
    env[key] = value
uri = env.get("MONGO_URL", "")
if not uri:
    print("MONGO_DIAG_FAIL category=config exception=MissingMongoUrl")
    raise SystemExit(0)
scheme = uri.split(":", 1)[0].lower()
print(f"MONGO_DIAG_CONFIG scheme={{scheme}} db_name_present={{bool(env.get('MONGO_DB_NAME'))}}")

mongo = None
try:
    mongo = MongoClient(
        uri,
        serverSelectionTimeoutMS=6000,
        connectTimeoutMS=5000,
        socketTimeoutMS=5000,
    )
    mongo.admin.command("ping")
except Exception as exc:
    print(f"MONGO_DIAG_FAIL category={{category(exc)}} exception={{type(exc).__name__}}")
else:
    print("MONGO_DIAG_OK ping=success")
finally:
    if mongo is not None:
        mongo.close()
PY
"""


def main() -> int:
    import oci  # type: ignore

    config = config_from_env(oci)
    diagnose_plugin(oci, config)
    namespace = runtime_namespace(oci, config)
    output = execute(
        oci,
        config,
        diagnostic_command(namespace),
        display_name="chess-studio-mongo-readiness-diagnose",
        timeout=180,
    )
    summary = os.environ.get("GITHUB_STEP_SUMMARY", "").strip()
    if summary:
        Path(summary).open("a", encoding="utf-8").write(
            "### OCI staging · Mongo readiness diagnosis\n\n```text\n"
            + output
            + "\n```\n"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
