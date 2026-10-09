#!/usr/bin/env python3
"""Fail-closed audit of the active, published Matthias sprite atlases.

Historical head-integrity reconstruction is manual: it depends on retired R2
inputs. CI audits the bytes and head silhouettes the game actually loads.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import sys
import tempfile

import numpy as np
from PIL import Image
from repair_matthias_head_integrity_v1 import (
    CELL, COLUMNS, ROWS, MAX_POST_CUT, POST_CUT_ROWS,
    head_cut_length, self_test as repair_self_test,
)

HASH_SUFFIX = re.compile(r"-([0-9a-f]{16})\.png$", re.IGNORECASE)
SHA256 = re.compile(r"[0-9a-f]{64}")
WEAPONS = {"pistol", "machinegun", "shotgun", "panzerfaust"}


def assert_manifest(root: pathlib.Path) -> dict[str, dict]:
    path = root / "matthias_sprite_smoke.json"
    manifest = json.loads(path.read_text(encoding="utf-8"))
    by_weapon = {item["weapon"]: item for item in manifest["atlases"]}
    if set(by_weapon) != WEAPONS:
        raise ValueError(f"runtime Matthias weapon set changed: {sorted(by_weapon)}")
    for weapon, item in by_weapon.items():
        name = item.get("source")
        actual = item.get("sourceSha256")
        if not isinstance(name, str) or not isinstance(actual, str) or not SHA256.fullmatch(actual):
            raise ValueError(f"{weapon}: missing verified source SHA-256")
        match = HASH_SUFFIX.search(name)
        if not match or not actual.startswith(match.group(1).lower()):
            raise ValueError(f"{weapon}: content-addressed PNG SHA mismatch: {name} / {actual}")
        if (item.get("atlasSize") != [CELL * COLUMNS, CELL * ROWS]
                or item.get("cellSize") != CELL
                or item.get("visibleFrames") != ROWS * COLUMNS
                or item.get("edgeTouches")):
            raise ValueError(f"{weapon}: invalid full atlas geometry, empty frames or edge clipping")
    return by_weapon


def audit(root: pathlib.Path) -> dict[str, object]:
    atlases = assert_manifest(root)
    pistol = root / "pistol" / "frames"
    post_cuts: dict[str, int] = {}
    for row in POST_CUT_ROWS:
        worst = 0
        for col in range(COLUMNS):
            file = pistol / f"matthias_pistol_r{row:02d}_c{col:02d}.png"
            with Image.open(file) as opened:
                frame = np.asarray(opened.convert("RGBA"))
            if frame.shape != (CELL, CELL, 4):
                raise ValueError(f"unexpected pistol frame geometry: {file}")
            worst = max(worst, head_cut_length(frame))
        post_cuts[str(row)] = worst
        if worst > MAX_POST_CUT:
            raise ValueError(f"active pistol r{row}: straight head cut {worst}px > {MAX_POST_CUT}")
    result = {"status": "pass", "sha256": {w: v["sourceSha256"] for w, v in atlases.items()},
              "pistolMaxHeadCut": post_cuts}
    print("OK Matthias published head integrity: verified SHA, geometry and face-cut metrics")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a", encoding="utf-8") as out:
            out.write("\n### Published Matthias integrity\n\n")
            out.write("All 4 runtime atlas hashes match immutable URLs; pistol cut metrics PASS.\n")
            out.write(f"- Pistol worst head edges by row: {post_cuts}\n")
    return result


def self_test() -> None:
    repair_self_test()
    assert HASH_SUFFIX.search("matthias-pistol-head-integrity-v1-24872d1905a9e759.png")
    assert not HASH_SUFFIX.search("asset-current.png")
    with tempfile.TemporaryDirectory() as temporary:
        root = pathlib.Path(temporary)
        sample = {
            "weapon": "pistol",
            "source": "canonical-" + ("a" * 16) + ".png",
            "sourceSha256": "a" * 64,
            "atlasSize": [CELL * COLUMNS, CELL * ROWS],
            "cellSize": CELL,
            "visibleFrames": COLUMNS * ROWS,
            "edgeTouches": [],
        }
        payload = {"atlases": [{**sample, "weapon": w} for w in sorted(WEAPONS)]}
        path = root / "matthias_sprite_smoke.json"
        path.write_text(json.dumps(payload), encoding="utf-8")
        assert set(assert_manifest(root)) == WEAPONS
        payload["atlases"][0]["sourceSha256"] = "b" * 64
        path.write_text(json.dumps(payload), encoding="utf-8")
        try:
            assert_manifest(root)
        except ValueError as exc:
            assert "SHA mismatch" in str(exc)
        else:
            raise AssertionError("Hash drift was not blocked")
    print("OK published Matthias integrity audit self-test")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sprite-smoke-dir", type=pathlib.Path)
    ap.add_argument("--self-test", action="store_true")
    args = ap.parse_args()
    try:
        if args.self_test:
            self_test()
        else:
            if args.sprite_smoke_dir is None:
                ap.error("--sprite-smoke-dir is required")
            audit(args.sprite_smoke_dir)
        return 0
    except Exception as exc:
        print(f"ERROR Matthias runtime integrity audit: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
