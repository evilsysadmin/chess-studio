#!/usr/bin/env python3
"""One-time guarded publication of an approved static Chronicles goblin.

The currently private bucket is allowed to become public only when its object
inventory is EXACTLY the approved asset, optionally with an empty folder marker.
Before publishing, re-download the full WebP and verify its SHA-256. No other
bucket may be changed by this script; never delete or overwrite R2 objects.
"""
from __future__ import annotations

import hashlib
import sys
from typing import Any

BUCKET = "chronicles"
OBJECT_KEY = "sprites/ash-goblin.webp"
OBJECT_BYTES = 122882
OBJECT_SHA256 = "96ed70aafe94827f3663228896af612055c9abf12b441a78f7bb4c1fa3b17656"
DOMAIN = "assets.chronicles.shadowops.dpdns.org"
ZONE = "shadowops.dpdns.org"
STAGING = "https://staging.chronicles.shadowops.dpdns.org"
PRODUCTION = "https://chronicles.shadowops.dpdns.org"


def check_inventory(rows: Any, body: bytes) -> None:
    if not isinstance(rows, list) or not rows:
        raise ValueError("R2 inventory missing")
    observed = {}
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Malformed R2 object")
        key, size = row.get("key"), row.get("size")
        if not isinstance(key, str) or not isinstance(size, int) or size < 0 or key in observed:
            raise ValueError("Malformed or duplicate R2 object key/size")
        observed[key] = size
    # Cloudflare's folder UI can create a zero-byte marker. Nothing else may
    # become accessible to the Internet in this initial publication.
    allowed = ({OBJECT_KEY: OBJECT_BYTES}, {OBJECT_KEY: OBJECT_BYTES, "sprites/": 0})
    if observed not in allowed:
        raise ValueError("Chronicles bucket contains an unexpected object: refuse public exposure")
    if not isinstance(body, bytes) or len(body) != OBJECT_BYTES:
        raise ValueError("Approved WebP size mismatch")
    if hashlib.sha256(body).hexdigest() != OBJECT_SHA256:
        raise ValueError("Approved WebP digest mismatch")
    if body[:4] != b"RIFF" or body[8:12] != b"WEBP":
        raise ValueError("Approved object is not a WebP")
    # The approved atlas has six 256x256 poses (1536x256), tested in Chronicles.
    # Only asset content proven identical to the reviewed local version is admitted.


def config() -> dict[str, Any]:
    return {
        "bucket": BUCKET,
        "customDomain": DOMAIN,
        "minTls": "1.2",
        "cors": {
            "origins": [STAGING, PRODUCTION],
            "methods": ["GET", "HEAD"],
            "exposeHeaders": ["ETag", "Content-Length", "Content-Type", "Cache-Control"],
            "maxAgeSeconds": 86400,
        },
    }


def main() -> int:
    from cloudflare_r2_assets import (
        custom_domains, ensure_cors, ensure_custom_domain, require_env, resolve_zone_id,
    )
    from r2_asset_gc import list_objects
    from r2_asset_publisher import get_object

    try:
        token, account = require_env()
        # Guard both public content and the existing domain inventory BEFORE
        # any Cloudflare mutation. Never replace another bucket's domain.
        check_inventory(list_objects(token, account, BUCKET),
                        get_object(token, account, BUCKET, OBJECT_KEY))
        domains = custom_domains(token, account, BUCKET)
        if any(not isinstance(row, dict) or row.get("domain") != DOMAIN for row in domains):
            raise ValueError("Unexpected custom domain already attached to Chronicles bucket")
        zone_id = resolve_zone_id(token, account, ZONE)
        wanted = config()
        # CORS first, then public domain; no long-lived browser TTL on the
        # unhashed asset. Cloudflare manages the domain's DNS and certificate.
        ensure_cors(token, account, wanted)
        ensure_custom_domain(token, account, zone_id, wanted)
    except Exception as exc:
        print("CHRONICLES_R2_PUBLICATION_BLOCKED " + type(exc).__name__, file=sys.stderr)
        return 1

    print("CHRONICLES_R2_DOMAIN_ATTACH_REQUESTED https://" + DOMAIN)
    print("CHRONICLES_R2_PUBLICATION_BYTES_SHA256_OK " + OBJECT_SHA256)
    print("CHRONICLES_R2_PUBLICATION_PENDING_HTTPS_READBACK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
