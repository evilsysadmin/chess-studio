#!/usr/bin/env python3
"""Freeze exact live War Room V3/V4 R2 GLBs without touching mutable aliases.

Operational phase A: read authoritative R2 current.glb, fail closed if its
byte SHA or authored Hans anchors differ from the last accepted runtime
capture, and publish content-addressed copies. Phase B (separate PR) changes
the reviewed manifest and consumer URLs only after public readback succeeds.
"""
from __future__ import annotations

import argparse
from dataclasses import dataclass
import hashlib
import json
import struct
import urllib.error
import urllib.request

import r2_asset_publish as transport
import r2_asset_publisher as core
from r2_storage_governance import admission_check_batch

CONTENT_TYPE = "model/gltf-binary"
HANS_NODES = frozenset({
    "WR_HANS_door_leaf", "WR_ANCHOR_hans_hearth", "WR_ANCHOR_hans_door",
    "WR_ANCHOR_hans_basket", "WR_ANCHOR_hans_tools", "WR_ANCHOR_hans_corridor_0",
})


@dataclass(frozen=True)
class Room:
    variant: str
    sha256: str
    size: int
    flame: str

    @property
    def prefix(self) -> str:
        return f"war-room/{self.variant}/runtime"

    @property
    def alias(self) -> str:
        return f"{self.prefix}/current.glb"

    @property
    def immutable_key(self) -> str:
        return f"{self.prefix}/war-room-{self.variant}-shell-{self.sha256[:16]}.glb"


# SHA-256/length independently observed from the *live* R2 aliases by the
# successful #5721 visual/browser run (head 09d18b53). Never infer the binary
# from the older manifest entries: those lack Hans' authored runtime stage.
ROOMS = (
    Room("v3", "0df589c2fa839a26459a019814f03ccf5a35afd18201cce8c502a2723398c49f", 3858532,
         "WR3_ARM_hearth_flame_body"),
    Room("v4", "47bad4e7c987bbcfb8663a067048110462856f99abd747348a1aa81f9f3bd7bf", 3705688,
         "WR4_OBS_fireplace_flame_body"),
)


def glb_nodes(data: bytes) -> dict:
    if len(data) < 20:
        raise ValueError("GLB truncado")
    magic, version, declared_size = struct.unpack_from("<4sII", data)
    if magic != b"glTF" or version != 2 or declared_size != len(data):
        raise ValueError("GLB header/length inválido")
    json_size, chunk_type = struct.unpack_from("<II", data, 12)
    if chunk_type != 0x4E4F534A or json_size > len(data) - 20:
        raise ValueError("GLB JSON chunk inválido")
    try:
        gltf = json.loads(data[20:20 + json_size].decode("utf-8").rstrip("\x00 \t\r\n"))
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ValueError("GLB JSON corrupto") from exc
    if not isinstance(gltf, dict) or not isinstance(gltf.get("nodes"), list):
        raise ValueError("GLB nodes ausentes")
    return gltf


def verify_bytes(room: Room, data: bytes) -> None:
    digest = hashlib.sha256(data).hexdigest()
    if len(data) != room.size or digest != room.sha256:
        raise ValueError(
            f"{room.variant}: ALIAS CAMBIADO; esperado {room.size}/{room.sha256}, "
            f"observado {len(data)}/{digest}. No publicar ni promocionar."
        )
    gltf = glb_nodes(data)
    nodes = {node.get("name"): node for node in gltf["nodes"] if isinstance(node, dict)}
    missing = (HANS_NODES | {room.flame}) - nodes.keys()
    if missing:
        raise ValueError(f"{room.variant}: faltan anclas críticas: {sorted(missing)}")
    leaf = nodes["WR_HANS_door_leaf"]
    if "mesh" not in leaf or "war_room_hans_door_open_yaw" not in leaf.get("extras", {}):
        raise ValueError(f"{room.variant}: puerta de Hans sin malla/yaw authored")
    if "EXT_meshopt_compression" not in gltf.get("extensionsUsed", []):
        raise ValueError(f"{room.variant}: se perdió compresión Meshopt")


def public_readback(room: Room, data: bytes, domain: str) -> None:
    url = f"https://{domain}/{room.immutable_key}?verify={room.sha256[:16]}"
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache",
                                                    "User-Agent": "chess-studio-warroom-freeze/1"})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.status != 200 or response.headers.get_content_type() != CONTENT_TYPE:
                raise ValueError(f"{room.variant}: public GET inválido: {response.status}")
            published = response.read()
    except (urllib.error.URLError, TimeoutError) as exc:
        raise RuntimeError(f"{room.variant}: immutable no legible públicamente: {exc}") from exc
    if published != data:
        raise ValueError(f"{room.variant}: R2 público no devuelve bytes idénticos")


def self_test() -> None:
    for room in ROOMS:
        assert len(room.sha256) == 64
        assert room.immutable_key.endswith(f"-{room.sha256[:16]}.glb")
        assert room.immutable_key != room.alias
    assert len({room.immutable_key for room in ROOMS}) == len(ROOMS)
    room = ROOMS[0]
    nodes = [{"name": name} for name in HANS_NODES | {room.flame}]
    next(node for node in nodes if node["name"] == "WR_HANS_door_leaf").update(
        {"mesh": 0, "extras": {"war_room_hans_door_open_yaw": 1.2}}
    )
    raw = json.dumps({"nodes": nodes, "extensionsUsed": ["EXT_meshopt_compression"]}).encode()
    raw += b" " * (-len(raw) % 4)
    sample = struct.pack("<4sII", b"glTF", 2, 20 + len(raw)) + struct.pack(
        "<II", len(raw), 0x4E4F534A
    ) + raw
    sample_room = Room(room.variant, hashlib.sha256(sample).hexdigest(), len(sample), room.flame)
    verify_bytes(sample_room, sample)
    for broken in (sample[:-1], sample.replace(b"WR_ANCHOR_hans_hearth", b"WR_ANCHOR_hans_ABSENT")):
        try:
            verify_bytes(sample_room, broken)
        except ValueError:
            pass
        else:
            raise AssertionError("bad source was not rejected")
    print("war-room immutable freeze self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("self-test", "publish", "verify"))
    args = parser.parse_args()
    if args.command == "self-test":
        self_test()
        return 0

    # No other source of truth: read authenticated R2 aliases, not stale CDN
    # responses or a fresh Blender build with possibly different output.
    config = core.load_config(core.DEFAULT_CONFIG)
    token, account_id = core.require_env()
    bucket = config["bucket"]
    source = {}
    for room in ROOMS:
        data = core.get_object(token, account_id, bucket, room.alias)
        verify_bytes(room, data)
        source[room.variant] = data
        print(f"VERIFIED SOURCE {room.variant} {room.alias} {room.size} B {room.sha256}")

    if args.command == "publish":
        # Admission is batched before the FIRST write: do not leave half a pair
        # behind merely because the second asset exceeds storage policy.
        additions = {room.immutable_key: room.size for room in ROOMS}
        admission_check_batch(config, token=token, account_id=account_id, additions=additions)
        for room in ROOMS:
            transport.raw_upload_object(
                token, account_id, bucket, room.immutable_key,
                source[room.variant], CONTENT_TYPE,
            )

    for room in ROOMS:
        actual = core.get_object(token, account_id, bucket, room.immutable_key)
        verify_bytes(room, actual)
        if actual != source[room.variant]:
            raise ValueError(f"{room.variant}: immutable readback no coincide con alias")
        public_readback(room, actual, config["customDomain"])
        print(json.dumps({
            "variant": room.variant, "key": room.immutable_key,
            "sha256": room.sha256, "bytes": room.size,
            "url": f'https://{config["customDomain"]}/{room.immutable_key}',
            "published": args.command == "publish",
            "publicVerified": True, "manifestPromoted": False,
        }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
