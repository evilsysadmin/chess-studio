#!/usr/bin/env python3
"""Immutable, review-only CC0 3D source intake for CHESSCOM experiments.

This imports a Quaternius SWAT *technical* reference, not canonical Sven.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import struct
from pathlib import Path

SOURCE = {
    "identity": "quaternius-swat-cc0-technical-source-v52",
    "author": "Quaternius",
    "pack": "Ultimate Modular Men Pack",
    "license": "CC0-1.0",
    "license_evidence": "https://quaternius.com/packs/ultimatemodularcharacters.html",
    "mirror_repository": "euuuuuuan/fatal-funnel-public",
    "mirror_commit": "29a6bdfd01ad175c389cbd0bac80c30f926ff96b",
    "mirror_path": "packages/renderer/assets/models/quaternius-men/swat.glb",
    "git_blob_sha1": "280b2776eee2af7e131db22dd7a32b1e99764a12",
    "expected_bytes": 1560900,
}


def git_blob_hash(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def verify_source_bytes(data: bytes, expected_size=SOURCE["expected_bytes"],
                        expected_blob=SOURCE["git_blob_sha1"]) -> str:
    if len(data) != expected_size:
        raise ValueError("pinned-source-size-mismatch")
    if git_blob_hash(data) != expected_blob:
        raise ValueError("pinned-source-git-blob-mismatch")
    return hashlib.sha256(data).hexdigest()


def glb_summary(data: bytes) -> dict:
    if len(data) < 20:
        raise ValueError("invalid-glb-header")
    magic, version, length = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("invalid-glb-header")
    size, tag = struct.unpack_from("<I4s", data, 12)
    if tag != b"JSON" or size < 2 or size + 20 > len(data):
        raise ValueError("invalid-glb-json")
    doc = json.loads(data[20:20 + size].decode("utf-8"))
    if doc.get("asset", {}).get("version") != "2.0":
        raise ValueError("invalid-gltf-version")
    meshes, skins = doc.get("meshes", []), doc.get("skins", [])
    if not isinstance(meshes, list) or not meshes:
        raise ValueError("no-meshes")
    if not isinstance(skins, list):
        raise ValueError("invalid-skins")
    animations = doc.get("animations", [])
    if not isinstance(animations, list):
        raise ValueError("invalid-animations")
    return {
        "meshes": len(meshes), "skins": len(skins),
        "animation_names": [a.get("name", "") for a in animations],
        "animation_count": len(animations), "skinned": bool(skins),
    }


def intake(path: Path, output: Path) -> dict:
    data = path.read_bytes()
    sha = verify_source_bytes(data)
    geometry = glb_summary(data)
    receipt = {
        "schema": 1, "source": SOURCE, "sha256": sha,
        "geometry": geometry,
        "review_only": True, "promotion_allowed": False,
        "visual_approval": False, "is_canonical_sven": False,
        "limitations": [
            "Technical CC0 source model, NOT the Sven V41/V48 design",
            "No inferred weapon/hand contact, retargeted clips or validated combat rig",
            "Cannot be deployed without an authored Sven + V40/V47/Babylon gates",
        ],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-glb", type=Path, required=True)
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(intake(args.source_glb, args.receipt), indent=2))


if __name__ == "__main__":
    main()
