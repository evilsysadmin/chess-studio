#!/usr/bin/env python3
"""Review-only crops of the ORIGINAL approved Dust Veil artwork.

Never fabricate missing views, treat a concept PNG as a 3D master, or publish
runtime assets. SHA256 must match the immutable first-party source exactly.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "docs/experiments/chesscom-golden-art-v41.json"
ACTORS = ("sven", "dieter", "matthias")
KINDS = ("field", "portrait")


def read_contract(path: Path = CONTRACT) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("schema") != 1 or data.get("identity") != "chesscom-dust-veil-first-party-golden-v41":
        raise ValueError("wrong-golden-contract")
    ref = data.get("reference", {})
    width, height = ref.get("width"), ref.get("height")
    if not isinstance(width, int) or not isinstance(height, int) or width < 64 or height < 64:
        raise ValueError("invalid-reference-dimensions")
    if not re.fullmatch(r"[0-9a-f]{64}", str(ref.get("sha256", ""))):
        raise ValueError("missing-original-sha256")
    if data.get("review_only") is not True or data.get("acceptance", {}).get("render_only_until_approved") is not True:
        raise ValueError("unreviewed-asset-promotion")
    regions = data.get("regions")
    if not isinstance(regions, list) or len(regions) != len(ACTORS) * len(KINDS):
        raise ValueError("missing-original-regions")
    seen = set()
    for item in regions:
        if not isinstance(item, dict):
            raise ValueError("invalid-region")
        actor, kind = item.get("actor"), item.get("kind")
        if actor not in ACTORS or kind not in KINDS or item.get("id") != f"{actor}-{kind}":
            raise ValueError("invalid-region-identity")
        if (actor, kind) in seen:
            raise ValueError("duplicate-region")
        seen.add((actor, kind))
        box = item.get("box")
        if not isinstance(box, list) or len(box) != 4 or not all(isinstance(n, int) and not isinstance(n, bool) for n in box):
            raise ValueError("invalid-region-bounds")
        x0, y0, x1, y1 = box
        if not (0 <= x0 < x1 <= width and 0 <= y0 < y1 <= height):
            raise ValueError("out-of-bounds-region")
    if seen != {(actor, kind) for actor in ACTORS for kind in KINDS}:
        raise ValueError("missing-actor-reference")
    if sorted(data.get("identities", {})) != sorted(ACTORS):
        raise ValueError("missing-canonical-identities")
    return data


def verify_golden_image(path: Path, contract: dict) -> dict:
    from PIL import Image
    original = Path(path)
    if not original.is_file() or original.stat().st_size > 15_000_000:
        raise ValueError("missing-or-oversized-original")
    payload = original.read_bytes()
    digest = hashlib.sha256(payload).hexdigest()
    if digest != contract["reference"]["sha256"]:
        raise ValueError("wrong-original-image-sha256")
    with Image.open(original) as im:
        im.load()
        if tuple(im.size) != (contract["reference"]["width"], contract["reference"]["height"]):
            raise ValueError("wrong-original-image-dimensions")
        if im.format != "PNG":
            raise ValueError("wrong-original-image-format")
    return {"sha256": digest, "bytes": len(payload), "size": [contract["reference"]["width"], contract["reference"]["height"]]}


def build_contact_sheet(path: Path, destination: Path, contract: dict) -> dict:
    from PIL import Image, ImageDraw
    proof = verify_golden_image(path, contract)
    source = Image.open(path).convert("RGB")
    width, height = 420, 320
    sheet = Image.new("RGB", (width * 3, height * 2), "#22232b")
    draw = ImageDraw.Draw(sheet)
    for index, spec in enumerate(contract["regions"]):
        crop = source.crop(tuple(spec["box"]))
        crop.thumbnail((width - 20, height - 45), Image.Resampling.LANCZOS)
        x = (index % 3) * width + (width - crop.width) // 2
        y = (index // 3) * height + 27 + (height - 47 - crop.height) // 2
        sheet.paste(crop, (x, y))
        draw.text(((index % 3) * width + 10, (index // 3) * height + 7), spec["id"], fill="white")
    destination.mkdir(parents=True, exist_ok=True)
    png = destination / "chesscom-golden-review-v41.png"
    sheet.save(png)
    result = {"identity": contract["identity"], "review_only": True,
              "source": proof, "contact_sheet_sha256": hashlib.sha256(png.read_bytes()).hexdigest(),
              "reference_region_ids": [item["id"] for item in contract["regions"]],
              "NOT_a_runtime_atlas": True}
    (destination / "review-manifest.json").write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, required=True, help="Original user-approved Dust Veil PNG; never a substitute")
    parser.add_argument("--output-dir", type=Path, required=True)
    options = parser.parse_args()
    report = build_contact_sheet(options.source, options.output_dir, read_contract())
    print(json.dumps(report, sort_keys=True))


if __name__ == "__main__":
    main()
