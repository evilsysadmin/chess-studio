#!/usr/bin/env python3
"""Fail-closed V3/V4 immutable GLB contract for CDN caching and public probes.

The browser's reviewed R2 manifest is the only runtime authority. The
historical freeze tool still refers to its original source snapshots; do not
silently rewrite those archival hashes when the live V4 art is upgraded.
"""
from __future__ import annotations

import copy
import json
from pathlib import Path
import re

from r2_war_room_live_freeze import Room

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "frontend/src/assets/r2-assets-manifest.json"
ASSET_HOST = "assets.chess-studio.shadowops.dpdns.org"
VARIANTS = ("v3", "v4")


def parse_manifest(document: object) -> tuple[Room, Room]:
    if not isinstance(document, dict) or not isinstance(document.get("assets"), dict):
        raise ValueError("Missing R2 runtime assets manifest")
    if document.get("baseUrl") != f"https://{ASSET_HOST}":
        raise ValueError("Unexpected R2 asset origin")
    rooms = []
    for variant in VARIANTS:
        entry = document["assets"].get(f"warRoom.{variant}.runtime")
        if not isinstance(entry, dict):
            raise ValueError(f"Missing {variant} runtime entry")
        sha = entry.get("sha256")
        size = entry.get("bytes")
        if not isinstance(sha, str) or re.fullmatch(r"[0-9a-f]{64}", sha) is None:
            raise ValueError(f"{variant}: invalid content digest")
        if type(size) is not int or not (60_000 < size < 50_000_000):
            raise ValueError(f"{variant}: unexpected binary size")
        key = f"war-room/{variant}/runtime/war-room-{variant}-shell-{sha[:16]}.glb"
        if entry.get("key") != key:
            raise ValueError(f"{variant}: immutable key is not derived from SHA-256")
        if entry.get("url") != f"https://{ASSET_HOST}/{key}":
            raise ValueError(f"{variant}: URL does not match approved asset host/key")
        if entry.get("contentType") != "model/gltf-binary":
            raise ValueError(f"{variant}: incorrect GLB content type")
        rooms.append(Room(
            variant, sha, size,
            "WR3_ARM_hearth_flame_body" if variant == "v3" else "WR4_OBS_fireplace_flame_body",
        ))
    return tuple(rooms)


def runtime_rooms() -> tuple[Room, Room]:
    return parse_manifest(json.loads(MANIFEST.read_text(encoding="utf-8")))


def self_test() -> None:
    document = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rooms = parse_manifest(document)
    assert tuple(room.variant for room in rooms) == VARIANTS
    assert len({room.immutable_key for room in rooms}) == 2
    for variant, mutation in (
        ("v4", ("url", "https://evil.invalid/x.glb")),
        ("v4", ("key", "war-room/v4/staging/current.glb")),
        ("v4", ("contentType", "text/plain")),
        ("v3", ("sha256", "not-a-sha256")),
        ("v3", ("bytes", 0)),
    ):
        broken = copy.deepcopy(document)
        field, value = mutation
        broken["assets"][f"warRoom.{variant}.runtime"][field] = value
        try:
            parse_manifest(broken)
        except ValueError:
            pass
        else:
            raise AssertionError(f"Corrupt {variant}.{field} was accepted")
    broken = copy.deepcopy(document)
    broken["baseUrl"] = "https://evil.invalid"
    try:
        parse_manifest(broken)
    except ValueError:
        pass
    else:
        raise AssertionError("Unexpected origin was accepted")
    print("War Room V3/V4 runtime manifest cache contract self-test: OK")


if __name__ == "__main__":
    self_test()
