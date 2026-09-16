#!/usr/bin/env python3
"""CLI entrypoint for R2 asset publishing using raw object PUTs.

Cloudflare's object REST endpoint accepts the object bytes as the request body.
The generated multipart example currently returns API error 10028 in production,
so keep the raw transport isolated here while reusing the publisher core.
"""
from __future__ import annotations

import urllib.error
import urllib.request

import r2_asset_publisher as core


def raw_upload_object(
    token: str,
    account_id: str,
    bucket: str,
    key: str,
    data: bytes,
    content_type: str,
) -> dict:
    if len(data) > core.REST_UPLOAD_LIMIT:
        raise core.PublishError("Asset >300 MB: requiere S3/multipart")

    request = urllib.request.Request(
        core.API_BASE + core.object_path(account_id, bucket, key),
        data=data,
        method="PUT",
        headers={
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
            "Content-Type": content_type,
            "cf-r2-storage-class": "Standard",
            "User-Agent": "chess-studio-r2-publisher/2",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            payload = core.decode_json(response.read())
    except urllib.error.HTTPError as exc:
        raise core.PublishError(
            f"Cloudflare raw upload HTTP {exc.code}: {core.decode_json(exc.read())}"
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise core.PublishError(f"Cloudflare raw upload no accesible: {exc}") from exc

    if not isinstance(payload, dict) or payload.get("success") is False:
        raise core.PublishError(f"Cloudflare rechazó el raw upload: {payload!r}")
    result = payload.get("result")
    return result if isinstance(result, dict) else {}


# Patch only the transport. Hashing, manifest handling, validation and smoke
# lifecycle remain owned by r2_asset_publisher.py.
core.upload_object = raw_upload_object


if __name__ == "__main__":
    raise SystemExit(core.main())
