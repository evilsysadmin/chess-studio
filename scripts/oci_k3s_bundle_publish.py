#!/usr/bin/env python3
"""Reconcile the pinned K3s ARM64 bootstrap bundle into private OCI Object Storage.

The publisher is deliberately boring:
- reuses the existing non-versioned staging runtime bucket;
- owns exactly two stable object names under k3s/bootstrap/;
- checks a tiny contract manifest before downloading/building anything;
- overwrites in place, so storage cannot grow per release;
- refuses to exceed a 350 MiB prefix budget, far below the OCI free allowance.

It does not install or start K3s on the A1. That remains a separate migration gate.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import tempfile
from pathlib import Path
from typing import Any

from oci_k3s_bundle import (
    INSTALLER_PATH,
    build,
    load_config,
    manifest_for,
    sha256_file,
)

DEFAULT_BUCKET = "chess-studio-staging-runtime"
PREFIX = "k3s/bootstrap/"
BUNDLE_OBJECT = PREFIX + "k3s-airgap-arm64.tar.gz"
MANIFEST_OBJECT = PREFIX + "manifest.json"
OWNED_OBJECTS = {BUNDLE_OBJECT, MANIFEST_OBJECT}
MAX_BUNDLE_BYTES = 300 * 1024 * 1024
MAX_PREFIX_BYTES = 350 * 1024 * 1024
OCI_SDK_VERSION = "2.185.2"
OCI_COMPARTMENT_NAME = "chess-studio-staging"
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")


def canonical_json(payload: object) -> bytes:
    return (json.dumps(payload, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")


def contract_payload() -> dict[str, object]:
    values = load_config()
    installer = INSTALLER_PATH.read_bytes()
    source_manifest = manifest_for(values, installer)
    contract = {
        "schema": 1,
        "architecture": "arm64",
        "k3s_version": values["K3S_VERSION"],
        "components": source_manifest["components"],
    }
    contract["contract_id"] = hashlib.sha256(canonical_json(contract)).hexdigest()
    return contract


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def oci_config(oci: Any) -> dict[str, str]:
    config = {
        "tenancy": required_env("OCI_TENANCY_OCID"),
        "user": required_env("OCI_USER_OCID"),
        "fingerprint": required_env("OCI_FINGERPRINT"),
        "key_content": required_env("OCI_PRIVATE_KEY").replace("\r", ""),
        "region": required_env("OCI_REGION"),
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


def assert_bucket_contract(client: Any, namespace: str, compartment_id: str, bucket_name: str) -> None:
    bucket = client.get_bucket(namespace, bucket_name).data
    if str(getattr(bucket, "compartment_id", "")) != compartment_id:
        raise SystemExit("K3s bundle bucket is not owned by the staging compartment")
    if str(getattr(bucket, "public_access_type", "")) != "NoPublicAccess":
        raise SystemExit("K3s bundle bucket must remain NoPublicAccess")
    if str(getattr(bucket, "versioning", "")) != "Disabled":
        raise SystemExit("K3s bundle bucket must remain non-versioned to prevent hidden storage growth")
    tier = str(getattr(bucket, "storage_tier", "Standard"))
    if tier and tier != "Standard":
        raise SystemExit(f"K3s bundle bucket storage tier drifted: {tier}")


def decode_manifest(data: bytes) -> dict[str, object] | None:
    try:
        payload = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(payload, dict):
        return None
    return payload


def read_remote_manifest(oci: Any, client: Any, namespace: str, bucket_name: str) -> dict[str, object] | None:
    try:
        response = client.get_object(namespace, bucket_name, MANIFEST_OBJECT)
    except oci.exceptions.ServiceError as exc:
        if getattr(exc, "status", None) == 404:
            return None
        raise
    data = response.data.content
    if not isinstance(data, (bytes, bytearray)):
        data = response.data.raw.read()
    if len(data) > 64 * 1024:
        raise SystemExit("Remote K3s manifest is unexpectedly large")
    return decode_manifest(bytes(data))


def list_owned_prefix(client: Any, namespace: str, bucket_name: str) -> list[tuple[str, int]]:
    objects: list[tuple[str, int]] = []
    start: str | None = None
    while True:
        kwargs: dict[str, object] = {"prefix": PREFIX, "fields": "name,size"}
        if start:
            kwargs["start"] = start
        response = client.list_objects(namespace, bucket_name, **kwargs)
        for row in getattr(response.data, "objects", []) or []:
            name = str(getattr(row, "name", ""))
            size = int(getattr(row, "size", 0) or 0)
            objects.append((name, size))
        next_start = str(getattr(response.data, "next_start_with", "") or "")
        if not next_start:
            break
        if next_start == start:
            raise SystemExit("OCI Object Storage pagination did not advance")
        start = next_start
    return objects


def assert_prefix_contract(objects: list[tuple[str, int]], *, projected_bundle_size: int | None = None, projected_manifest_size: int | None = None) -> None:
    names = {name for name, _ in objects}
    unexpected = sorted(names - OWNED_OBJECTS)
    if unexpected:
        raise SystemExit("Unexpected objects under reserved K3s prefix: " + ", ".join(unexpected))
    if len(objects) != len(names):
        raise SystemExit("Duplicate K3s object names returned by Object Storage")

    size_map = dict(objects)
    if projected_bundle_size is not None:
        size_map[BUNDLE_OBJECT] = projected_bundle_size
    if projected_manifest_size is not None:
        size_map[MANIFEST_OBJECT] = projected_manifest_size
    total = sum(size_map.values())
    if total > MAX_PREFIX_BYTES:
        raise SystemExit(
            f"K3s Object Storage prefix budget exceeded: projected {total} > {MAX_PREFIX_BYTES} bytes"
        )


def remote_is_current(client: Any, namespace: str, bucket_name: str, expected: dict[str, object], remote: dict[str, object] | None) -> bool:
    if remote is None or remote.get("contract_id") != expected["contract_id"]:
        return False
    try:
        expected_size = int(remote["bundle_size"])
        expected_sha = str(remote["bundle_sha256"])
    except (KeyError, TypeError, ValueError):
        return False
    if expected_size <= 0 or expected_size > MAX_BUNDLE_BYTES or not SHA256_RE.fullmatch(expected_sha):
        return False
    try:
        head = client.head_object(namespace, bucket_name, BUNDLE_OBJECT)
    except Exception as exc:
        if getattr(exc, "status", None) == 404:
            return False
        raise
    observed_size = int(head.headers.get("content-length", "-1"))
    observed_sha = str(head.headers.get("opc-meta-sha256", ""))
    observed_contract = str(head.headers.get("opc-meta-contract-id", ""))
    return (
        observed_size == expected_size
        and observed_sha == expected_sha
        and observed_contract == expected["contract_id"]
    )


def final_manifest(contract: dict[str, object], bundle_path: Path) -> dict[str, object]:
    size = bundle_path.stat().st_size
    if size <= 0 or size > MAX_BUNDLE_BYTES:
        raise SystemExit(f"K3s bundle size outside budget: {size} bytes")
    payload = dict(contract)
    payload.update(
        {
            "bundle_object": BUNDLE_OBJECT,
            "bundle_sha256": sha256_file(bundle_path),
            "bundle_size": size,
        }
    )
    return payload


def upload_bundle(client: Any, namespace: str, bucket_name: str, bundle_path: Path, manifest: dict[str, object]) -> None:
    bundle_size = int(manifest["bundle_size"])
    bundle_sha = str(manifest["bundle_sha256"])
    contract_id = str(manifest["contract_id"])
    manifest_bytes = canonical_json(manifest)
    objects = list_owned_prefix(client, namespace, bucket_name)
    assert_prefix_contract(
        objects,
        projected_bundle_size=bundle_size,
        projected_manifest_size=len(manifest_bytes),
    )

    with bundle_path.open("rb") as handle:
        client.put_object(
            namespace,
            bucket_name,
            BUNDLE_OBJECT,
            handle,
            content_length=bundle_size,
            content_type="application/gzip",
            opc_meta={"sha256": bundle_sha, "contract-id": contract_id},
        )

    # Manifest is the commit pointer and is intentionally published last.
    client.put_object(
        namespace,
        bucket_name,
        MANIFEST_OBJECT,
        manifest_bytes,
        content_length=len(manifest_bytes),
        content_type="application/json",
        opc_meta={"contract-id": contract_id},
    )

    head = client.head_object(namespace, bucket_name, BUNDLE_OBJECT)
    if int(head.headers.get("content-length", "-1")) != bundle_size:
        raise SystemExit("Uploaded K3s bundle size verification failed")
    if str(head.headers.get("opc-meta-sha256", "")) != bundle_sha:
        raise SystemExit("Uploaded K3s bundle sha256 metadata verification failed")
    remote_objects = list_owned_prefix(client, namespace, bucket_name)
    assert_prefix_contract(remote_objects)
    print(
        f"OCI K3s bundle published · object={BUNDLE_OBJECT} bytes={bundle_size} "
        f"sha256={bundle_sha} contract={contract_id}"
    )


def reconcile(oci: Any, *, bucket_name: str = DEFAULT_BUCKET) -> None:
    config = oci_config(oci)
    compartment_id = resolve_staging_compartment(oci, config)
    client = oci.object_storage.ObjectStorageClient(config)
    namespace = str(client.get_namespace(compartment_id=config["tenancy"]).data)
    if not namespace:
        raise SystemExit("OCI Object Storage namespace was not resolved")
    assert_bucket_contract(client, namespace, compartment_id, bucket_name)

    contract = contract_payload()
    objects = list_owned_prefix(client, namespace, bucket_name)
    assert_prefix_contract(objects)
    remote = read_remote_manifest(oci, client, namespace, bucket_name)
    if remote_is_current(client, namespace, bucket_name, contract, remote):
        print(
            f"OCI K3s bundle already current · contract={contract['contract_id']} · no download/build"
        )
        return

    with tempfile.TemporaryDirectory(prefix="chess-studio-k3s-publish-") as tmp:
        bundle = build(Path(tmp))
        manifest = final_manifest(contract, bundle)
        upload_bundle(client, namespace, bucket_name, bundle, manifest)


def self_test() -> None:
    contract = contract_payload()
    assert contract["architecture"] == "arm64"
    assert isinstance(contract["contract_id"], str) and SHA256_RE.fullmatch(str(contract["contract_id"]))
    assert set(OWNED_OBJECTS) == {BUNDLE_OBJECT, MANIFEST_OBJECT}

    assert_prefix_contract([])
    assert_prefix_contract([(BUNDLE_OBJECT, 123), (MANIFEST_OBJECT, 456)])
    try:
        assert_prefix_contract([(PREFIX + "old.tar.gz", 1)])
    except SystemExit:
        pass
    else:
        raise AssertionError("unexpected K3s prefix objects must fail closed")

    try:
        assert_prefix_contract([], projected_bundle_size=MAX_PREFIX_BYTES, projected_manifest_size=1)
    except SystemExit:
        pass
    else:
        raise AssertionError("K3s prefix over budget must fail closed")

    assert decode_manifest(canonical_json({"schema": 1})) == {"schema": 1}
    assert decode_manifest(b"not-json") is None
    print("OCI K3s bundle publisher self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("reconcile", "self-test"), nargs="?", default="self-test")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return

    try:
        import oci
    except ImportError as exc:
        raise SystemExit(
            f"OCI Python SDK is required for reconcile; expected {OCI_SDK_VERSION}"
        ) from exc
    reconcile(oci, bucket_name=args.bucket)


if __name__ == "__main__":
    main()
