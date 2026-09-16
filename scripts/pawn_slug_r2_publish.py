#!/usr/bin/env python3
"""Publish the current Pawn Slug Matthias asset bank to Cloudflare R2.

The approved 1536x1024 master remains external to Git. Existing runtime WebP
assets that still live in the repository are uploaded as immutable objects and
keep serving as local fallbacks until browser smoke proves the CDN path.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import pathlib
import tempfile

# Importing the raw entrypoint installs the production raw-PUT transport on the
# shared publisher core. Keep this before importing the core below.
import r2_asset_publish as _raw_transport  # noqa: F401
import r2_asset_publisher as publisher

ROOT = pathlib.Path(__file__).resolve().parents[1]
MASTER_SHA256 = "9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f"
ASSET_ROOT = ROOT / "frontend/src/assets/pawnSlug"

RUNTIME_ASSETS = (
    (
        "pawnSlug.matthias.pistol",
        ASSET_ROOT / "matthias_canonical_pistol_v1.webp",
        "pawn-slug/matthias/pistol",
        False,
    ),
    (
        "pawnSlug.matthias.machinegun",
        ASSET_ROOT / "matthias_machinegun_premium_v3.b64",
        "pawn-slug/matthias/machinegun",
        True,
    ),
    (
        "pawnSlug.matthias.shotgun",
        ASSET_ROOT / "matthias_shotgun_premium_v3.b64",
        "pawn-slug/matthias/shotgun",
        True,
    ),
    (
        "pawnSlug.matthias.panzerfaust",
        ASSET_ROOT / "matthias_panzerfaust_premium_v3.b64",
        "pawn-slug/matthias/panzerfaust",
        True,
    ),
    (
        "pawnSlug.matthias.motion",
        ASSET_ROOT / "matthias_motion_atlas_v5_payload.b64",
        "pawn-slug/matthias/motion",
        True,
    ),
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify_master(path: pathlib.Path) -> None:
    if not path.is_file():
        raise publisher.PublishError(f"No existe el master canónico: {path}")
    digest = publisher.sha256_file(path)
    if digest != MASTER_SHA256:
        raise publisher.PublishError(
            "Master Matthias incorrecto: "
            f"esperado {MASTER_SHA256}, recibido {digest}"
        )


def decode_webp_payload(source: pathlib.Path, target: pathlib.Path) -> pathlib.Path:
    try:
        compact = "".join(source.read_text(encoding="ascii").split())
        data = base64.b64decode(compact, validate=True)
    except (OSError, ValueError) as exc:
        raise publisher.PublishError(f"Payload base64 inválido {source}: {exc}") from exc
    if not data.startswith(b"RIFF") or data[8:12] != b"WEBP":
        raise publisher.PublishError(f"{source} no decodifica a WebP RIFF")
    target.write_bytes(data)
    return target


def publish_all(
    master: pathlib.Path,
    manifest: pathlib.Path,
    config: pathlib.Path,
    dry_run: bool,
) -> None:
    verify_master(master)

    # Contract: the untouched approved master is published before any derived
    # runtime pointer can be written to the manifest.
    publisher.publish(
        master,
        "pawnSlug.matthias.canonicalMaster",
        "pawn-slug/matthias/master",
        manifest,
        config,
        dry_run,
    )

    with tempfile.TemporaryDirectory(prefix="pawn-slug-r2-") as tmp:
        temp_root = pathlib.Path(tmp)
        for logical_id, source, prefix, is_base64 in RUNTIME_ASSETS:
            upload_source = source
            if is_base64:
                upload_source = decode_webp_payload(
                    source,
                    temp_root / f"{source.stem}.webp",
                )
            publisher.publish(
                upload_source,
                logical_id,
                prefix,
                manifest,
                config,
                dry_run,
            )


def self_test() -> None:
    sample = b"RIFF" + (4).to_bytes(4, "little") + b"WEBP"
    assert sha256_bytes(sample) == hashlib.sha256(sample).hexdigest()
    assert MASTER_SHA256 == "9c21264274777d012a2941073f6cbae94df090db0459624e6031207c0a288c5f"
    logical_ids = [item[0] for item in RUNTIME_ASSETS]
    assert logical_ids == [
        "pawnSlug.matthias.pistol",
        "pawnSlug.matthias.machinegun",
        "pawnSlug.matthias.shotgun",
        "pawnSlug.matthias.panzerfaust",
        "pawnSlug.matthias.motion",
    ]
    assert len(logical_ids) == len(set(logical_ids))
    print("OK Pawn Slug R2 publishing contract")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    publish = sub.add_parser("publish")
    publish.add_argument("--master", required=True, type=pathlib.Path)
    publish.add_argument("--manifest", type=pathlib.Path, default=publisher.DEFAULT_MANIFEST)
    publish.add_argument("--config", type=pathlib.Path, default=publisher.DEFAULT_CONFIG)
    publish.add_argument("--dry-run", action="store_true")

    sub.add_parser("self-test")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    try:
        if args.command == "publish":
            publish_all(args.master, args.manifest, args.config, args.dry_run)
        else:
            self_test()
        return 0
    except Exception as exc:
        print(f"ERROR: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
