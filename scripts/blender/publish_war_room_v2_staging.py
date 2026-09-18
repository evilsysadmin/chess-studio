#!/usr/bin/env python3
"""Publish the generated War Room v2 shell to the staging-only R2 alias."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import r2_asset_publish as transport  # noqa: E402
import r2_asset_publisher as core  # noqa: E402

CANONICAL_PREFIX = "war-room/v2/runtime"
STAGING_ALIAS = "war-room/v2/staging/current.glb"
STAGING_REVISION_ALIAS = "war-room/v2/staging/current.json"
CONTENT_TYPE = "model/gltf-binary"
REVISION_CONTENT_TYPE = "application/json"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--revision", required=True)
    args = parser.parse_args()

    source = args.source.resolve()
    if not source.is_file() or source.stat().st_size <= 60_000:
        raise SystemExit(f"War Room v2 GLB inválido: {source}")

    revision = str(args.revision or "").strip()
    if len(revision) < 7:
        raise SystemExit("War Room v2 revision inválida")

    data = source.read_bytes()
    digest = sha256_bytes(data)
    config = core.load_config(core.DEFAULT_CONFIG)
    token, account_id = core.require_env()
    canonical_key = core.object_key_for(source, CANONICAL_PREFIX, digest)

    for key in (canonical_key, STAGING_ALIAS):
        transport.raw_upload_object(
            token,
            account_id,
            config["bucket"],
            key,
            data,
            CONTENT_TYPE,
        )

    received = core.get_object(token, account_id, config["bucket"], STAGING_ALIAS)
    if sha256_bytes(received) != digest:
        raise SystemExit("War Room v2 staging alias corrupto tras publicar")

    # Publish the marker last: seeing this revision guarantees current.glb
    # already contains the matching bytes.
    marker = json.dumps(
        {
            "schema": 1,
            "revision": revision,
            "sha256": digest,
            "canonical": canonical_key,
        },
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    transport.raw_upload_object(
        token,
        account_id,
        config["bucket"],
        STAGING_REVISION_ALIAS,
        marker,
        REVISION_CONTENT_TYPE,
    )
    received_marker = core.get_object(token, account_id, config["bucket"], STAGING_REVISION_ALIAS)
    if received_marker != marker:
        raise SystemExit("War Room v2 revision marker corrupto tras publicar")

    print(
        f"War Room v2 R2 OK · revision={revision} · sha256={digest} · "
        f"canonical={canonical_key} · staging={STAGING_ALIAS}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
