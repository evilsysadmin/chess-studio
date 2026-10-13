#!/usr/bin/env python3
"""Structural preflight for authored CHESSCOM animated actor GLBs.

PASS is review-only; it cannot prove good motion, correct buffer data or
visual fidelity. Always validate in Blender and in Babylon at game zoom.
"""
from __future__ import annotations
import argparse
import json
import re
from pathlib import Path
from chesscom_owned_master_v40 import audit_candidate, glb_document, WEAPON_NAMES

REQUIRED = {"idle", "walk", "fire", "damage", "death"}
OPTIONAL = {"aim", "reload"}

def name(value):
    return re.sub(r"[^a-z0-9]", "", value.lower()) if isinstance(value, str) else ""

def audit_playable_structure(path: Path, sha256: str) -> dict:
    base = audit_candidate(path, sha256)
    doc = glb_document(Path(path).read_bytes())
    nodes, skins = doc["nodes"], doc["skins"]
    animations = doc.get("animations", [])
    if not isinstance(animations, list) or not animations:
        raise ValueError("missing-animation-bank")
    joints = {joint for skin in skins for joint in skin["joints"]}
    clips = set()
    for animation in animations:
        if not isinstance(animation, dict):
            raise ValueError("invalid-animation")
        clip = name(animation.get("name"))
        if clip not in REQUIRED | OPTIONAL or clip in clips:
            raise ValueError("unknown-or-duplicate-clip:" + clip)
        clips.add(clip)
        samplers, channels = animation.get("samplers"), animation.get("channels")
        if not isinstance(samplers, list) or not samplers or not isinstance(channels, list) or not channels:
            raise ValueError("empty-clip:" + clip)
        rig_animated = False
        for channel in channels:
            if not isinstance(channel, dict) or not isinstance(channel.get("target"), dict):
                raise ValueError("invalid-channel:" + clip)
            target = channel["target"]
            sampler, node = channel.get("sampler"), target.get("node")
            if (type(sampler) is not int or not 0 <= sampler < len(samplers)
                or type(node) is not int or not 0 <= node < len(nodes)
                or target.get("path") not in ("rotation", "translation", "scale")):
                raise ValueError("invalid-channel:" + clip)
            rig_animated |= node in joints
        if not rig_animated:
            raise ValueError("clip-misses-skeleton:" + clip)
    if REQUIRED - clips:
        raise ValueError("missing-clips:" + ",".join(sorted(REQUIRED - clips)))

    weapon_nodes = [
        i for i, node in enumerate(nodes)
        if isinstance(node, dict) and type(node.get("mesh")) is int
        and any(tag in str(node.get("name", "")).lower() for tag in WEAPON_NAMES)
    ]
    pending, visited = list(weapon_nodes), set()
    while pending:
        index = pending.pop()
        if index in visited:
            continue
        visited.add(index)
        children = nodes[index].get("children", [])
        if not isinstance(children, list) or any(type(n) is not int or not 0 <= n < len(nodes) for n in children):
            raise ValueError("invalid-weapon-hierarchy")
        pending.extend(children)
    muzzle = [i for i in visited if name(nodes[i].get("name")) in ("muzzle", "muzzlesocket")]
    if len(muzzle) != 1:
        raise ValueError("weapon-muzzle-socket-required")
    return {**base, "required_clips": sorted(REQUIRED), "available_clips": sorted(clips),
            "muzzle_node": nodes[muzzle[0]]["name"], "structural_preflight": True,
            "review_only": True, "artistic_approval": False, "runtime_approved": False}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--master-glb", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    args = parser.parse_args()
    print(json.dumps(audit_playable_structure(args.master_glb, args.sha256), indent=2, sort_keys=True))
