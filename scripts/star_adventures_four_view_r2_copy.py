#!/usr/bin/env python3
"""Copy one approved Star Adventures atlas between R2 buckets; never delete.

Private source bucket star-adventures has no public domain. The existing game
CDN resolves chess-studio-assets. Only the byte-identical approved hash key
may be published; an existing destination is read-only and must match.
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
import urllib.error
import urllib.request

from cloudflare_r2_assets import require_env
import r2_asset_publisher as core

SOURCE_BUCKET = "star-adventures"
PUBLIC_BUCKET = "chess-studio-assets"
KEY = "star-adventures/tactical/officer-female-walk4-v1-8ee3e84f15310061.webp"
SHA256 = "8ee3e84f15310061831bb668a433c32eacf9b7a5af070cd1ad9fde1f8963a029"
SIZE = 1223506
PUBLIC_URL = "https://assets.chess-studio.shadowops.dpdns.org/" + KEY
CACHE = "public, max-age=31536000, immutable"


def validate_bytes(data: bytes) -> None:
    if not isinstance(data, bytes) or len(data) != SIZE:
        raise ValueError("Exact approved R2 atlas size mismatch")
    if hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError("Exact approved R2 atlas SHA-256 mismatch")
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError("Approved source is not WebP")


def read_destination(token: str, account: str) -> bytes | None:
    # Only 404 is an absent immutable key; authorization errors must fail.
    req = urllib.request.Request(
        core.API_BASE + core.object_path(account, PUBLIC_BUCKET, KEY),
        headers={"Authorization": "Bearer " + token},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def publish_once(token: str, account: str, source: bytes) -> bool:
    validate_bytes(source)
    existing = read_destination(token, account)
    if existing is not None:
        validate_bytes(existing)
        return False  # NEVER overwrite a pre-existing content-hashed key.
    req = urllib.request.Request(
        core.API_BASE + core.object_path(account, PUBLIC_BUCKET, KEY),
        data=source,
        method="PUT",
        headers={
            "Authorization": "Bearer " + token,
            "Accept": "application/json",
            "Content-Type": "image/webp",
            "Cache-Control": CACHE,
            "cf-r2-storage-class": "Standard",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        payload = json.loads(response.read())
    if payload.get("success") is not True:
        raise ValueError("R2 did not confirm immutable copy")
    return True


def verify_public() -> None:
    # CDN may take a few seconds to expose a just-published immutable key.
    for attempt in range(6):
        request = urllib.request.Request(
            PUBLIC_URL,
            headers={"Accept": "image/webp", "Cache-Control": "no-cache"},
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                if response.status != 200:
                    raise ValueError("Public CDN did not return HTTP 200")
                if response.headers.get_content_type() != "image/webp":
                    raise ValueError("Public CDN content type mismatch")
                validate_bytes(response.read())
                print("STAR_ADVENTURES_R2_PUBLIC_SHA256_VERIFIED")
                return
        except urllib.error.HTTPError as exc:
            if exc.code != 404 or attempt == 5:
                raise
        if attempt < 5:
            time.sleep(5)
    raise RuntimeError("R2 CDN object not visible")


def main() -> int:
    try:
        token, account = require_env()
        source = core.get_object(token, account, SOURCE_BUCKET, KEY)
        validate_bytes(source)
        print("STAR_ADVENTURES_PRIVATE_SOURCE_VERIFIED")
        created = publish_once(token, account, source)
        dest = core.get_object(token, account, PUBLIC_BUCKET, KEY)
        validate_bytes(dest)
        print("STAR_ADVENTURES_PUBLIC_BUCKET_COPY_VERIFIED", "NEW" if created else "EXISTING")
        verify_public()
    except Exception as exc:
        print("STAR_ADVENTURES_R2_COPY_BLOCKED " + type(exc).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
