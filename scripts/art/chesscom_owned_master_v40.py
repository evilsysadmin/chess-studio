#!/usr/bin/env python3
"""CHESSCOM: pin our original artwork and fail-closed GLB rig inspection.

This checks technical structure, NOT artistic approval or authorship proof of the GLB.
Run Blender review separately; never promote previews automatically.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ORIGINALS = {
    "sven-portrait": ("frontend/public/chesscom/sven-portrait.svg", "98f609f2a7535aff9b6fd436b92e272520db50b2"),
    "dieter-portrait": ("frontend/public/chesscom/dieter-portrait.svg", "afe41ab636cce04ec069a8dd56b3ec9df2245d02"),
    "sven-ne-concept-probe": ("frontend/public/chesscom/sven-probe-ne.webp", "302351ea87f72341e2d924328a73e8045811f3e7"),
}
BONES = ("head", "lefthand", "righthand", "leftfoot", "rightfoot")
WEAPON_NAMES = ("rifle", "carbine", "weapon", "hk416", "g36c", "mp5", "gun")


def git_blob_sha(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def verify_original_art(root: Path = ROOT) -> dict:
    found = {}
    for name, (relative, expected) in ORIGINALS.items():
        payload = (root / relative).read_bytes()
        actual = git_blob_sha(payload)
        if actual != expected:
            raise ValueError(f"first-party-art-mismatch:{name}:{actual}")
        if relative.endswith(".svg") and b"<svg" not in payload[:256]:
            raise ValueError(f"invalid-original-svg:{name}")
        if relative.endswith(".webp") and not (payload.startswith(b"RIFF") and payload[8:12] == b"WEBP"):
            raise ValueError(f"invalid-original-webp:{name}")
        found[name] = {"path": relative, "git_blob": actual, "sha256": hashlib.sha256(payload).hexdigest()}
    return found


def glb_document(data: bytes) -> dict:
    if len(data) < 20:
        raise ValueError("invalid-glb-header")
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    if magic != b"glTF" or version != 2 or length != len(data):
        raise ValueError("invalid-glb-header")
    size, kind = struct.unpack_from("<I4s", data, 12)
    if kind != b"JSON" or size <= 0 or 20 + size > len(data):
        raise ValueError("invalid-glb-json-chunk")
    try:
        document = json.loads(data[20:20 + size].decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("invalid-glb-json") from error
    if not isinstance(document, dict) or document.get("asset", {}).get("version") != "2.0":
        raise ValueError("invalid-gltf-version")
    return document


def audit_candidate(path: Path, expected_sha256: str) -> dict:
    if not re.fullmatch(r"[a-f0-9]{64}", expected_sha256 or ""):
        raise ValueError("explicit-source-sha256-required")
    payload = Path(path).read_bytes()
    actual = hashlib.sha256(payload).hexdigest()
    if actual != expected_sha256:
        raise ValueError("master-sha256-mismatch")
    doc = glb_document(payload)
    nodes, skins, meshes = doc.get("nodes", []), doc.get("skins", []), doc.get("meshes", [])
    if not isinstance(nodes, list) or not isinstance(meshes, list) or not isinstance(skins, list):
        raise ValueError("invalid-rig-structure")
    if not skins or not meshes:
        raise ValueError("master-missing-skin-or-mesh")
    joints = set()
    for skin in skins:
        for joint in skin.get("joints", []):
            if not isinstance(joint, int) or not 0 <= joint < len(nodes):
                raise ValueError("invalid-skeleton-joint")
            joints.add(joint)
    if len(joints) < 12:
        raise ValueError("master-not-rigged-enough")
    bone_names = {re.sub(r"[^a-z0-9]", "", str(nodes[index].get("name", "")).lower()) for index in joints}
    missing = [bone for bone in BONES if not any(name.endswith(bone) for name in bone_names)]
    if missing:
        raise ValueError("master-missing-anatomical-bones:" + ",".join(missing))
    rigged = [
        node for node in nodes
        if isinstance(node.get("mesh"), int) and 0 <= node["mesh"] < len(meshes)
        and isinstance(node.get("skin"), int) and 0 <= node["skin"] < len(skins)
    ]
    if not rigged:
        raise ValueError("master-mesh-not-skinned")
    weighted = any(
        "JOINTS_0" in primitive.get("attributes", {}) and "WEIGHTS_0" in primitive.get("attributes", {})
        for node in rigged for primitive in meshes[node["mesh"]].get("primitives", [])
    )
    if not weighted:
        raise ValueError("master-mesh-has-no-weights")
    weapon = [
        node for node in nodes if isinstance(node.get("mesh"), int)
        and 0 <= node["mesh"] < len(meshes)
        and any(tag in str(node.get("name", "")).lower() for tag in WEAPON_NAMES)
    ]
    if not weapon:
        raise ValueError("master-missing-weapon-mesh")
    return {
        "source_sha256": actual, "source_bytes": len(payload),
        "joints": len(joints), "skins": len(skins), "skinned_mesh_nodes": len(rigged),
        "weapon_mesh_nodes": [str(node.get("name")) for node in weapon],
        "review_only": True, "artistic_approval": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--references-only", action="store_true")
    parser.add_argument("--master-glb", type=Path)
    parser.add_argument("--sha256")
    args = parser.parse_args()
    refs = verify_original_art()
    if not args.references_only and not (args.master_glb and args.sha256):
        parser.error("specify --references-only OR --master-glb PATH --sha256 HEX")
    result = {"original_art": refs, "candidate": None}
    if args.master_glb:
        if not args.sha256:
            parser.error("--master-glb requires --sha256")
        result["candidate"] = audit_candidate(args.master_glb, args.sha256)
    print(json.dumps(result, sort_keys=True, indent=2))


if __name__ == "__main__":
    main()
