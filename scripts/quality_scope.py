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
    "regression-state", "regression-school", "learning-golden", "learning-observation", "smoke",
)
CORE_E2E_FIELDS = {lane: f"run_e2e_{lane.replace('-', '_')}" for lane in CORE_E2E_LANES}


@dataclass
class Scope:
    run_frontend: bool = False
    run_backend: bool = False
    run_e2e: bool = False
    run_security: bool = False
    run_pawn_slug_e2e: bool = False
    run_chesscom_e2e: bool = False
    run_trailblazer_e2e: bool = False
    run_matthias_home_e2e: bool = False
    run_e2e_regression_state: bool = False
    run_e2e_regression_school: bool = False
    run_e2e_learning_golden: bool = False
    run_e2e_learning_observation: bool = False
    run_e2e_smoke: bool = False

    @classmethod
    def all(cls) -> "Scope":
        return cls(**{field.name: True for field in fields(cls)})

    def lines(self) -> list[str]:
        lines = [f"{field.name}={'true' if getattr(self, field.name) else 'false'}" for field in fields(self)]
        lanes = [lane for lane in CORE_E2E_LANES if getattr(self, CORE_E2E_FIELDS[lane])]
        lines.append(f"core_e2e_matrix={json.dumps({'lane': lanes}, separators=(',', ':'))}")
        return lines


GLOBAL_HARNESS_PATHS = {
    ".github/workflows/cicd.yml", "Makefile", "scripts/pr_merge_diff.py", "scripts/quality_scope.py",
}
FRONTEND_HARNESS_PATHS = {"scripts/frontend_test_groups.mjs", "scripts/run_frontend_test_group.mjs"}
NODE_HARNESS_PATHS = {".github/actions/cache-node-modules/action.yml"}
BACKEND_HARNESS_PATHS = {".github/actions/cache-python-venv/action.yml"}
BROWSER_HARNESS_PATHS = {".github/actions/setup-browser-e2e/action.yml", "scripts/run_core_e2e_lane.py"}
PACKAGE_METADATA_PATH = "frontend/package.json"

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
ADMIN_SMOKE_RE = re.compile(
    r"^frontend/src/admin[^/]*\.js$|"
    r"^frontend/src/components/(?:Admin|Observability)[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/useAdmin[^/]*\.js$"
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
    r"trivy_[^/]*|install_trivy\.sh)$|^(?:infra|deploy)/|^render\.ya?ml$"
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


def classify(paths: Iterable[str]) -> Scope:
    changed = _clean_paths(paths)
    if any(path in GLOBAL_HARNESS_PATHS for path in changed):
        return Scope.all()

    scope = Scope()
    for path in changed:
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
                # Script/metadata-only package changes still prove build/preview
                # via smoke, but do not need the four unrelated core journeys.
                _enable_core_e2e(scope, ("smoke",))
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
            if ADMIN_SMOKE_RE.search(path):
                _enable_core_e2e(scope, ("smoke",))
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
    _expect_core([PACKAGE_METADATA_PATH], lanes=("smoke",), run_frontend=True)
    _expect_core(["frontend/src/App.jsx"], run_frontend=True)
    _expect(["frontend/src/activeGameSession.test.js"], run_frontend=True)
    _expect(["frontend/src/components/Chesscom.test.jsx"], run_frontend=True)
    _expect_core(["frontend/src/components/AdminDashboardContent.jsx"], lanes=("smoke",), run_frontend=True)
    _expect_core(["frontend/src/components/useAdminFeedbackController.js"], lanes=("smoke",), run_frontend=True)
    _expect_core(["frontend/src/adminDashboardInsights.js"], lanes=("smoke",), run_frontend=True)
    _expect_core(["frontend/src/components/AdminDashboardContent.jsx", "frontend/src/App.jsx"], run_frontend=True)
    _expect(["frontend/src/components/Board3DRenderer.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoom3DAnimation.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoomPracticalLighting.js"], run_frontend=True)
    _expect_core(["frontend/src/components/GameBoardView.jsx"], run_frontend=True)
    _expect(["frontend/src/styles/28-product-resilience.css"], run_frontend=True)
    _expect(["frontend/src/assets/home-canonical/great-hall-dungeon.webp"], run_frontend=True)
    _expect(["backend-python/game_api.py"], run_backend=True)
    _expect(["backend-python/requirements.txt"], run_backend=True, run_security=True)
    _expect(["e2e/pawn-slug.spec.js"], run_pawn_slug_e2e=True)
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

    assert json.loads(dict(line.split("=", 1) for line in classify([PACKAGE_METADATA_PATH]).lines())["core_e2e_matrix"]) == {"lane": ["smoke"]}
    assert classify([".github/workflows/cicd.yml"]) == Scope.all()
    assert classify(["Makefile"]) == Scope.all()
    assert classify(["scripts/pr_merge_diff.py"]) == Scope.all()
    assert classify(["scripts/quality_scope.py"]) == Scope.all()

    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("quality_scope debe rechazar rutas fuera del repo")

    print("quality-scope self-test OK · package metadata/Admin pagan smoke; producto general conserva core completo")


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
