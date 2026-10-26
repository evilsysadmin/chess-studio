#!/usr/bin/env python3
"""One-time immutable R2 goblin publication without new secrets.

Copies only the exact approved WebP into a SHA-addressed key, preserving the
mutable original. Does not update game manifests; verifies all bytes and R2
HTTP metadata before declaring a publish. Existing destination is read-only.
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.error
import urllib.request
from typing import Any

import r2_asset_publisher as core
from r2_asset_gc import list_objects
from cloudflare_r2_assets import require_env

BUCKET = "chronicles"
SOURCE = "sprites/ash-goblin.webp"
DIGEST = "96ed70aafe94827f3663228896af612055c9abf12b441a78f7bb4c1fa3b17656"
DESTINATION = "sprites/ash-goblin-" + DIGEST[:16] + ".webp"
SIZE = 122882
CACHE = "public, max-age=31536000, immutable"


def validate_inventory(rows: Any, source_bytes: bytes) -> bool:
    if not isinstance(rows, list):
        raise ValueError("Malformed R2 inventory")
    found: dict[str, dict] = {}
    for item in rows:
        if not isinstance(item, dict) or not isinstance(item.get("key"), str):
            raise ValueError("Malformed R2 object")
        name = item["key"]
        if name in found:
            raise ValueError("Duplicate R2 key")
        found[name] = item
    if set(found) - {SOURCE, DESTINATION, "sprites/"}:
        raise ValueError("Unexpected object in Chronicles R2 bucket")
    if "sprites/" in found and found["sprites/"].get("size") != 0:
        raise ValueError("Folder marker is not empty")
    if found.get(SOURCE, {}).get("size") != SIZE:
        raise ValueError("Approved source is absent or has wrong size")
    if not isinstance(source_bytes, bytes) or len(source_bytes) != SIZE:
        raise ValueError("Approved source readback size mismatch")
    if hashlib.sha256(source_bytes).hexdigest() != DIGEST:
        raise ValueError("Approved source hash mismatch")
    if source_bytes[:4] != b"RIFF" or source_bytes[8:12] != b"WEBP":
        raise ValueError("Invalid WebP signature")
    if DESTINATION in found and found[DESTINATION].get("size") != SIZE:
        raise ValueError("Immutable destination is unexpected size")
    return DESTINATION in found


def validate_metadata(rows: Any) -> None:
    dest = next((item for item in rows if isinstance(item, dict)
                 and item.get("key") == DESTINATION), None)
    if not dest or dest.get("size") != SIZE:
        raise ValueError("Immutable target missing after PUT")
    meta = dest.get("http_metadata")
    if not isinstance(meta, dict):
        raise ValueError("Immutable target HTTP metadata missing")
    if meta.get("cacheControl") != CACHE or meta.get("contentType") != "image/webp":
        raise ValueError("R2 did not retain exact immutable Cache-Control and Content-Type")


def put_new_object(token: str, account: str, data: bytes) -> None:
    request = urllib.request.Request(
        core.API_BASE + core.object_path(account, BUCKET, DESTINATION),
        data=data,
        method="PUT",
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "image/webp",
            "Cache-Control": CACHE,
            "cf-r2-storage-class": "Standard",
            "User-Agent": "chronicles-r2-immutable-publisher/1",
        },
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.loads(response.read())
    if not isinstance(result, dict) or result.get("success") is not True:
        raise RuntimeError("R2 rejected immutable object upload")


def main() -> int:
    try:
        token, account = require_env()
        source = core.get_object(token, account, BUCKET, SOURCE)
        exists = validate_inventory(list_objects(token, account, BUCKET), source)
        if not exists:
            put_new_object(token, account, source)
        # Never overwrite an existing hash-addressed object. Validate bytes.
        copied = core.get_object(token, account, BUCKET, DESTINATION)
        if hashlib.sha256(copied).hexdigest() != DIGEST or len(copied) != SIZE:
            raise ValueError("Immutable readback has wrong bytes")
        validate_metadata(list_objects(token, account, BUCKET))
    except Exception as exc:
        print("CHRONICLES_R2_IMMUTABLE_BLOCKED " + type(exc).__name__, file=sys.stderr)
        return 1
    print("CHRONICLES_R2_IMMUTABLE_OBJECT_VERIFIED " + DESTINATION)
    print("CHRONICLES_R2_IMMUTABLE_METADATA_VERIFIED")
    print("CHRONICLES_R2_IMMUTABLE_PUBLIC_HTTPS_PENDING_VERIFICATION")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
