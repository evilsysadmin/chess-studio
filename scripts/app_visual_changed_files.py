#!/usr/bin/env python3
"""Normalize changed paths into their real app-visual ownership inputs.

The visual classifiers intentionally fail safe on unknown paths. Generated art can
have source files outside their normal trigger surface, though, and those source
paths should inherit the ownership of the runtime asset they produce rather than
expanding one focused art change to every visual producer.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

MATTHIAS_MODEL = "frontend/public/models/matthias-home-canonical.glb"
MATTHIAS_BLEND = "frontend/art-source/matthias-home-canonical.blend"
CHRONICLES_PARTY_MODEL = "frontend/public/models/chronicles-tactics-party.glb"
CHRONICLES_PARTY_BUILDER = "scripts/blender/build_chronicles_tactics_party.py"
PAWN_SLUG_OWNER = "frontend/src/components/PawnSlugGodotHost.jsx"
PAWN_SLUG_POW_MODEL = "frontend/public/models/pawn-slug/pawn_slug_pow_squad_v1.glb"
PAWN_SLUG_POW_BLEND = "art/blender/pawn-slug/pawn_slug_pow_squad_v1.blend"
PAWN_SLUG_POW_BUILDER = "scripts/blender/build_pawn_slug_pows.py"
R2_MANIFEST = "frontend/src/assets/r2-assets-manifest.json"
PVP_DUEL_MANIFEST_ASSET = "pvp.duelRoom.runtime"
PVP_DUEL_VISUAL_OWNER = "frontend/src/components/PvpDuelRoomShell.js"


def _is_matthias_canonical_owner(path: str) -> bool:
    lower = path.lower().replace("\\", "/")
    return (
        lower == MATTHIAS_MODEL
        or lower == MATTHIAS_BLEND
        or lower == "frontend/art-source/matthias-home-canonical-reference.txt"
        or lower == "frontend/art-source/matthias-home-canonical-reference.webp"
        or lower == "scripts/blender/build_home_matthias.py"
        or lower == "scripts/blender/validate_home_matthias_contract.py"
        or lower.startswith("scripts/blender/home_matthias_")
    )


def _manifest_asset_from_text(text: str, logical_id: str):
    try:
        payload = json.loads(text)
    except (TypeError, json.JSONDecodeError):
        return None
    assets = payload.get("assets") if isinstance(payload, dict) else None
    if not isinstance(assets, dict):
        return None
    value = assets.get(logical_id)
    return value if isinstance(value, dict) else None


def _git_show_text(revision: str, path: str) -> str | None:
    if not revision:
        return None
    try:
        return subprocess.check_output(
            ["git", "show", f"{revision}:{path}"],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError):
        return None


def _manifest_asset_changed(base_sha: str, head_sha: str, logical_id: str) -> bool:
    before = _git_show_text(base_sha, R2_MANIFEST)
    after = _git_show_text(head_sha, R2_MANIFEST)
    if before is None or after is None:
        return False
    return _manifest_asset_from_text(before, logical_id) != _manifest_asset_from_text(after, logical_id)


def _is_app_visual_e2e(path: str) -> bool:
    """Keep only E2E files that the app-visual workflow itself owns."""
    lower = path.lower().replace("\\", "/")
    if not lower.startswith("e2e/"):
        return False
    name = lower.rsplit("/", 1)[-1]
    return (
        ("visual" in name and name.endswith(".spec.js"))
        or (name.startswith("browser-") and name.endswith("-health.spec.js"))
    )


def normalize(
    paths: list[str],
    *,
    base_sha: str = "",
    head_sha: str = "",
) -> list[str]:
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
        if lower == R2_MANIFEST and _manifest_asset_changed(base_sha, head_sha, PVP_DUEL_MANIFEST_ASSET):
            # Manifest promotions normally own no pixels. Duel Room is different:
            # runtime consumption is pinned to the promoted immutable object, so
            # changing this logical asset must wake the PvP Duel Room browser proof.
            add(PVP_DUEL_VISUAL_OWNER)
            continue
        # A push may contain functional E2E changes alongside one real visual
        # owner. Those functional specs are not part of this workflow's trigger
        # surface and must not turn a focused capture into the fail-closed full
        # visual suite. Visual/health E2E files remain explicit owners.
        if lower.startswith("e2e/") and not _is_app_visual_e2e(path):
            continue
        if _is_matthias_canonical_owner(path):
            # Canonical Home Matthias changes are validated by the dedicated
            # Home Matthias visual producer. Chronicles owns its authored avatar
            # separately and must not wake for Home-only pawn geometry changes.
            add(MATTHIAS_MODEL)
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
        "scripts/blender/validate_home_matthias_contract.py",
        "frontend/art-source/matthias-home-canonical-reference.txt",
        "frontend/art-source/matthias-home-canonical-reference.webp",
    ]
    assert normalize(matthias_sources) == [MATTHIAS_MODEL]
    assert normalize(["frontend/src/App.css", *matthias_sources]) == [
        "frontend/src/App.css",
        MATTHIAS_MODEL,
    ]
    chronicles_party_sources = [CHRONICLES_PARTY_BUILDER, CHRONICLES_PARTY_MODEL]
    assert normalize(chronicles_party_sources) == [CHRONICLES_PARTY_MODEL]
    pawn_slug_pow_sources = [PAWN_SLUG_POW_BLEND, PAWN_SLUG_POW_MODEL, PAWN_SLUG_POW_BUILDER]
    assert normalize(pawn_slug_pow_sources) == [PAWN_SLUG_OWNER]
    assert normalize(["scripts/unknown_visual_owner.py"]) == ["scripts/unknown_visual_owner.py"]

    manifest_before = json.dumps({
        "assets": {
            PVP_DUEL_MANIFEST_ASSET: {"sha256": "old", "bytes": 1},
            "home.scene.runtime": {"sha256": "same"},
        }
    })
    manifest_after = json.dumps({
        "assets": {
            PVP_DUEL_MANIFEST_ASSET: {"sha256": "new", "bytes": 2},
            "home.scene.runtime": {"sha256": "same"},
        }
    })
    assert _manifest_asset_from_text(manifest_before, PVP_DUEL_MANIFEST_ASSET)["sha256"] == "old"
    assert _manifest_asset_from_text(manifest_after, PVP_DUEL_MANIFEST_ASSET)["sha256"] == "new"
    assert _manifest_asset_from_text("not-json", PVP_DUEL_MANIFEST_ASSET) is None

    # Functional browser tests can travel in the same commit as a visual owner,
    # but app-visual does not own them and must not fail closed to every surface.
    assert normalize([
        "e2e/chronicles-of-matthias-tactics.spec.js",
        "frontend/src/chroniclesTacticsTurnMode.js",
    ]) == ["frontend/src/chroniclesTacticsTurnMode.js"]
    assert normalize(["e2e/regression-journeys.spec.js"]) == []

    # Visual artifacts and browser-health specs are explicit workflow owners and
    # therefore must survive normalization unchanged.
    for owned_e2e in (
        "e2e/chronicles-tactics-visual-artifact.spec.js",
        "e2e/app-visual-artifact.spec.js",
        "e2e/browser-runtime-health.spec.js",
        "e2e/browser-storage-health.spec.js",
    ):
        assert normalize([owned_e2e]) == [owned_e2e]

    print("app visual changed-file normalization self-test: OK")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)
    if args.self_test:
        self_test()
        return 0
    base_sha = os.environ.get("APP_VISUAL_BASE_SHA", "")
    head_sha = os.environ.get("APP_VISUAL_HEAD_SHA", "")
    for path in normalize(
        sys.stdin.read().splitlines(),
        base_sha=base_sha,
        head_sha=head_sha,
    ):
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
