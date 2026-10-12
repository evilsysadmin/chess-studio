#!/usr/bin/env python3
"""CHESSCOM Sven 8-way art bank compiler: use Sprite Forge, never invent frames.

Input:  frames_root/<clip>/<N|NE|E|SE|S|SW|W|NW>/000.png, ...
Output: sven-bank-v1.webp + sven-bank-v1.json, manually reviewed BEFORE runtime publication.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import tempfile
from pathlib import Path

from PIL import Image
from sprite_forge import (
    BankContractError, LintConfig, TemporalContract,
    build_bank, lint_frame, load_bank_contract, validate_sequence,
)

DIRECTIONS = ("N", "NE", "E", "SE", "S", "SW", "W", "NW")
CLIPS = ("idle", "walk", "aim", "shoot", "hit", "die")
CLIP_COUNTS = {"idle": 2, "walk": 4, "aim": 1, "shoot": 2, "hit": 1, "die": 2}
ATLAS_URL = "/chesscom/sven-bank-v1.webp"
MAX_ATLAS_BYTES = 8 * 1024 * 1024
FOOT_PIVOT = (64, 180)
EXPECTED_FRAMES = sum(CLIP_COUNTS.values()) * len(DIRECTIONS)


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _load_authored_frames(frames_root: Path, contract: dict) -> None:
    """Reject missing, extra, damaged or forged direction/animation frames.

    Sprite Forge does the actual alpha/geometry/temporal lint. The independent
    across-direction pixel hash prevents marketing mirrored/copy-pasted poses
    as eight genuinely authored directions.
    """
    seen_pixels: dict[str, str] = {}
    seen_dirs = set()
    cell = contract["cell"]
    for clip in CLIPS:
        for direction in DIRECTIONS:
            key = f"{clip}/{direction}"
            folder = frames_root / clip / direction
            required = [f"{i:03d}.png" for i in range(CLIP_COUNTS[clip])]
            present = sorted(p.name for p in folder.iterdir() if p.is_file()) if folder.is_dir() else []
            if present != required:
                raise BankContractError(f"missing-or-extra-frames:{key}: {present} != {required}")
            frames = []
            for file_name in required:
                path = folder / file_name
                with Image.open(path) as input_image:
                    if input_image.mode != "RGBA" or input_image.size != (cell["width"], cell["height"]):
                        raise BankContractError(f"source-mode-or-size:{path}")
                    frame = input_image.copy()
                result = lint_frame(frame, LintConfig(edge_guard_px=2))
                if not result.ok or result.main_component is None:
                    raise BankContractError(f"source-alpha:{path}:{','.join(result.errors)}")
                foot = result.main_component.bbox[3]
                if abs(foot - FOOT_PIVOT[1]) > 2:
                    raise BankContractError(f"source-footline:{path}:{foot}!={FOOT_PIVOT[1]}")
                pixel_hash = _digest(frame.tobytes())
                owner = seen_pixels.get(pixel_hash)
                if owner and owner.split("/")[1] != direction:
                    raise BankContractError(f"duplicate-direction-pixels:{path}:{owner}")
                seen_pixels.setdefault(pixel_hash, f"{key}/{file_name}")
                frames.append(frame)
            if len(frames) > 1:
                temporal = validate_sequence(frames, TemporalContract(
                    expected_frames=len(frames), max_foot_delta_px=2,
                    max_centroid_delta_px=12, max_height_delta_px=9,
                    max_width_delta_px=16, max_area_ratio_delta=.30,
                    loop=clip in {"idle", "walk", "aim"},
                ))
                if not temporal.ok:
                    raise BankContractError(f"temporal:{key}:{','.join(temporal.errors)}")
            seen_dirs.add(direction)
    if seen_dirs != set(DIRECTIONS):
        raise BankContractError("missing-directions")


def assemble_runtime_manifest(forge: dict, atlas_sha256: str) -> dict:
    """Adapter from Sprite Forge's schema-2 parts to Babylon V34's manifest.

    Each clip is a Sprite Forge part with 8 directional rows; the six parts
    are placed side by side in one atlas. No second frame-packer or fake art.
    """
    if forge.get("schema") != 2 or forge.get("surface") != "chesscom" or forge.get("actor") != "sven":
        raise BankContractError("not-a-sven-forge-bank")
    cell = forge["cell"]
    if cell != {"width": 128, "height": 192}:
        raise BankContractError("cell-contract-mismatch")
    if len(atlas_sha256) != 64 or any(c not in "0123456789abcdef" for c in atlas_sha256):
        raise BankContractError("bad-atlas-sha")
    offset_x = 0
    offsets = {}
    for clip in CLIPS:
        part = forge["parts"].get(clip)
        if not part or part["columns"] != CLIP_COUNTS[clip] or part["rows"] != 8:
            raise BankContractError(f"missing-or-invalid-part:{clip}")
        offsets[clip] = offset_x
        offset_x += part["columns"] * cell["width"]
    size = (offset_x, 8 * cell["height"])
    if size[0] > 4096 or size[1] > 4096:
        raise BankContractError("atlas-dimensions")
    by_name = {a["name"]: a for a in forge["animations"]}
    if len(by_name) != len(CLIPS) * len(DIRECTIONS):
        raise BankContractError("unexpected-animations")
    output = {
        "schema": 2, "surface": "chesscom", "actor": "sven",
        "variant": forge["variant"], "cell": cell,
        "pivot": {"x": FOOT_PIVOT[0], "y": FOOT_PIVOT[1]},
        "atlas": {"src": ATLAS_URL, "sha256": atlas_sha256,
                  "width": size[0], "height": size[1]},
        "clips": {},
    }
    for clip in CLIPS:
        frames_by_dir = {}
        fps = None
        for row, direction in enumerate(DIRECTIONS):
            a = by_name.get(f"{clip}_{direction}")
            if not a or a["part"] != clip or a["row"] != row or len(a["regions"]) != CLIP_COUNTS[clip]:
                raise BankContractError(f"wrong-authored-sequence:{clip}/{direction}")
            if fps is None:
                fps = a["fps"]
            elif fps != a["fps"]:
                raise BankContractError(f"fps-inconsistent:{clip}")
            frames_by_dir[direction] = [
                {"x": offsets[clip] + region["x"], "y": region["y"],
                 "width": cell["width"], "height": cell["height"],
                 "pivotX": FOOT_PIVOT[0], "pivotY": FOOT_PIVOT[1]}
                for region in a["regions"]
            ]
        output["clips"][clip] = {"fps": fps, "directions": frames_by_dir}
    return output


def build_chesscom_sven_bank(contract_path: Path, frames_root: Path, output_dir: Path) -> dict:
    """Build in quarantine; only deliver the pair when all gates pass.

    This does NOT publish the result to frontend/public or R2. The artifact
    must still pass V34 runtime validation and real visual QA before promotion.
    """
    contract = load_bank_contract(contract_path)
    if (contract["schema"], contract["surface"], contract["actor"]) != (2, "chesscom", "sven"):
        raise BankContractError("not-chesscom-sven-contract")
    if contract["cell"] != {"width": 128, "height": 192}:
        raise BankContractError("unexpected-cell-size")
    if len(contract["animations"]) != len(CLIPS)*len(DIRECTIONS):
        raise BankContractError("unexpected-forge-animation-count")
    _load_authored_frames(frames_root, contract)
    output_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".sven-bank-v38-", dir=output_dir) as tmp:
        scratch = Path(tmp)
        forged = build_bank(contract_path, frames_root, scratch / "forge")
        # No content changes: paste the exact reviewed output from Sprite Forge.
        size = (sum(CLIP_COUNTS[c] for c in CLIPS)*128, 8*192)
        atlas = Image.new("RGBA", size, (0, 0, 0, 0))
        at_x = 0
        for clip in CLIPS:
            with Image.open(scratch / "forge" / f"{clip}.png") as part:
                part = part.convert("RGBA")
                if part.size != (CLIP_COUNTS[clip]*128, 8*192):
                    raise BankContractError(f"forge-part-size:{clip}")
                atlas.alpha_composite(part, (at_x, 0))
            at_x += CLIP_COUNTS[clip]*128
        image_path = scratch / "sven-bank-v1.webp"
        atlas.save(image_path, "WEBP", lossless=True, method=6, exact=True)
        if image_path.stat().st_size > MAX_ATLAS_BYTES:
            raise BankContractError("atlas-byte-budget")
        # Verify round-trip lossless pixels, alpha included.
        with Image.open(image_path) as check:
            if check.convert("RGBA").tobytes() != atlas.tobytes():
                raise BankContractError("webp-not-lossless")
        runtime = assemble_runtime_manifest(forged, _digest(image_path.read_bytes()))
        manifest_path = scratch / "sven-bank-v1.json"
        manifest_path.write_text(json.dumps(runtime, sort_keys=True, indent=2) + "\n", encoding="utf-8")
        os.replace(image_path, output_dir / image_path.name)
        os.replace(manifest_path, output_dir / manifest_path.name)
    return runtime


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frames-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--contract", type=Path,
                        default=Path(__file__).with_name("contracts")/"chesscom_sven_v38.json")
    args = parser.parse_args()
    result = build_chesscom_sven_bank(args.contract, args.frames_root, args.output_dir)
    print(f"Prepared Sven V38 candidate: {result['atlas']['sha256']} ({EXPECTED_FRAMES} authored frames)")
    print("NOT published: visual/manual acceptance and exact atlas hash are still required.")


if __name__ == "__main__":
    main()
