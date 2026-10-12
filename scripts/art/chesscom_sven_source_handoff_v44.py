#!/usr/bin/env python3
"""Offline, SHA-locked source handoff for an original Sven 3D asset.

Never invent reverse viewpoints, call an external image-to-3D service or
claim that a screenshot is a suitable finished rig reference.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "docs/experiments/chesscom-golden-art-v41.json"
MIN_BODY = (512, 768)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def contract_from(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("identity") != "chesscom-dust-veil-first-party-golden-v41" or data.get("review_only") is not True:
        raise ValueError("untrusted-original-contract")
    ref = data.get("reference", {})
    if not isinstance(ref.get("sha256"), str) or len(ref["sha256"]) != 64:
        raise ValueError("missing-golden-sha256")
    regions = data.get("regions", [])
    expected = {(actor, kind) for actor in ("sven", "dieter", "matthias") for kind in ("field", "portrait")}
    if len(regions) != 6 or {(x.get("actor"), x.get("kind")) for x in regions} != expected:
        raise ValueError("incomplete-first-party-reference")
    return data


def approved_body(path, expected_sha, signed_off):
    if not signed_off:
        raise ValueError("artist-approval-required")
    if not expected_sha or len(expected_sha) != 64:
        raise ValueError("full-body-sha256-required")
    if digest(path) != expected_sha.lower():
        raise ValueError("full-body-sha256-mismatch")
    with Image.open(path) as img:
        if img.format != "PNG":
            raise ValueError("full-body-png-required")
        if img.width < MIN_BODY[0] or img.height < MIN_BODY[1]:
            raise ValueError("full-body-resolution-insufficient")
        size = list(img.size)
    return {"sha256": expected_sha.lower(), "size": size, "source_file": Path(path).name,
            "technical_readiness": True, "anatomy_from_unseen_angles": "UNVERIFIED",
            "consent_to_external_upload": False}


def prepare(golden, output, contract_path=CONTRACT, body=None, body_sha=None, signed_off=False):
    contract = contract_from(contract_path)
    ref = contract["reference"]
    if digest(golden) != ref["sha256"]:
        raise ValueError("original-golden-sha256-mismatch")
    with Image.open(golden) as source:
        if source.format != "PNG" or list(source.size) != [ref["width"], ref["height"]]:
            raise ValueError("original-golden-dimensions-mismatch")
        image = source.convert("RGB")
    clean = approved_body(body, body_sha, signed_off) if body is not None else None
    if body is None and (body_sha or signed_off):
        raise ValueError("full-body-source-required")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    crops = {}
    for region in contract["regions"]:
        if region["actor"] != "sven":
            continue
        x0, y0, x1, y1 = region["box"]
        if not (0 <= x0 < x1 <= image.width and 0 <= y0 < y1 <= image.height):
            raise ValueError("reference-crop-out-of-bounds")
        file = output / f"sven-original-{region['kind']}.png"
        image.crop((x0, y0, x1, y1)).save(file)
        crops[region["kind"]] = {"name": file.name, "sha256": digest(file),
                                "size": [x1-x0, y1-y0], "box": region["box"],
                                "pixels_unmodified": True}
    report = {
        "identity": "chesscom-sven-first-party-3d-source-v44",
        "golden_sha256": ref["sha256"], "original_crops": crops,
        "clean_full_body": clean, "review_only": True,
        "NOT_a_3d_master": True, "NOT_a_directional_animation_bank": True,
        "readiness": "ready-for-consented-manual-trial" if clean else "blocked",
        "blocking_reasons": [] if clean else [
            "Only a single genuine camera view exists",
            "Field figure is partly occluded and too small for reliable full-body reconstruction",
            "Portrait includes HUD and is not an A-pose or a complete humanoid",
        ],
        "external_upload_performed": False, "external_cost_incurred": 0,
    }
    (output / "source-manifest.json").write_text(json.dumps(report, indent=2, sort_keys=True,
                                                   ensure_ascii=False) + "\n", encoding="utf-8")
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--golden", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--contract", type=Path, default=CONTRACT)
    parser.add_argument("--full-body", type=Path)
    parser.add_argument("--full-body-sha256")
    parser.add_argument("--artist-approved", action="store_true")
    args = parser.parse_args()
    result = prepare(args.golden, args.output_dir, args.contract,
                     args.full_body, args.full_body_sha256, args.artist_approved)
    print(json.dumps({"readiness": result["readiness"], "golden_sha256": result["golden_sha256"],
                      "external_upload_performed": False}, sort_keys=True))


if __name__ == "__main__":
    main()
