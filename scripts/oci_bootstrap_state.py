#!/usr/bin/env python3
"""Migrate the one-time OCI bootstrap seed state to the native OCI backend."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STACK = ROOT / "infra" / "oci" / "bootstrap"
LOCAL_STATE = STACK / "terraform.tfstate"
BACKEND_TEMPLATE = STACK / "backend.generated.tf.example"
BACKEND_DECL = STACK / "backend.generated.tf"
BACKEND_CONFIG = STACK / "backend.hcl"
DEFAULT_STATE_KEY = "chess-studio/bootstrap/terraform.tfstate"


def fail(message: str) -> "NoReturn":
    raise SystemExit(message)


def load_state(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"state ausente: {path}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(f"state JSON inválido: {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"state inválido: {path}")
    return value


def output_value(state: dict, name: str) -> str:
    try:
        value = state["outputs"][name]["value"]
    except (KeyError, TypeError) as exc:
        raise ValueError(f"output requerido ausente en seed state: {name}") from exc
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"output requerido vacío en seed state: {name}")
    return value.strip()


def backend_values_from_seed(state: dict) -> tuple[str, str, str]:
    return (
        output_value(state, "state_bucket"),
        output_value(state, "object_storage_namespace"),
        output_value(state, "region"),
    )


def render_backend_config(bucket: str, namespace: str, region: str, key: str) -> str:
    values = {
        "bucket": bucket,
        "namespace": namespace,
        "key": key,
        "region": region,
    }
    return "".join(f"{name} = {json.dumps(value)}\n" for name, value in values.items())


def write_backend_files(bucket: str, namespace: str, region: str, key: str) -> None:
    BACKEND_DECL.write_text(BACKEND_TEMPLATE.read_text(encoding="utf-8"), encoding="utf-8")
    BACKEND_CONFIG.write_text(render_backend_config(bucket, namespace, region, key), encoding="utf-8")
    BACKEND_CONFIG.chmod(0o600)


def resource_addresses(state: dict) -> set[str]:
    result: set[str] = set()
    resources = state.get("resources", [])
    if not isinstance(resources, list):
        raise ValueError("state.resources debe ser una lista")
    for resource in resources:
        if not isinstance(resource, dict):
            raise ValueError("entrada state.resources inválida")
        module = resource.get("module")
        prefix = f"{module}." if isinstance(module, str) and module else ""
        mode = "data." if resource.get("mode") == "data" else ""
        base = f"{prefix}{mode}{resource.get('type')}.{resource.get('name')}"
        instances = resource.get("instances") or [{}]
        for instance in instances:
            index = instance.get("index_key") if isinstance(instance, dict) else None
            if index is None:
                result.add(base)
            elif isinstance(index, str):
                result.add(f"{base}[{json.dumps(index)}]")
            else:
                result.add(f"{base}[{index}]")
    return result


def verify_migration(before: dict, after: dict) -> None:
    before_lineage = before.get("lineage")
    after_lineage = after.get("lineage")
    if before_lineage and after_lineage and before_lineage != after_lineage:
        raise ValueError("lineage cambió durante la migración")
    before_serial = before.get("serial", 0)
    after_serial = after.get("serial", 0)
    if not isinstance(before_serial, int) or not isinstance(after_serial, int) or after_serial < before_serial:
        raise ValueError("serial remoto retrocedió durante la migración")
    before_resources = resource_addresses(before)
    after_resources = resource_addresses(after)
    if before_resources != after_resources:
        missing = sorted(before_resources - after_resources)
        extra = sorted(after_resources - before_resources)
        raise ValueError(f"recursos cambiaron durante migración; missing={missing} extra={extra}")


def terraform(
    *args: str,
    capture: bool = False,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    command = ["terraform", f"-chdir={STACK}", *args]
    return subprocess.run(
        command,
        check=check,
        text=True,
        capture_output=capture,
        env={**os.environ, "TF_IN_AUTOMATION": "true", "TF_INPUT": "false"},
    )


def bucket_not_ready(text: str) -> bool:
    lowered = text.lower()
    return "bucketnotfound" in lowered or "http status code: 404" in lowered or "status code: 404" in lowered


def migrate_backend(max_attempts: int = 6) -> None:
    last_detail = ""
    for attempt in range(1, max_attempts + 1):
        result = terraform(
            "init",
            "-migrate-state",
            "-force-copy",
            f"-backend-config={BACKEND_CONFIG}",
            capture=True,
            check=False,
        )
        if result.returncode == 0:
            return
        last_detail = f"{result.stdout}\n{result.stderr}".strip()
        if not bucket_not_ready(last_detail):
            raise ValueError(f"terraform init -migrate-state falló: {last_detail[-3000:]}")
        if attempt < max_attempts:
            delay = min(2 * attempt, 10)
            print(
                f"OCI Object Storage aún no expone el bucket al backend; retry {attempt}/{max_attempts} en {delay}s",
                file=sys.stderr,
            )
            time.sleep(delay)
    raise ValueError(
        "Object Storage siguió devolviendo BucketNotFound durante la migración: "
        + last_detail[-3000:]
    )


def migrate() -> None:
    before = load_state(LOCAL_STATE)
    bucket, namespace, region = backend_values_from_seed(before)
    key = os.environ.get("OCI_BOOTSTRAP_STATE_KEY", DEFAULT_STATE_KEY)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = STACK / f"terraform.tfstate.pre-migrate.{stamp}.bak"
    shutil.copy2(LOCAL_STATE, backup)
    write_backend_files(bucket, namespace, region, key)

    migrate_backend()
    pulled = terraform("state", "pull", capture=True).stdout
    try:
        after = json.loads(pulled)
    except json.JSONDecodeError as exc:
        raise ValueError(f"state remoto inválido tras migración: {exc}") from exc
    verify_migration(before, after)
    print(f"OCI bootstrap state migrado y verificado · backup local: {backup}")


def init_remote() -> None:
    bucket = os.environ.get("OCI_TFSTATE_BUCKET", "").strip()
    namespace = os.environ.get("OCI_TFSTATE_NAMESPACE", "").strip()
    region = os.environ.get("OCI_REGION", "eu-frankfurt-1").strip()
    key = os.environ.get("OCI_BOOTSTRAP_STATE_KEY", DEFAULT_STATE_KEY).strip()
    if not bucket or not namespace or not region or not key:
        fail("init requiere OCI_TFSTATE_BUCKET/OCI_TFSTATE_NAMESPACE y valores no vacíos de región/key")
    write_backend_files(bucket, namespace, region, key)
    terraform("init", "-reconfigure", f"-backend-config={BACKEND_CONFIG}")
    print("OCI bootstrap backend remoto inicializado")


def self_test() -> None:
    before = {
        "lineage": "lineage-1",
        "serial": 7,
        "outputs": {
            "state_bucket": {"value": "bucket-a"},
            "object_storage_namespace": {"value": "namespace-a"},
            "region": {"value": "eu-frankfurt-1"},
        },
        "resources": [
            {"mode": "managed", "type": "oci_identity_compartment", "name": "infra", "instances": [{}]},
            {"mode": "managed", "type": "oci_objectstorage_bucket", "name": "terraform_state", "instances": [{}]},
        ],
    }
    after = json.loads(json.dumps(before))
    after["serial"] = 8
    assert backend_values_from_seed(before) == ("bucket-a", "namespace-a", "eu-frankfurt-1")
    config = render_backend_config("bucket-a", "namespace-a", "eu-frankfurt-1", DEFAULT_STATE_KEY)
    for marker in ("bucket-a", "namespace-a", "eu-frankfurt-1", DEFAULT_STATE_KEY):
        assert marker in config
    for forbidden in ("private_key", "fingerprint", "user_ocid", "tenancy_ocid"):
        assert forbidden not in config
    verify_migration(before, after)
    assert bucket_not_ready("Error Code: BucketNotFound. Http Status Code: 404")
    assert not bucket_not_ready("401 NotAuthenticated")

    wrong_lineage = json.loads(json.dumps(after))
    wrong_lineage["lineage"] = "other"
    try:
        verify_migration(before, wrong_lineage)
    except ValueError:
        pass
    else:
        raise AssertionError("lineage distinto debe rechazarse")

    missing_resource = json.loads(json.dumps(after))
    missing_resource["resources"] = missing_resource["resources"][:1]
    try:
        verify_migration(before, missing_resource)
    except ValueError:
        pass
    else:
        raise AssertionError("pérdida de recursos durante migración debe rechazarse")

    with tempfile.TemporaryDirectory() as temp:
        path = Path(temp) / "state.json"
        path.write_text(json.dumps(before), encoding="utf-8")
        assert load_state(path)["serial"] == 7
    print("oci bootstrap state migration self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", choices=("migrate", "init"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.command == "migrate":
        migrate()
        return 0
    if args.command == "init":
        init_remote()
        return 0
    parser.error("indica migrate, init o --self-test")
    return 2


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, subprocess.CalledProcessError, OSError) as exc:
        print(f"OCI bootstrap state: FAIL · {exc}", file=sys.stderr)
        raise SystemExit(1)
