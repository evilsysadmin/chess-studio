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

APP_SHELL = "frontend/src/App.jsx"
LEARNING_JOURNEY_OWNER = "frontend/src/useLearningJourneyFlow.js"
GLOBAL_SHELL_OWNER = "frontend/src/useGlobalShellUi.js"

# Exact App.jsx lines touched by the non-visual learning-journey ownership
# extraction. This is intentionally exact and fail-closed: formatting changes,
# JSX structure changes or any additional App line immediately wake the normal
# full visual classifier again.
NONVISUAL_LEARNING_APP_LINES = {
    "import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';",
    "import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';",
    "const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');",
    "const { puzzleLaunch, quickMatchLaunchNonce, openPuzzleMode, openDailyChallengeSlot, returnToQuickMatchFromPersonalTraining } = usePuzzleLaunchFlow({ navigateTo, resetNavigation });",
    "const { puzzleLaunch, quickMatchLaunchNonce, insightsLandingSection, openPuzzleMode, openPersonalTraining, openDailyChallengeSlot, openInsights, returnToQuickMatchFromPersonalTraining } = useLearningJourneyFlow({ navigateTo, resetNavigation });",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); openInsights('diagnosis'); }}>",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, setInsightsLandingSection }); }} /></React.Suspense>}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "onTrainPersonal={() => openPuzzleMode('personal', false)}",
    "onTrainPersonal={openPersonalTraining}",
    "onInsights={() => { setInsightsLandingSection('diagnosis'); navigateTo('insights'); }}",
    "onInsights={() => openInsights('diagnosis')}",
    "onProgress={() => { setInsightsLandingSection('career'); navigateTo('insights'); }}",
    "onProgress={() => openInsights('career')}",
}

NONVISUAL_GLOBAL_SHELL_APP_LINES = {
    "import React, { useEffect, useRef, useState } from 'react';",
    "import { LATEST_USER_NOTE_ID, USER_RELEASE_NOTES_KEY, openReleaseNoteTarget } from './userReleaseNotes.js';",
    "import { setProfileStorageItem } from './profileKeys.js';",
    "const [showRatingDetail, setShowRatingDetail] = useState(false);",
    "const [showCombatSummary, setShowCombatSummary] = useState(false);",
    "const [showSettings, setShowSettings] = useState(false);",
    "const [showGlobalAccount, setShowGlobalAccount] = useState(false);",
    "const [showGlobalReleaseNotes, setShowGlobalReleaseNotes] = useState(false);",
    "const [releaseNotesSeen, setReleaseNotesSeen] = useState(() => getStorageItem(STORAGE_LOCAL, USER_RELEASE_NOTES_KEY) === LATEST_USER_NOTE_ID);",
    "const [showGlobalFeedback, setShowGlobalFeedback] = useState(false);",
    "const [showAccountMenu, setShowAccountMenu] = useState(false);",
    "const accountMenuRef = useRef(null);",
    "const accountMenuButtonRef = useRef(null);",
    "if (!showAccountMenu) return undefined;",
    "function closeOnOutsidePointer(event) {",
    "if (!accountMenuRef.current?.contains(event.target)) setShowAccountMenu(false);",
    "function closeOnEscape(event) {",
    "if (event.key !== 'Escape') return;",
    "setShowAccountMenu(false);",
    "accountMenuButtonRef.current?.focus();",
    "document.addEventListener('pointerdown', closeOnOutsidePointer);",
    "document.addEventListener('keydown', closeOnEscape);",
    "return () => {",
    "document.removeEventListener('pointerdown', closeOnOutsidePointer);",
    "document.removeEventListener('keydown', closeOnEscape);",
    "}, [showAccountMenu]);",
    "onClick={() => setShowGlobalFeedback(true)}",
    "onClick={() => setShowAccountMenu((open) => !open)}",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setShowGlobalAccount(true); }}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-admin\" onClick={() => { setShowAccountMenu(false); navigateTo('admin'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); openInsights('diagnosis'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { setShowAccountMenu(false); setShowSettings(true); }}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-logout\" onClick={() => { setShowAccountMenu(false); void handleGlobalLogout(); }} disabled={loggingOut}>",
    "onClick={() => { setProfileStorageItem(USER_RELEASE_NOTES_KEY, LATEST_USER_NOTE_ID); setReleaseNotesSeen(true); setShowGlobalReleaseNotes(true); }}",
    "onCombatClick={() => setShowCombatSummary(true)}",
    "onRatingClick={() => setShowRatingDetail(true)}",
    "<RatingDetailModal rating={rating} onClose={() => setShowRatingDetail(false)} />",
    "onClose={() => setShowCombatSummary(false)}",
    "onOpenCombat={() => { setShowCombatSummary(false); navigateTo('roguelike'); }}",
    "{showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={() => setShowSettings(false)} onBoard3D={() => { setShowSettings(false); navigateTo('board3d'); }} />}",
    "{showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={() => setShowGlobalAccount(false)} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={() => setShowGlobalReleaseNotes(false)} onAction={(to) => { setShowGlobalReleaseNotes(false); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "{showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={() => setShowGlobalFeedback(false)} />}",
    "suppressHomeNudge={showSettings || showGlobalAccount || showGlobalReleaseNotes || showGlobalFeedback}",
    "onCustomize={() => setShowSettings(true)}",
    "import React, { useEffect, useState } from 'react';",
    "import { openReleaseNoteTarget } from './userReleaseNotes.js';",
    "import { useGlobalShellUi } from './useGlobalShellUi.js';",
    "const shellUi = useGlobalShellUi();",
    "showRatingDetail, openRatingDetail, closeRatingDetail, showCombatSummary, openCombatSummary, closeCombatSummary,",
    "showSettings, openSettings, closeSettings, showGlobalAccount, openGlobalAccount, closeGlobalAccount,",
    "showGlobalReleaseNotes, releaseNotesSeen, openReleaseNotes, closeReleaseNotes, showGlobalFeedback,",
    "openGlobalFeedback, closeGlobalFeedback, showAccountMenu, toggleAccountMenu, closeAccountMenu,",
    "accountMenuRef, accountMenuButtonRef, suppressHomeNudge,",
    "} = shellUi;",
    "onClick={openGlobalFeedback}",
    "onClick={toggleAccountMenu}",
    "<button type=\"button\" role=\"menuitem\" onClick={openGlobalAccount}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-admin\" onClick={() => { closeAccountMenu(); navigateTo('admin'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={() => { closeAccountMenu(); openInsights('diagnosis'); }}>",
    "<button type=\"button\" role=\"menuitem\" onClick={openSettings}>",
    "<button type=\"button\" role=\"menuitem\" className=\"masthead-account-menu-logout\" onClick={() => { closeAccountMenu(); void handleGlobalLogout(); }} disabled={loggingOut}>",
    "onClick={openReleaseNotes}",
    "onCombatClick={openCombatSummary}",
    "onRatingClick={openRatingDetail}",
    "<RatingDetailModal rating={rating} onClose={closeRatingDetail} />",
    "onClose={closeCombatSummary}",
    "onOpenCombat={() => { closeCombatSummary(); navigateTo('roguelike'); }}",
    "{showSettings && <UserSettingsPanel isAdminUser={isAdminUser} onClose={closeSettings} onBoard3D={() => { closeSettings(); navigateTo('board3d'); }} />}",
    "{showGlobalAccount && <AccountModal rating={rating} tournament={tournament} combatOverview={combatOverview} onClose={closeGlobalAccount} onLogout={() => void handleGlobalLogout()} loggingOut={loggingOut} />}",
    "{showGlobalReleaseNotes && <React.Suspense fallback={null}><UserReleaseNotesModal onClose={closeReleaseNotes} onAction={(to) => { closeReleaseNotes(); openReleaseNoteTarget(to, { navigateTo, openInsights }); }} /></React.Suspense>}",
    "{showGlobalFeedback && <FeedbackModal context={view === 'menu' ? 'Home' : `Global · ${view}`} onClose={closeGlobalFeedback} />}",
    "suppressHomeNudge={suppressHomeNudge}",
    "onCustomize={openSettings}",
}


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


def _git_diff_text(base_sha: str, head_sha: str, path: str) -> str | None:
    if not base_sha or not head_sha:
        return None
    try:
        return subprocess.check_output(
            ["git", "diff", "--unified=0", base_sha, head_sha, "--", path],
            text=True,
            stderr=subprocess.DEVNULL,
        )
    except (subprocess.CalledProcessError, OSError):
        return None


def _changed_source_lines(diff_text: str) -> list[str]:
    return [
        line[1:].strip()
        for line in diff_text.splitlines()
        if line[:1] in {"+", "-"} and not line.startswith(("+++", "---"))
    ]


def _is_nonvisual_learning_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_LEARNING_APP_LINES for line in changed_lines)


def _is_nonvisual_global_shell_app_diff(diff_text: str | None) -> bool:
    if not diff_text:
        return False
    changed_lines = _changed_source_lines(diff_text)
    return bool(changed_lines) and all(line in NONVISUAL_GLOBAL_SHELL_APP_LINES for line in changed_lines)


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
    lower_paths = {raw.strip().replace("\\", "/").lower() for raw in paths if raw.strip()}
    safe_learning_app = (
        LEARNING_JOURNEY_OWNER.lower() in lower_paths
        and _is_nonvisual_learning_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )
    safe_global_shell_app = (
        GLOBAL_SHELL_OWNER.lower() in lower_paths
        and _is_nonvisual_global_shell_app_diff(_git_diff_text(base_sha, head_sha, APP_SHELL))
    )

    def add(path: str) -> None:
        if path not in seen:
            seen.add(path)
            normalized.append(path)

    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        lower = path.lower()
        if lower == APP_SHELL.lower() and (safe_learning_app or safe_global_shell_app):
            # App.jsx is normally a global visual owner. Suppress it only for
            # the exact, audited navigation extraction above; any extra changed
            # App line fails closed and restores the canonical visual sweep.
            continue
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

    safe_learning_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';\n+import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';\n@@ -2 +1,0 @@\n-const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');\n"
    unsafe_learning_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import { usePuzzleLaunchFlow } from './usePuzzleLaunchFlow.js';\n+import { useLearningJourneyFlow } from './useLearningJourneyFlow.js';\n@@ -2 +1,0 @@\n-const [insightsLandingSection, setInsightsLandingSection] = useState('diagnosis');\n@@ -10 +10 @@\n-<main className=\"old-shell\">\n+<main className=\"new-shell\">\n"
    assert _is_nonvisual_learning_app_diff(safe_learning_diff)
    assert not _is_nonvisual_learning_app_diff(unsafe_learning_diff)
    assert not _is_nonvisual_learning_app_diff(None)

    safe_shell_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import React, { useEffect, useRef, useState } from 'react';\n+import React, { useEffect, useState } from 'react';\n@@ -2,0 +2 @@\n+import { useGlobalShellUi } from './useGlobalShellUi.js';\n"
    unsafe_shell_diff = "--- a/frontend/src/App.jsx\n+++ b/frontend/src/App.jsx\n@@ -1 +1 @@\n-import React, { useEffect, useRef, useState } from 'react';\n+import React, { useEffect, useState } from 'react';\n@@ -2,0 +2 @@\n+import { useGlobalShellUi } from './useGlobalShellUi.js';\n@@ -10 +10 @@\n-<main className=\"old-shell\">\n+<main className=\"new-shell\">\n"
    assert _is_nonvisual_global_shell_app_diff(safe_shell_diff)
    assert not _is_nonvisual_global_shell_app_diff(unsafe_shell_diff)
    assert not _is_nonvisual_global_shell_app_diff(None)

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
