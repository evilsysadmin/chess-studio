#!/usr/bin/env python3
"""Recover OCI bootstrap resources into a fresh local Terraform seed state."""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STACK = ROOT / "infra" / "oci" / "bootstrap"
EXPECTED = {
    "oci_identity_compartment.infra",
    "oci_identity_compartment.staging",
    "oci_objectstorage_bucket.terraform_state",
}


def terraform(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["terraform", f"-chdir={STACK}", *args],
        check=check,
        text=True,
        capture_output=True,
        env={**os.environ, "TF_IN_AUTOMATION": "true", "TF_INPUT": "false"},
    )


def planned_output(payload: dict, name: str) -> str:
    value = payload.get("planned_values", {}).get("outputs", {}).get(name, {}).get("value", "")
    return value.strip() if isinstance(value, str) else ""


def state_addresses() -> set[str]:
    result = terraform("state", "list", check=False)
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def import_resource(address: str, resource_id: str) -> None:
    if not resource_id or address in state_addresses():
        return
    result = terraform("import", "-no-color", address, resource_id, check=False)
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()[-2000:]
        raise RuntimeError(f"failed to import {address}: {detail}")
    print(f"Recovered existing OCI resource into seed state: {address}")


def bucket_missing(text: str) -> bool:
    lowered = text.lower()
    return "bucketnotfound" in lowered or "status code: 404" in lowered or "http status code: 404" in lowered


def import_bucket(namespace: str, bucket: str, retry: bool) -> bool:
    address = "oci_objectstorage_bucket.terraform_state"
    if address in state_addresses():
        return True
    resource_id = f"n/{namespace}/b/{bucket}"
    attempts = 5 if retry else 1
    for attempt in range(1, attempts + 1):
        result = terraform("import", "-no-color", address, resource_id, check=False)
        if result.returncode == 0:
            print(f"Recovered existing OCI resource into seed state: {address}")
            return True
        detail = f"{result.stdout}\n{result.stderr}"
        if not bucket_missing(detail):
            raise RuntimeError(f"failed to import {address}: {detail.strip()[-2000:]}")
        if attempt < attempts:
            time.sleep(min(2 * attempt, 6))
    print("No existing tfstate bucket found; bootstrap will create it")
    return False


def discover() -> tuple[str, str, str]:
    with tempfile.TemporaryDirectory() as temp:
        plan = Path(temp) / "recovery.tfplan"
        result = terraform("plan", "-no-color", f"-out={plan}", check=False)
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[-3000:]
            raise RuntimeError(f"bootstrap discovery plan failed: {detail}")
        shown = terraform("show", "-json", str(plan))
        payload = json.loads(shown.stdout)
    return (
        planned_output(payload, "existing_infra_compartment_ocid"),
        planned_output(payload, "existing_staging_compartment_ocid"),
        planned_output(payload, "object_storage_namespace"),
    )


def recover() -> None:
    infra_id, staging_id, namespace = discover()
    bucket = os.environ.get("TF_VAR_state_bucket_name", "chess-studio-tfstate").strip()
    if not namespace:
        raise RuntimeError("Object Storage namespace was not resolved during bootstrap recovery")
    import_resource("oci_identity_compartment.infra", infra_id)
    import_resource("oci_identity_compartment.staging", staging_id)
    # If an infra compartment already exists, a previous bootstrap may have reached bucket creation.
    import_bucket(namespace, bucket, retry=bool(infra_id))
    recovered = state_addresses() & EXPECTED
    if recovered:
        print("OCI bootstrap recovery imported: " + ", ".join(sorted(recovered)))
    else:
        print("OCI bootstrap recovery: fresh foundation; nothing to import")


def self_test() -> None:
    payload = {
        "planned_values": {
            "outputs": {
                "existing_infra_compartment_ocid": {"value": "ocid1.compartment.oc1..infra"},
                "empty": {"value": ""},
            }
        }
    }
    assert planned_output(payload, "existing_infra_compartment_ocid").startswith("ocid1.compartment.")
    assert planned_output(payload, "empty") == ""
    assert planned_output(payload, "missing") == ""
    assert bucket_missing("Error Code: BucketNotFound. Http Status Code: 404")
    assert not bucket_missing("401 NotAuthenticated")
    print("OCI bootstrap recovery self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    recover()
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (json.JSONDecodeError, OSError, RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"OCI bootstrap recovery: FAIL · {exc}", file=sys.stderr)
        raise SystemExit(1)
