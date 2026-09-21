#!/usr/bin/env python3
"""Classify the specialized browser matrix required by a Quality diff.

The workflow boundary owns diff reliability and uses --all as its fail-closed
fallback. This module owns only path -> browser-scope policy plus deterministic
matrix construction, so that policy is testable outside GitHub Actions YAML.
"""
from __future__ import annotations

import argparse
import fnmatch
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


@dataclass(frozen=True)
class BrowserScope:
    full_logic: bool = False
    special_states: bool = False
    visual: bool = False
    focus: bool = False
    matthias: bool = False
    matthias_home: bool = False
    matthias_insights: bool = False
    quick_2d: bool = False
    network_race: bool = False
    chronicles: bool = False
    render_budget: bool = False

    @classmethod
    def all(cls) -> "BrowserScope":
        # Broad Matthias already includes Home + War Room + Insights. Keep the
        # narrow specific bits false in the fail-closed aggregate to avoid
        # duplicating the same canaries.
        return cls(True, True, True, True, True, False, False, True, True, True, True)


FRONTEND_TEST_RE = re.compile(r"^frontend/src/.*\.(?:test|spec)\.(?:js|jsx|ts|tsx)$")
VISUAL_PATTERNS = (
    "frontend/src/components/WarRoomCastleArchitecture.js",
    "frontend/src/components/WarRoomPremiumPaintings.js",
    "frontend/src/components/WarRoomArchitectural*.js",
    "frontend/src/components/WarRoomPracticalLighting.js",
    "frontend/src/components/WarRoomPremiumFinishPass.js",
    "frontend/src/components/WarRoomTeutonicDecor.js",
    "frontend/src/components/PremiumWarRoomScene.js",
    "frontend/src/components/WarRoom3DAnimation.js",
    "frontend/src/components/Board3D*.css",
    "frontend/src/components/WarRoom3D*.css",
    "e2e/war-room-desktop-scale.spec.js",
)
FOCUS_PATTERNS = (
    "frontend/src/styles/19-game-focus.css",
    "e2e/android-game-focus.spec.js",
)
FULL_LOGIC_PATTERNS = (
    "frontend/src/components/Board3D.jsx",
    "frontend/src/components/Board3D*.js",
    "frontend/src/components/WarRoom3D*.js",
    "frontend/src/components/GameBoardView.jsx",
    "frontend/src/components/GameCommandDeck.jsx",
    "frontend/src/components/GamePlayerRail.jsx",
    "frontend/src/components/GameSideColumn.jsx",
    "frontend/src/components/GameStatusStrips.jsx",
    "frontend/src/components/GameWarRoomCommandColumn.jsx",
    "frontend/src/components/useGameBoardRenderer.js",
    "frontend/src/components/useGameMobileFocus.js",
    "frontend/src/components/useMatthiasBoardReactions.js",
    "frontend/src/warRoomPointerCapture.js",
    "frontend/src/main.jsx",
    "e2e/three-d-war-room.spec.js",
    "e2e/three-d-war-room-android-touch.spec.js",
    "e2e/helpers.js",
)
SPECIAL_STATE_PATTERNS = (
    "frontend/src/components/Board3D.jsx",
    "frontend/src/components/Board3D*.js",
    "frontend/src/components/WarRoom3D*.js",
    "frontend/src/components/GameBoardView.jsx",
    "frontend/src/components/useGameBoardRenderer.js",
    "e2e/three-d-war-room-special-states.spec.js",
    "e2e/three-d-special-surfaces.spec.js",
    "e2e/helpers.js",
)
QUICK_2D_PATTERNS = (
    "frontend/src/components/Board2D.jsx",
    "frontend/src/components/Game2DMobile.css",
    "frontend/src/components/QuickMatchModal.jsx",
    "frontend/src/components/MenuInner.jsx",
    "frontend/src/components/useGameBoardRenderer.js",
    "frontend/src/components/GameBoardView.jsx",
    "frontend/src/components/GameCommandDeck.jsx",
    "frontend/src/userPreferences.js",
    "frontend/src/styles/02-game-board.css",
    "frontend/src/styles/20-piece-skins.css",
    "frontend/src/styles/25-visual-coherence.css",
    "frontend/src/styles/28-product-resilience.css",
    "e2e/quick-match-2d.spec.js",
)
MATTHIAS_PATTERNS = (
    "frontend/src/components/Matthias*.jsx",
    "frontend/src/components/Matthias*.js",
    "frontend/src/components/Matthias*.css",
    "frontend/src/components/matthias*.jsx",
    "frontend/src/components/matthias*.js",
    "frontend/src/components/matthias*.css",
    "frontend/src/matthias*.js",
    "frontend/src/assets/matthias-*/*",
    "e2e/matthias-war-room-android-motion.spec.js",
)
MATTHIAS_HOME_PATTERNS = (
    "frontend/src/components/MatthiasPremiumHome3D.js",
    "e2e/matthias-home-visual-critical.spec.js",
)
MATTHIAS_INSIGHTS_PATTERNS = (
    "frontend/src/components/InsightsMatthiasMotion.jsx",
    "e2e/insights-matthias-motion.spec.js",
)
CHRONICLES_PATTERNS = (
    "frontend/src/chronicles/*",
    "frontend/src/chronicles*.js",
    "frontend/src/components/Chronicles*.jsx",
    "frontend/src/components/Chronicles*.js",
    "frontend/src/components/Chronicles*.css",
    "e2e/chronicles-of-matthias.spec.js",
    "e2e/chronicles-of-matthias-tactics.spec.js",
)
RENDER_BUDGET_PATTERNS = (
    "frontend/src/components/Board3DCore.jsx",
    "frontend/src/components/WarRoomRenderBudget.js",
    "frontend/src/components/WarRoom3DMotion.js",
    "e2e/war-room-render-budget.spec.js",
)
NETWORK_RACE_PATTERNS = (
    "frontend/src/useGameReconnect.js",
    "frontend/src/gameReconnect.js",
    "frontend/src/gameMutationCoordinator.js",
    "frontend/src/components/GameScreen.jsx",
    "e2e/offline-pending-move-reconnect.spec.js",
    "e2e/late-move-response-exit.spec.js",
)
BROWSER_ACTION_PATHS = {
    ".github/actions/setup-browser-e2e/action.yml",
    ".github/actions/cache-node-modules/action.yml",
}
CICD_WORKFLOW = ".github/workflows/cicd.yml"


def _clean_paths(paths: Iterable[str]) -> list[str]:
    cleaned: list[str] = []
    for raw in paths:
        path = raw.strip().replace("\\", "/")
        if not path:
            continue
        if path.startswith("/") or ".." in PurePosixPath(path).parts:
            raise ValueError(f"ruta de diff inválida: {raw!r}")
        cleaned.append(path)
    return cleaned


def _matches(path: str, patterns: tuple[str, ...]) -> bool:
    return any(fnmatch.fnmatchcase(path, pattern) for pattern in patterns)


def classify(paths: Iterable[str]) -> BrowserScope:
    full_logic = special_states = visual = focus = matthias = matthias_home = matthias_insights = quick_2d = network_race = chronicles = render_budget = False

    for path in _clean_paths(paths):
        if FRONTEND_TEST_RE.search(path):
            continue

        if _matches(path, VISUAL_PATTERNS):
            visual = True

        if _matches(path, FOCUS_PATTERNS):
            visual = True
            focus = True

        if _matches(path, FULL_LOGIC_PATTERNS):
            full_logic = True
            visual = True
            focus = True

        if _matches(path, SPECIAL_STATE_PATTERNS):
            special_states = True

        if _matches(path, QUICK_2D_PATTERNS):
            quick_2d = True

        if _matches(path, MATTHIAS_HOME_PATTERNS):
            matthias_home = True
        elif _matches(path, MATTHIAS_INSIGHTS_PATTERNS):
            matthias_insights = True
        elif _matches(path, MATTHIAS_PATTERNS):
            matthias = True

        if _matches(path, RENDER_BUDGET_PATTERNS):
            render_budget = True

        if _matches(path, NETWORK_RACE_PATTERNS):
            network_race = True

        if _matches(path, CHRONICLES_PATTERNS):
            chronicles = True

        if path in BROWSER_ACTION_PATHS:
            full_logic = special_states = visual = focus = matthias = quick_2d = network_race = chronicles = render_budget = True
            matthias_home = matthias_insights = False

        if path == CICD_WORKFLOW:
            visual = True
            quick_2d = True

    return BrowserScope(
        full_logic, special_states, visual, focus, matthias, matthias_home, matthias_insights, quick_2d, network_race, chronicles, render_budget
    )


def build_matrix(scope: BrowserScope) -> dict[str, list[dict[str, str]]]:
    cases: list[dict[str, str]] = []
    if scope.full_logic:
        cases.extend(
            [
                {
                    "id": "hans-fire-call",
                    "label": "War Room · Hans waits for the rendered call",
                    "command": "./node_modules/.bin/playwright test war-room-hans-fire-call.spec.js --workers=1 --retries=0",
                },
                {
                    "id": "android-selection",
                    "label": "War Room · Android selection",
                    "command": "./node_modules/.bin/playwright test three-d-war-room-android-touch.spec.js --workers=1 --retries=0",
                },
                {
                    "id": "desktop-input",
                    "label": "War Room · desktop input",
                    "command": "./node_modules/.bin/playwright test three-d-war-room.spec.js --grep \"War Room · desktop input mantiene cámara fija y juega e2→e4\" --workers=1 --retries=0 --timeout=75000",
                },
            ]
        )
    if scope.render_budget:
        cases.append(
            {
                "id": "war-room-motion-budget",
                "label": "War Room · sustained move render budget",
                "command": "./node_modules/.bin/playwright test war-room-render-budget.spec.js --grep \"una jugada real queda dentro del presupuesto de render sostenido\" --workers=1 --retries=0 --timeout=120000",
            }
        )
    if scope.special_states:
        cases.extend(
            [
                {
                    "id": "special-surfaces",
                    "label": "3D parity · special surfaces",
                    "command": "./node_modules/.bin/playwright test three-d-special-surfaces.spec.js --workers=1 --retries=0 --timeout=90000",
                },
                {
                    "id": "special-state-canaries",
                    "label": "War Room · special-state canaries",
                    # Required CI proves three distinct renderer-sensitive contracts:
                    # endgame transition, promotion UI/piece replacement and WebGL
                    # lifecycle under repeated Android visibility/rotation changes.
                    # Check/castling/en-passant remain in the full browser sweep.
                    "command": "./node_modules/.bin/playwright test three-d-war-room-special-states.spec.js --grep \"jaque mate|promoción 3D|sobrevive rotación\" --workers=1 --retries=0 --timeout=120000",
                },
            ]
        )
    if scope.visual:
        cases.append(
            {
                "id": "desktop-scale",
                "label": "War Room · desktop board scale",
                "command": "./node_modules/.bin/playwright test war-room-desktop-scale.spec.js --workers=1 --retries=0 --timeout=75000",
            }
        )
    if scope.focus:
        cases.append(
            {
                "id": "android-focus",
                "label": "War Room · Android Focus",
                "command": "./node_modules/.bin/playwright test android-game-focus.spec.js --workers=1 --retries=0 --timeout=30000",
            }
        )
    if scope.matthias:
        cases.extend(
            [
                {
                    "id": "matthias-home-motion",
                    "label": "Matthias · Home motion",
                    "command": "./node_modules/.bin/playwright test matthias-home-visual-critical.spec.js --workers=1 --retries=0 --timeout=75000",
                },
                {
                    "id": "matthias-war-room",
                    "label": "Matthias · War Room Android",
                    "command": "./node_modules/.bin/playwright test matthias-war-room-android-motion.spec.js --workers=1 --retries=0",
                },
                {
                    "id": "matthias-insights",
                    "label": "Matthias · Así juegas motion",
                    "command": "./node_modules/.bin/playwright test insights-matthias-motion.spec.js --workers=1 --retries=0",
                },
            ]
        )
    if scope.matthias_home and not scope.matthias:
        cases.append(
            {
                "id": "matthias-home-motion",
                "label": "Matthias · Home motion",
                "command": "./node_modules/.bin/playwright test matthias-home-visual-critical.spec.js --workers=1 --retries=0 --timeout=75000",
            }
        )
    if scope.matthias_insights and not scope.matthias:
        cases.append(
            {
                "id": "matthias-insights",
                "label": "Matthias · Así juegas motion",
                "command": "./node_modules/.bin/playwright test insights-matthias-motion.spec.js --workers=1 --retries=0",
            }
        )
    if scope.quick_2d:
        cases.append(
            {
                "id": "quick-match-2d",
                "label": "Quick Match · mobile 2D continuity",
                "command": "./node_modules/.bin/playwright test quick-match-2d.spec.js --workers=1 --retries=0 --timeout=75000",
            }
        )
    if scope.network_race:
        cases.append(
            {
                "id": "game-network-races",
                "label": "Game network · reconnect and late response",
                "command": "./node_modules/.bin/playwright test offline-pending-move-reconnect.spec.js late-move-response-exit.spec.js --workers=1 --retries=0 --timeout=75000",
            }
        )
    if scope.chronicles:
        cases.append(
            {
                "id": "chronicles",
                "label": "Chronicles · gameplay + WebGL canaries",
                # Keep the required lane focused on renderer integration plus one real
                # Tactics state transition. Progression, disclosure and responsive
                # contracts remain in cheaper frontend/full-browser coverage; the
                # required lane must still prove that Tactics can actually move.
                "command": "./node_modules/.bin/playwright test chronicles-of-matthias.spec.js chronicles-of-matthias-tactics.spec.js --grep \"arranca como action RPG isométrico|abre una cripta Three\\.js real|arranca como RPG táctico isométrico\" --workers=1 --retries=0 --timeout=90000",
            }
        )
    return {"include": cases}


def output_lines(scope: BrowserScope) -> list[str]:
    matrix = build_matrix(scope)
    rendered = json.dumps(matrix, ensure_ascii=False, separators=(",", ":"))
    return [
        f"matrix={rendered}",
        f"has_cases={'true' if matrix['include'] else 'false'}",
    ]


def render_summary(scope: BrowserScope) -> str:
    yn = lambda value: "true" if value else "false"
    return "\n".join(
        [
            "### Required specialized browser scope",
            "",
            f"- War Room rules/input parity: `{yn(scope.full_logic)}`",
            f"- War Room special-state parity: `{yn(scope.special_states)}`",
            f"- War Room mount/scale: `{yn(scope.visual)}`",
            f"- Android Focus: `{yn(scope.focus)}`",
            f"- Matthias shared motion/paint: `{yn(scope.matthias)}`",
            f"- Matthias Home-only: `{yn(scope.matthias_home)}`",
            f"- Matthias Insights-only: `{yn(scope.matthias_insights)}`",
            f"- Quick Match mobile 2D: `{yn(scope.quick_2d)}`",
            f"- Game network races: `{yn(scope.network_race)}`",
            f"- Chronicles dungeon: `{yn(scope.chronicles)}`",
            f"- War Room sustained render budget: `{yn(scope.render_budget)}`",
            "- Estas lanes forman parte del check requerido Tests · Playwright.",
            "",
        ]
    )


def _ids(scope: BrowserScope) -> list[str]:
    return [case["id"] for case in build_matrix(scope)["include"]]


def self_test() -> None:
    assert classify([]) == BrowserScope()
    assert classify(["frontend/src/components/WarRoomPracticalLighting.js"]) == BrowserScope(visual=True)
    assert _ids(classify(["frontend/src/styles/19-game-focus.css"])) == ["desktop-scale", "android-focus"]
    assert classify(["frontend/src/components/Board3DParity.test.js"]) == BrowserScope()
    assert classify(["frontend/src/warRoomPointerCapture.test.js"]) == BrowserScope()
    assert classify(["frontend/src/components/MatthiasAvatar.spec.jsx"]) == BrowserScope()
    assert classify(["e2e/war-room-render-budget.spec.js"]) == BrowserScope(render_budget=True)
    assert _ids(classify(["e2e/war-room-render-budget.spec.js"])) == ["war-room-motion-budget"]

    full = classify(["frontend/src/components/Board3DRenderer.js"])
    assert full == BrowserScope(full_logic=True, special_states=True, visual=True, focus=True)
    assert _ids(full) == [
        "hans-fire-call", "android-selection", "desktop-input",
        "special-surfaces", "special-state-canaries", "desktop-scale", "android-focus",
    ]

    chrome = classify(["frontend/src/components/GamePlayerRail.jsx"])
    assert chrome == BrowserScope(full_logic=True, visual=True, focus=True)
    assert _ids(chrome) == ["hans-fire-call", "android-selection", "desktop-input", "desktop-scale", "android-focus"]

    direct_special = classify(["e2e/three-d-war-room-special-states.spec.js"])
    assert direct_special == BrowserScope(special_states=True)
    assert _ids(direct_special) == ["special-surfaces", "special-state-canaries"]
    special_canary = build_matrix(direct_special)["include"][1]
    assert "jaque mate" in special_canary["command"]
    assert "promoción 3D" in special_canary["command"]
    assert "sobrevive rotación" in special_canary["command"]

    assert _ids(classify(["frontend/src/components/MatthiasAvatar.jsx"])) == [
        "matthias-home-motion", "matthias-war-room", "matthias-insights",
    ]
    assert classify(["frontend/src/components/MatthiasPremiumHome3D.js"]) == BrowserScope(matthias_home=True)
    assert _ids(classify(["frontend/src/components/MatthiasPremiumHome3D.js"])) == ["matthias-home-motion"]
    assert _ids(classify(["e2e/matthias-home-visual-critical.spec.js"])) == ["matthias-home-motion"]
    assert classify(["frontend/src/components/InsightsMatthiasMotion.jsx"]) == BrowserScope(matthias_insights=True)
    assert _ids(classify(["frontend/src/components/InsightsMatthiasMotion.jsx"])) == ["matthias-insights"]
    assert _ids(classify(["e2e/insights-matthias-motion.spec.js"])) == ["matthias-insights"]
    assert _ids(classify(["frontend/src/components/QuickMatchModal.jsx"])) == ["quick-match-2d"]
    assert _ids(classify(["frontend/src/useGameReconnect.js"])) == ["game-network-races"]
    assert _ids(classify(["frontend/src/components/GameScreen.jsx"])) == ["game-network-races"]
    assert _ids(classify(["e2e/offline-pending-move-reconnect.spec.js"])) == ["game-network-races"]
    assert _ids(classify(["e2e/late-move-response-exit.spec.js"])) == ["game-network-races"]
    for chronicles_path in (
        "frontend/src/chronicles/chroniclesMapCatalog.js",
        "frontend/src/chronicles/chroniclesContentRuntime.js",
        "frontend/src/chronicles/maps/crypt-eight-squares.json",
        "frontend/src/chroniclesOfMatthias.js",
        "frontend/src/chroniclesOfMatthiasDungeonArt.js",
        "frontend/src/chroniclesPartyFootprint.js",
        "frontend/src/chroniclesEnemyMotionArt.js",
        "frontend/src/components/ChroniclesOfMatthias.jsx",
        "frontend/src/components/ChroniclesOfMatthias.css",
        "e2e/chronicles-of-matthias.spec.js",
        "e2e/chronicles-of-matthias-tactics.spec.js",
    ):
        assert _ids(classify([chronicles_path])) == ["chronicles"]

    chronicles_case = build_matrix(BrowserScope(chronicles=True))["include"][0]
    assert "chronicles-of-matthias.spec.js" in chronicles_case["command"]
    assert "chronicles-of-matthias-tactics.spec.js" in chronicles_case["command"]
    assert "arranca como action RPG isométrico" in chronicles_case["command"]
    assert "abre una cripta Three\\.js real" in chronicles_case["command"]
    assert "arranca como RPG táctico isométrico" in chronicles_case["command"]

    all_scope = classify([".github/actions/setup-browser-e2e/action.yml"])
    assert all_scope == BrowserScope.all()
    assert len(_ids(all_scope)) == 14

    harness = classify([".github/workflows/cicd.yml"])
    assert harness == BrowserScope(visual=True, quick_2d=True)
    assert _ids(harness) == ["desktop-scale", "quick-match-2d"]

    combined = classify([
        "frontend/src/components/GameBoardView.jsx",
        "frontend/src/components/MatthiasAvatar.jsx",
    ])
    assert combined == BrowserScope(
        full_logic=True,
        special_states=True,
        visual=True,
        focus=True,
        matthias=True,
        quick_2d=True,
    )

    assert output_lines(BrowserScope()) == ['matrix={"include":[]}', "has_cases=false"]
    assert "War Room special-state parity: `true`" in render_summary(BrowserScope(special_states=True))
    assert "War Room mount/scale: `true`" in render_summary(BrowserScope(visual=True))
    assert "Matthias Home-only: `true`" in render_summary(BrowserScope(matthias_home=True))
    assert "Matthias Insights-only: `true`" in render_summary(BrowserScope(matthias_insights=True))
    assert "Game network races: `true`" in render_summary(BrowserScope(network_race=True))
    assert "Chronicles dungeon: `true`" in render_summary(BrowserScope(chronicles=True))
    assert "War Room sustained render budget: `true`" in render_summary(BrowserScope(render_budget=True))

    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("browser_quality_scope debe rechazar rutas fuera del repo")

    print("browser-quality-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="habilita toda la matriz (fallback fail-closed)")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--github-output", help="ruta de GITHUB_OUTPUT")
    parser.add_argument("--summary", help="ruta de GITHUB_STEP_SUMMARY")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    scope = BrowserScope.all() if args.all else classify(sys.stdin.read().splitlines())
    rendered = "\n".join(output_lines(scope)) + "\n"
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as fh:
            fh.write(rendered)
    else:
        sys.stdout.write(rendered)

    if args.summary:
        with Path(args.summary).open("a", encoding="utf-8") as fh:
            fh.write(render_summary(scope))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())