#!/usr/bin/env python3
"""Read a tiny allowlisted subset of the private OCI staging runtime bundle.

This module is intentionally read-only. It lets trusted GitHub Actions jobs consume
only the staging values they already need without making Render an availability
dependency for normal staging releases. Values are returned in memory and are
never printed by this module.
"""
from __future__ import annotations

from typing import Any, Iterable

from oci_runtime_config import (
    ALLOWED_KEYS,
    DEFAULT_BUCKET,
    DEFAULT_OBJECT,
    REQUIRED_KEYS,
    oci_config,
    resolve_staging_compartment,
    validate_storage_name,
)

MAX_RUNTIME_BYTES = 65536
RUNNER_READABLE_KEYS = frozenset({"CHESS_AI_SHARED_SECRET", "INVITE_CODE"})


def _validate_requested_keys(keys: Iterable[str]) -> tuple[str, ...]:
    requested = tuple(dict.fromkeys(str(key).strip() for key in keys))
    if not requested or any(not key for key in requested):
        raise SystemExit("At least one OCI runtime key must be requested")
    forbidden = set(requested) - RUNNER_READABLE_KEYS
    if forbidden:
        raise SystemExit(
            "Refusing OCI runtime keys outside the runner allowlist: "
            + ", ".join(sorted(forbidden))
        )
    return requested


def parse_runtime_env(payload: bytes) -> dict[str, str]:
    if not payload or len(payload) > MAX_RUNTIME_BYTES:
        raise SystemExit("Invalid OCI runtime object size")
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit("OCI runtime object is not valid UTF-8") from exc
    if "\x00" in text or "\r" in text:
        raise SystemExit("OCI runtime object contains forbidden control characters")

    allowed = set(ALLOWED_KEYS)
    required = set(REQUIRED_KEYS)
    values: dict[str, str] = {}
    for line in text.splitlines():
        if not line or "=" not in line:
            raise SystemExit("OCI runtime object contains malformed line")
        key, value = line.split("=", 1)
        if key not in allowed or key in values:
            raise SystemExit("OCI runtime object contains unexpected or duplicate key")
        if key in required and not value:
            raise SystemExit("OCI runtime object contains empty required value")
        if "\x00" in value or "\r" in value or "\n" in value:
            raise SystemExit("OCI runtime object contains forbidden value characters")
        values[key] = value

    missing = required - set(values)
    if missing:
        raise SystemExit("OCI runtime object is missing required keys")
    return values


def _response_payload(response: Any) -> bytes:
    try:
        expected = int(response.headers.get("content-length", "0"))
    except (TypeError, ValueError, AttributeError) as exc:
        raise SystemExit("OCI runtime object has invalid content length") from exc
    if expected <= 0 or expected > MAX_RUNTIME_BYTES:
        raise SystemExit("Invalid OCI runtime object size")

    data = response.data
    content = getattr(data, "content", None)
    if isinstance(content, bytes):
        payload = content
    else:
        raw = getattr(data, "raw", None)
        if raw is None or not hasattr(raw, "read"):
            raise SystemExit("OCI runtime object response is unreadable")
        payload = raw.read(MAX_RUNTIME_BYTES + 1)
    if not isinstance(payload, bytes):
        raise SystemExit("OCI runtime object response is not bytes")
    if len(payload) != expected:
        raise SystemExit("OCI runtime object size verification failed")
    return payload


def read_private_runtime_values(
    oci: Any,
    keys: Iterable[str],
    *,
    bucket_name: str = DEFAULT_BUCKET,
    object_name: str = DEFAULT_OBJECT,
) -> dict[str, str]:
    requested = _validate_requested_keys(keys)
    bucket_name = validate_storage_name("bucket", bucket_name)
    object_name = validate_storage_name("object", object_name)

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
        raise SystemExit("Runtime bucket versioning must remain Disabled")

    response = client.get_object(namespace, bucket_name, object_name)
    values = parse_runtime_env(_response_payload(response))
    return {key: values[key] for key in requested}


def read_private_runtime_value(
    oci: Any,
    key: str,
    *,
    bucket_name: str = DEFAULT_BUCKET,
    object_name: str = DEFAULT_OBJECT,
) -> str:
    return read_private_runtime_values(
        oci,
        (key,),
        bucket_name=bucket_name,
        object_name=object_name,
    )[key]


def self_test() -> None:
    sample = {key: f"value-{index}" for index, key in enumerate(REQUIRED_KEYS, start=1)}
    payload = "".join(f"{key}={sample[key]}\n" for key in REQUIRED_KEYS).encode("utf-8")
    parsed = parse_runtime_env(payload)
    assert parsed["INVITE_CODE"] == sample["INVITE_CODE"]
    assert parsed["CHESS_AI_SHARED_SECRET"] == sample["CHESS_AI_SHARED_SECRET"]
    assert _validate_requested_keys(["INVITE_CODE", "INVITE_CODE"]) == ("INVITE_CODE",)

    for forbidden in ("JWT_SECRET", "MONGO_URL", "OCI_PRIVATE_KEY", "RENDER_API_KEY"):
        try:
            _validate_requested_keys([forbidden])
        except SystemExit:
            pass
        else:
            raise AssertionError(f"runner reader must reject {forbidden}")

    malformed_cases = (
        b"",
        payload + b"SURPRISE_SECRET=nope\n",
        payload + b"INVITE_CODE=duplicate\n",
        payload.replace(b"JWT_SECRET=value-3\n", b"", 1),
        payload.replace(b"JWT_SECRET=value-3\n", b"JWT_SECRET=\n", 1),
        payload.replace(b"MONGO_URL=value-1\n", b"MONGO_URL=value-1\r\n", 1),
    )
    for malformed in malformed_cases:
        try:
            parse_runtime_env(malformed)
        except SystemExit:
            pass
        else:
            raise AssertionError("malformed OCI runtime bundle must be rejected")

    print("OCI private runtime bundle reader self-test: OK")


if __name__ == "__main__":
    self_test()
