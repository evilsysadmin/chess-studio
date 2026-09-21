#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

from png_contract import sha256_file, validate_png_contract

ROOT = Path(__file__).resolve().parents[2]
ASSET_ROOT = ROOT / "games" / "pawn-slug-godot" / "assets" / "enemies-v4"
MANIFEST = ASSET_ROOT / "enemy-initial-v4-manifest.json"
EXPECTED_TYPES = ("pawn", "rook", "scout")
EXPECTED_ACTIONS = ("idle", "run", "shoot", "hurt")


def fail(message: str) -> None:
    raise SystemExit(message)


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if data.get("schema") != 4 or data.get("scope") != "pawn-slug-initial-enemies":
        fail("initial enemy v4 manifest schema/scope mismatch")
    if data.get("pageSize") != [2560, 1664] or data.get("cell") != [320, 416]:
        fail("initial enemy v4 page/cell contract mismatch")
    if data.get("pivot") != [148, 392] or data.get("footLine") != 392 or data.get("guard") != 8:
        fail("initial enemy v4 pivot/foot/guard contract mismatch")
    actions = data.get("actions", [])
    if [item.get("name") for item in actions] != list(EXPECTED_ACTIONS):
        fail("initial enemy v4 action order mismatch")
    if [item.get("row") for item in actions] != [0, 1, 2, 3]:
        fail("initial enemy v4 row mapping mismatch")
    if any(int(item.get("frames", 0)) != 8 for item in actions):
        fail("initial enemy v4 requires 8 frames per action")

    types = data.get("types", [])
    if [item.get("type") for item in types] != list(EXPECTED_TYPES):
        fail("initial enemy v4 type order mismatch")

    for item in types:
        path = ASSET_ROOT / item["page"]
        info = validate_png_contract(path, max_side=4096)
        if (info["width"], info["height"]) != (2560, 1664):
            fail(f"{path.name}: wrong dimensions")
        if sha256_file(path) != item.get("sha256"):
            fail(f"{path.name}: sha256 mismatch")
        with Image.open(path) as image:
            rgba = image.convert("RGBA")
            for row, action in enumerate(EXPECTED_ACTIONS):
                hashes: set[str] = set()
                for col in range(8):
                    cell = rgba.crop((col * 320, row * 416, (col + 1) * 320, (row + 1) * 416))
                    box = cell.getchannel("A").getbbox()
                    if box is None:
                        fail(f"{path.name}: {action}[{col}] empty")
                    left, top, right, bottom = box
                    guard = min(left, top, 320 - right, 416 - bottom)
                    if guard < 8:
                        fail(f"{path.name}: {action}[{col}] guard={guard}")
                    foot = bottom - 1
                    if abs(foot - 392) > 2:
                        fail(f"{path.name}: {action}[{col}] foot line={foot}")
                    hashes.add(hashlib.sha256(cell.tobytes()).hexdigest())
                if len(hashes) != 8:
                    fail(f"{path.name}: {action} collapsed to {len(hashes)} unique frames")
    print("OK initial enemy v4: 3 types, 4 actions, 96 unique Godot frames, pages=2560x1664")


if __name__ == "__main__":
    main()
