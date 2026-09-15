#!/usr/bin/env python3
"""Normalize changed paths into their real app-visual ownership inputs.

The visual classifiers intentionally fail safe on unknown paths. Generated art can
have source files outside their normal trigger surface, though, and those source
paths should inherit the ownership of the runtime asset they produce rather than
expanding one focused art change to every visual producer.
"""
from __future__ import annotations

import argparse
import sys

MATTHIAS_MODEL = "frontend/public/models/matthias-home-canonical.glb"
MATTHIAS_CHRONICLES_CONSUMER = "frontend/src/chroniclesOfMatthiasIsometric.js"
MATTHIAS_BLEND = "frontend/art-source/matthias-home-canonical.blend"
CHRONICLES_PARTY_MODEL = "frontend/public/models/chronicles-tactics-party.glb"
CHRONICLES_PARTY_BUILDER = "scripts/blender/build_chronicles_tactics_party.py"
PAWN_SLUG_OWNER = "frontend/src/pawnSlugThree.js"
PAWN_SLUG_POW_MODEL = "frontend/public/models/pawn-slug/pawn_slug_pow_squad_v1.glb"
PAWN_SLUG_POW_BLEND = "art/blender/pawn-slug/pawn_slug_pow_squad_v1.blend"
PAWN_SLUG_POW_BUILDER = "scripts/blender/build_pawn_slug_pows.py"


def _is_matthias_canonical_owner(path: str) -> bool:
    lower = path.lower().replace("\\", "/")
    return (
        lower == MATTHIAS_MODEL
        or lower == MATTHIAS_BLEND
        or lower == "scripts/blender/build_home_matthias.py"
        or lower.startswith("scripts/blender/home_matthias_")
    )


def normalize(paths: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    def add(path: str) -> None:
        if path not in seen:
            seen.add(path)
            normalized.append(path)

    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        lower = path.lower()
        if _is_matthias_canonical_owner(path):
            # Home and Chronicles Tactics both render this GLB. Emit the runtime
            # asset plus one stable Chronicles owner so the existing classifiers
            # resolve exactly those two visual producers.
            add(MATTHIAS_MODEL)
            add(MATTHIAS_CHRONICLES_CONSUMER)
            continue
        if lower in {CHRONICLES_PARTY_MODEL, CHRONICLES_PARTY_BUILDER}:
            add(CHRONICLES_PARTY_MODEL)
            continue
        if lower in {
            PAWN_SLUG_POW_MODEL,
            PAWN_SLUG_POW_BLEND,
            PAWN_SLUG_POW_BUILDER,
        }:
            # The POW GLB is rendered only by Pawn Slug. Use a stable runtime
            # owner already understood by both visual classifiers.
            add(PAWN_SLUG_OWNER)
            continue
        add(path)
    return normalized


def self_test() -> None:
    matthias_sources = [
        MATTHIAS_BLEND,
        MATTHIAS_MODEL,
        "scripts/blender/build_home_matthias.py",
        "scripts/blender/home_matthias_parts.py",
        "scripts/blender/home_matthias_animations.py",
    ]
    assert normalize(matthias_sources) == [MATTHIAS_MODEL, MATTHIAS_CHRONICLES_CONSUMER]
    assert normalize(["frontend/src/App.css", *matthias_sources]) == [
        "frontend/src/App.css",
        MATTHIAS_MODEL,
        MATTHIAS_CHRONICLES_CONSUMER,
    ]
    chronicles_party_sources = [CHRONICLES_PARTY_BUILDER, CHRONICLES_PARTY_MODEL]
    assert normalize(chronicles_party_sources) == [CHRONICLES_PARTY_MODEL]
    pawn_slug_pow_sources = [PAWN_SLUG_POW_BLEND, PAWN_SLUG_POW_MODEL, PAWN_SLUG_POW_BUILDER]
    assert normalize(pawn_slug_pow_sources) == [PAWN_SLUG_OWNER]
    assert normalize(["scripts/unknown_visual_owner.py"]) == ["scripts/unknown_visual_owner.py"]
    print("app visual changed-file normalization self-test: OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    for path in normalize(sys.stdin.read().splitlines()):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
