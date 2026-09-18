#!/usr/bin/env python3
"""Publish the generated War Room v2 shell to the staging-only R2 alias."""
from __future__ import annotations

import argparse
import hashlib
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "scripts"))

import r2_asset_publish as transport  # noqa: E402
import r2_asset_publisher as core  # noqa: E402

CANONICAL_PREFIX = "war-room/v2/runtime"
STAGING_ALIAS = "war-room/v2/staging/current.glb"
STAGING_REVISION_PREFIX = "war-room/v2/staging/revisions"
CONTENT_TYPE = "model/gltf-binary"


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

    # The immutable PR key is published last. Visual CI points directly at
    # this object, so it can never validate a stale current.glb alias.
    revision_key = f"{STAGING_REVISION_PREFIX}/{revision}.glb"
    transport.raw_upload_object(
        token,
        account_id,
        config["bucket"],
        revision_key,
        data,
        CONTENT_TYPE,
    )
    received_revision = core.get_object(token, account_id, config["bucket"], revision_key)
    if sha256_bytes(received_revision) != digest:
        raise SystemExit("War Room v2 revision GLB corrupto tras publicar")

    print(
        f"War Room v2 R2 OK · revision={revision} · sha256={digest} · "
        f"canonical={canonical_key} · staging={STAGING_ALIAS} · revision_key={revision_key}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
