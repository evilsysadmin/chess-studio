#!/usr/bin/env python3
"""Classify which expensive Quality gates a PR needs from its changed paths."""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, fields
from pathlib import PurePosixPath
from typing import Iterable

CORE_E2E_LANES = (
    "regression-state", "regression-school", "learning-golden", "learning-observation",
    "app-boot", "admin", "tournament", "combat", "home", "smoke",
)
CORE_E2E_FIELDS = {lane: f"run_e2e_{lane.replace('-', '_')}" for lane in CORE_E2E_LANES}


@dataclass
class Scope:
    run_frontend: bool = False
    run_backend: bool = False
    run_e2e: bool = False
    run_security: bool = False
    run_pawn_slug_godot: bool = False
    run_pawn_slug_e2e: bool = False
    run_chesscom_e2e: bool = False
    run_trailblazer_e2e: bool = False
    run_matthias_home_e2e: bool = False
    run_e2e_regression_state: bool = False
    run_e2e_regression_school: bool = False
    run_e2e_learning_golden: bool = False
    run_e2e_learning_observation: bool = False
    run_e2e_app_boot: bool = False
    run_e2e_admin: bool = False
    run_e2e_tournament: bool = False
    run_e2e_combat: bool = False
    run_e2e_home: bool = False
    run_e2e_smoke: bool = False

    @classmethod
    def all(cls) -> "Scope":
        return cls(**{field.name: True for field in fields(cls)})

    def lines(self) -> list[str]:
        lines = [f"{field.name}={'true' if getattr(self, field.name) else 'false'}" for field in fields(self)]
        redundant_lanes = set()
        if self.run_e2e_smoke:
            redundant_lanes.update(("app-boot", "tournament", "combat"))
        if self.run_e2e_regression_state:
            redundant_lanes.update(("admin", "home"))
        lanes = [
            lane for lane in CORE_E2E_LANES
            if getattr(self, CORE_E2E_FIELDS[lane]) and lane not in redundant_lanes
        ]
        lines.append(f"core_e2e_matrix={json.dumps({'lane': lanes}, separators=(',', ':'))}")
        return lines


QUALITY_SCOPE_PATH = "scripts/quality_scope.py"
GLOBAL_HARNESS_PATHS = {
    ".github/workflows/cicd.yml", "Makefile", "scripts/pr_merge_diff.py",
}
FRONTEND_HARNESS_PATHS = {"scripts/frontend_test_groups.mjs", "scripts/run_frontend_test_group.mjs"}
NODE_HARNESS_PATHS = {".github/actions/cache-node-modules/action.yml"}
BACKEND_HARNESS_PATHS = {".github/actions/cache-python-venv/action.yml"}
BROWSER_HARNESS_PATHS = {".github/actions/setup-browser-e2e/action.yml", "scripts/run_core_e2e_lane.py"}
PACKAGE_METADATA_PATH = "frontend/package.json"

PAWN_SLUG_GODOT_PATHS = {
    ".github/workflows/pawn-slug-godot-web.yml",
    ".github/workflows/cicd.yml",
    "scripts/pawn_slug_godot_bundle.py",
    "scripts/pawn_slug_godot_2d_gate.py",
    "scripts/pawn_slug_enemy_roster_gate.py",
    "scripts/pawn_slug_godot_live_smoke.mjs",
    "scripts/apply_frontend_csp.mjs",
}
PAWN_SLUG_RE = re.compile(
    r"^frontend/src/pawnSlug[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/PawnSlug[^/]*\.(?:js|jsx|css)$|"
    r"^frontend/src/assets/pawnSlug/"
)
CHESSCOM_RE = re.compile(
    r"^frontend/src/chesscom[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/Chesscom[^/]*\.(?:js|jsx|css)$|"
    r"^frontend/public/chesscom/"
)
TRAILBLAZER_RE = re.compile(
    r"^frontend/src/pawnTrailblazer[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/PawnTrailblazer[^/]*\.(?:js|jsx|css)$|"
    r"^frontend/src/assets/pawnTrailblazer/"
)
MATTHIAS_HOME_RE = re.compile(r"^frontend/src/components/MatthiasPremiumHome3D\.js$")
FRONTEND_TEST_RE = re.compile(r"^frontend/src/.*\.(?:test|spec)\.(?:js|jsx|ts|tsx)$")
CORE_E2E_RE = re.compile(
    r"^frontend/src/.*\.(?:js|jsx|ts|tsx)$|"
    r"^frontend/(?:index\.html|vite\.config\.(?:js|mjs|ts)|package-lock\.json)$"
)
ADMIN_BROWSER_RE = re.compile(
    r"^frontend/src/admin[^/]*\.js$|"
    r"^frontend/src/components/(?:Admin|Observability)[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/useAdmin[^/]*\.js$"
)
AUDIO_APP_BOOT_RE = re.compile(
    r"^frontend/src/(?:ambient[^/]*|audio[^/]*|orchestral[^/]*|sound[^/]*|useAuthenticatedAudio)\.js$"
)
TOURNAMENT_BROWSER_RE = re.compile(r"^frontend/src/tournament\.js$")
QUICK_2D_CORE_RE = re.compile(r"^frontend/src/components/(?:QuickMatchModal|Board2D)\.jsx$")
NETWORK_RACE_CORE_RE = re.compile(r"^frontend/src/(?:useGameReconnect|gameReconnect|gameMutationCoordinator)\.js$")
CHRONICLES_CORE_RE = re.compile(
    r"^frontend/src/chronicles(?:/.*|[^/]*)\.(?:js|jsx|json)$|"
    r"^frontend/src/components/Chronicles[^/]*\.(?:js|jsx)$"
)
COMBAT_DOMAIN_RE = re.compile(r"^frontend/src/combat[^/]*\.js$")
COMBAT_COMPONENT_RE = re.compile(r"^frontend/src/components/Combat[^/]*\.(?:js|jsx)$")
MATTHIAS_SCHOOL_RE = re.compile(r"^frontend/src/matthiasSchool\.js$")
HOME_BROWSER_RE = re.compile(
    r"^frontend/src/components/(?:Home[^/]*|IllustratedHome[^/]*)\.(?:js|jsx|css)$|"
    r"^frontend/src/(?:home[^/]*|illustratedHome[^/]*)\.(?:js|jsx|css)$"
)
DEDICATED_3D_BROWSER_RE = re.compile(
    r"^frontend/src/components/(?:Board3D|WarRoom3D)[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/(?:WarRoomCastleArchitecture|WarRoomPremiumPaintings|"
    r"WarRoomArchitectural[^/]*|WarRoomPracticalLighting|WarRoomPremiumFinishPass|"
    r"WarRoomTeutonicDecor|PremiumWarRoomScene)\.js$"
)
TARGETED_E2E = {
    "e2e/pawn-slug.spec.js": "run_pawn_slug_e2e",
    "e2e/chesscom.spec.js": "run_chesscom_e2e",
    "e2e/pawn-trailblazer.spec.js": "run_trailblazer_e2e",
    "e2e/matthias-home-priority.spec.js": "run_matthias_home_e2e",
}
CORE_E2E_SPEC_LANES = {
    "e2e/regression-journeys.spec.js": ("regression-state", "regression-school"),
    "e2e/regression-journeys-core.js": ("regression-state", "regression-school"),
    "e2e/learning-golden-path.spec.js": ("learning-golden",),
    "e2e/learning-second-observation.spec.js": ("learning-observation",),
    "e2e/smoke.spec.js": ("smoke",),
    "e2e/mobile-final-interactions.spec.js": ("smoke",),
}
E2E_SHARED = {"e2e/helpers.js", "e2e/playwright.config.js", "e2e/playwright.config.mjs"}
SECURITY_RE = re.compile(
    r"(^|/)(?:Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore)$|"
    r"^compose\.ya?ml$|^frontend/package-lock\.json$|"
    r"^backend-python/requirements[^/]*\.txt$|^\.trivy(?:ignore|\.ya?ml)?$|"
    r"^scripts/(?:npm_audit_gate\.py|pip_audit_report\.py|compose_smoke\.py|security[^/]*|"
    r"trivy_[^/]*|install_trivy\.sh)$|^infra/(?:oci|cloudflare|terraform)/|^deploy/|^render\.ya?ml$"
)


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


def _enable_core_e2e(scope: Scope, lanes: Iterable[str] = CORE_E2E_LANES) -> None:
    scope.run_e2e = True
    for lane in lanes:
        try:
            field_name = CORE_E2E_FIELDS[lane]
        except KeyError as exc:
            raise ValueError(f"lane E2E core desconocida: {lane}") from exc
        setattr(scope, field_name, True)


def _classifier_harness_scope() -> Scope:
    scope = Scope()
    _enable_core_e2e(scope, ("app-boot",))
    return scope


def classify(paths: Iterable[str]) -> Scope:
    changed = _clean_paths(paths)
    if any(path in GLOBAL_HARNESS_PATHS for path in changed):
        return Scope.all()

    scope = _classifier_harness_scope() if QUALITY_SCOPE_PATH in changed else Scope()
    for path in changed:
        if path == QUALITY_SCOPE_PATH:
            continue
        if path.startswith("games/pawn-slug-godot/") or path in PAWN_SLUG_GODOT_PATHS:
            scope.run_pawn_slug_godot = True
        if path in FRONTEND_HARNESS_PATHS:
            scope.run_frontend = True
            continue
        if path in NODE_HARNESS_PATHS:
            scope.run_frontend = True
            _enable_core_e2e(scope)
            continue
        if path in BACKEND_HARNESS_PATHS:
            scope.run_backend = True
            continue
        if path in BROWSER_HARNESS_PATHS:
            _enable_core_e2e(scope)
            continue

        if SECURITY_RE.search(path):
            scope.run_security = True

        if path.startswith("frontend/"):
            scope.run_frontend = True
            if FRONTEND_TEST_RE.search(path):
                continue
            if path == PACKAGE_METADATA_PATH:
                _enable_core_e2e(scope, ("app-boot",))
                continue

            targeted = False
            for pattern, field_name in (
                (PAWN_SLUG_RE, "run_pawn_slug_e2e"),
                (CHESSCOM_RE, "run_chesscom_e2e"),
                (TRAILBLAZER_RE, "run_trailblazer_e2e"),
                (MATTHIAS_HOME_RE, "run_matthias_home_e2e"),
            ):
                if pattern.search(path):
                    setattr(scope, field_name, True)
                    targeted = True

            if targeted:
                continue
            if (
                AUDIO_APP_BOOT_RE.search(path)
                or QUICK_2D_CORE_RE.search(path)
                or NETWORK_RACE_CORE_RE.search(path)
                or CHRONICLES_CORE_RE.search(path)
            ):
                _enable_core_e2e(scope, ("app-boot",))
            elif MATTHIAS_SCHOOL_RE.search(path):
                _enable_core_e2e(scope, ("regression-school",))
            elif COMBAT_DOMAIN_RE.search(path) or COMBAT_COMPONENT_RE.search(path):
                _enable_core_e2e(scope, ("combat",))
            elif HOME_BROWSER_RE.search(path):
                _enable_core_e2e(scope, ("home",))
            elif TOURNAMENT_BROWSER_RE.search(path):
                _enable_core_e2e(scope, ("tournament",))
            elif ADMIN_BROWSER_RE.search(path):
                _enable_core_e2e(scope, ("admin",))
            elif CORE_E2E_RE.search(path) and not DEDICATED_3D_BROWSER_RE.search(path):
                _enable_core_e2e(scope)
            continue

        if path.startswith("backend-python/"):
            scope.run_backend = True
            continue

        if path.startswith("e2e/"):
            if path in E2E_SHARED:
                _enable_core_e2e(scope)
                for field_name in TARGETED_E2E.values():
                    setattr(scope, field_name, True)
            elif path in TARGETED_E2E:
                setattr(scope, TARGETED_E2E[path], True)
            elif path in CORE_E2E_SPEC_LANES:
                _enable_core_e2e(scope, CORE_E2E_SPEC_LANES[path])
            else:
                _enable_core_e2e(scope)

    return scope


def _expect(paths: list[str], **expected: bool) -> None:
    actual = {field.name: getattr(classify(paths), field.name) for field in fields(Scope)}
    wanted = {name: False for name in actual}
    wanted.update(expected)
    assert actual == wanted, f"{paths}: esperado {wanted}, obtenido {actual}"


def _expect_core(paths: list[str], lanes: Iterable[str] = CORE_E2E_LANES, **expected: bool) -> None:
    expected["run_e2e"] = True
    for lane in lanes:
        expected[CORE_E2E_FIELDS[lane]] = True
    _expect(paths, **expected)


def self_test() -> None:
    _expect(["frontend/src/components/Chesscom.jsx"], run_frontend=True, run_chesscom_e2e=True)
    _expect_core(["frontend/src/components/Chesscom.jsx", "frontend/src/App.jsx"], run_frontend=True, run_chesscom_e2e=True)
    _expect_core(["frontend/package-lock.json"], run_frontend=True, run_security=True)
    _expect_core([PACKAGE_METADATA_PATH], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/App.jsx"], run_frontend=True)
    _expect(["frontend/src/activeGameSession.test.js"], run_frontend=True)
    _expect(["frontend/src/components/Chesscom.test.jsx"], run_frontend=True)
    for audio_path in (
        "frontend/src/sound.js",
        "frontend/src/soundFx.js",
        "frontend/src/ambientCatalog.js",
        "frontend/src/ambientProfilesLegacy.js",
        "frontend/src/ambientEnergyProduction.js",
        "frontend/src/ambientClassicalProduction.js",
        "frontend/src/ambientElectronicProduction.js",
        "frontend/src/audioContext.js",
        "frontend/src/orchestralSampler.js",
        "frontend/src/useAuthenticatedAudio.js",
    ):
        _expect_core([audio_path], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/sound.js", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/tournament.js"], lanes=("tournament",), run_frontend=True)
    _expect_core(["frontend/src/tournament.js", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/QuickMatchModal.jsx"], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/components/Board2D.jsx"], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/components/QuickMatchModal.jsx", "frontend/src/App.jsx"], run_frontend=True)
    for reconnect_path in (
        "frontend/src/useGameReconnect.js",
        "frontend/src/gameReconnect.js",
        "frontend/src/gameMutationCoordinator.js",
    ):
        _expect_core([reconnect_path], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/useGameReconnect.js", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/GameScreen.jsx"], run_frontend=True)
    for chronicles_path in (
        "frontend/src/chronicles/chroniclesMapCatalog.js",
        "frontend/src/chronicles/chroniclesContentRuntime.js",
        "frontend/src/chronicles/maps/crypt-eight-squares.json",
        "frontend/src/chroniclesOfMatthias.js",
        "frontend/src/chroniclesOfMatthiasDungeonArt.js",
        "frontend/src/chroniclesPartyFootprint.js",
        "frontend/src/chroniclesEnemyMotionArt.js",
        "frontend/src/components/ChroniclesOfMatthias.jsx",
        "frontend/src/components/ChroniclesTacticalMargin.jsx",
    ):
        _expect_core([chronicles_path], lanes=("app-boot",), run_frontend=True)
    _expect_core(["frontend/src/components/ChroniclesOfMatthias.jsx", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/combatBosses.js"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/combatDeployment.js"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/combatSession.js"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/combatBosses.js", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/CombatMarket.jsx"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/components/CombatDeploymentView.jsx"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/components/CombatDebrief.jsx"], lanes=("combat",), run_frontend=True)
    _expect_core(["frontend/src/components/CombatMarket.jsx", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/matthiasSchool.js"], lanes=("regression-school",), run_frontend=True)
    _expect_core(["frontend/src/matthiasSchool.js", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/AdminDashboardContent.jsx"], lanes=("admin",), run_frontend=True)
    _expect_core(["frontend/src/components/useAdminFeedbackController.js"], lanes=("admin",), run_frontend=True)
    _expect_core(["frontend/src/adminDashboardInsights.js"], lanes=("admin",), run_frontend=True)
    _expect_core(["frontend/src/components/AdminDashboardContent.jsx", "frontend/src/App.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/HomeCastle3D.jsx"], lanes=("home",), run_frontend=True)
    _expect_core(["frontend/src/components/IllustratedHome.jsx"], lanes=("home",), run_frontend=True)
    _expect_core(["frontend/src/components/HomePvpRosterLink.css"], lanes=("home",), run_frontend=True)
    _expect_core(["frontend/src/components/HomeIllustratedMobileCanonical.css"], lanes=("home",), run_frontend=True)
    _expect_core(["frontend/src/homeCastleProgress.js"], lanes=("home",), run_frontend=True)
    _expect_core(["frontend/src/components/HomeCastle3D.jsx", "frontend/src/App.jsx"], run_frontend=True)
    _expect(["frontend/src/components/Board3DRenderer.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoom3DAnimation.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoomPracticalLighting.js"], run_frontend=True)
    _expect_core(["frontend/src/components/GameBoardView.jsx"], run_frontend=True)
    _expect(["frontend/src/styles/28-product-resilience.css"], run_frontend=True)
    _expect(["frontend/src/assets/home-canonical/great-hall-dungeon.webp"], run_frontend=True)
    _expect(["backend-python/game_api.py"], run_backend=True)
    _expect(["backend-python/requirements.txt"], run_backend=True, run_security=True)
    _expect(["e2e/pawn-slug.spec.js"], run_pawn_slug_e2e=True)
    _expect(["games/pawn-slug-godot/scripts/player.gd"], run_pawn_slug_godot=True)
    _expect(["scripts/pawn_slug_godot_2d_gate.py"], run_pawn_slug_godot=True)
    _expect(["scripts/pawn_slug_enemy_roster_gate.py"], run_pawn_slug_godot=True)
    _expect(["scripts/apply_frontend_csp.mjs"], run_pawn_slug_godot=True)
    _expect([".github/workflows/pawn-slug-godot-web.yml"], run_pawn_slug_godot=True)
    _expect_core(
        ["e2e/helpers.js"],
        run_pawn_slug_e2e=True,
        run_chesscom_e2e=True,
        run_trailblazer_e2e=True,
        run_matthias_home_e2e=True,
    )
    _expect_core(["e2e/regression-journeys.spec.js"], lanes=("regression-state", "regression-school"))
    _expect_core(["e2e/learning-golden-path.spec.js"], lanes=("learning-golden",))
    _expect_core(["e2e/learning-second-observation.spec.js"], lanes=("learning-observation",))
    _expect_core(["e2e/smoke.spec.js"], lanes=("smoke",))
    _expect_core(["e2e/new-critical-journey.spec.js"])
    _expect(["infra/cloudflare/main.tf"], run_security=True)
    _expect(["infra/oci/staging/main.tf"], run_security=True)
    _expect(["infra/terraform/main.tf"], run_security=True)
    _expect(["Dockerfile"], run_security=True)
    _expect(["scripts/npm_audit_gate.py"], run_security=True)

    for tooling_path in (
        ".github/workflows/production-promote.yml", ".github/workflows/e2e-full.yml",
        "scripts/release_consistency_check.mjs", ".githooks/pre-push",
        "scripts/test_entrypoint_parity.py", "scripts/test_suite_audit.mjs",
    ):
        _expect([tooling_path])

    _expect(["scripts/frontend_test_groups.mjs"], run_frontend=True)
    _expect(["scripts/run_frontend_test_group.mjs"], run_frontend=True)
    _expect([".github/actions/cache-python-venv/action.yml"], run_backend=True)
    _expect_core([".github/actions/cache-node-modules/action.yml"], run_frontend=True)
    _expect_core([".github/actions/setup-browser-e2e/action.yml"])
    _expect_core(["scripts/run_core_e2e_lane.py"])

    assert json.loads(dict(line.split("=", 1) for line in classify([PACKAGE_METADATA_PATH]).lines())["core_e2e_matrix"]) == {"lane": ["app-boot"]}
    generic_matrix = json.loads(dict(line.split("=", 1) for line in classify(["frontend/src/App.jsx"]).lines())["core_e2e_matrix"])["lane"]
    assert "smoke" in generic_matrix and "app-boot" not in generic_matrix and "combat" not in generic_matrix
    assert json.loads(dict(line.split("=", 1) for line in Scope.all().lines())["core_e2e_matrix"])["lane"] == [
        "regression-state", "regression-school", "learning-golden", "learning-observation", "smoke",
    ]
    assert json.loads(dict(line.split("=", 1) for line in classify(["frontend/src/tournament.js"]).lines())["core_e2e_matrix"]) == {"lane": ["tournament"]}
    assert json.loads(dict(line.split("=", 1) for line in classify(["frontend/src/combatBosses.js"]).lines())["core_e2e_matrix"]) == {"lane": ["combat"]}
    assert json.loads(dict(line.split("=", 1) for line in classify(["frontend/src/matthiasSchool.js"]).lines())["core_e2e_matrix"]) == {"lane": ["regression-school"]}
    assert json.loads(dict(line.split("=", 1) for line in classify(["frontend/src/adminDashboardInsights.js"]).lines())["core_e2e_matrix"]) == {"lane": ["admin"]}
    assert classify([".github/workflows/cicd.yml"]) == Scope.all()
    assert classify(["Makefile"]) == Scope.all()
    assert classify(["scripts/pr_merge_diff.py"]) == Scope.all()

    _expect_core([QUALITY_SCOPE_PATH], lanes=("app-boot",))
    classifier_matrix = json.loads(dict(line.split("=", 1) for line in classify([QUALITY_SCOPE_PATH]).lines())["core_e2e_matrix"])["lane"]
    assert classifier_matrix == ["app-boot"]
    _expect_core(
        [QUALITY_SCOPE_PATH, "frontend/src/components/Chesscom.jsx"],
        lanes=("app-boot",),
        run_frontend=True,
        run_chesscom_e2e=True,
    )
    _expect_core([QUALITY_SCOPE_PATH, "backend-python/game_api.py"], lanes=("app-boot",), run_backend=True)
    _expect_core([QUALITY_SCOPE_PATH, "Dockerfile"], lanes=("app-boot",), run_security=True)
    _expect_core([QUALITY_SCOPE_PATH, "frontend/src/App.jsx"], run_frontend=True)

    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("quality_scope debe rechazar rutas fuera del repo")

    print("quality-scope self-test OK · Chronicles/reconnect/Quick2D usan core mínimo; superficies transversales siguen fail-closed")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="habilita todos los gates (fallback fail-closed)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    scope = Scope.all() if args.all else classify(sys.stdin.read().splitlines())
    sys.stdout.write("\n".join(scope.lines()) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())