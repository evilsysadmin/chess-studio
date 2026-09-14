#!/usr/bin/env python3
"""Classify which expensive Quality gates a PR actually needs.

The classifier is deliberately fail-closed at the workflow boundary: callers use
--all when the diff cannot be trusted. Here we keep pure path -> gate logic small,
reviewable and self-tested instead of duplicating regex policy in workflow YAML.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, fields
from pathlib import PurePosixPath
from typing import Iterable


CORE_E2E_LANES = ("regression", "learning-golden", "learning-observation", "smoke")
CORE_E2E_FIELDS = {
    "regression": "run_e2e_regression",
    "learning-golden": "run_e2e_learning_golden",
    "learning-observation": "run_e2e_learning_observation",
    "smoke": "run_e2e_smoke",
}


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
    run_e2e_regression: bool = False
    run_e2e_learning_golden: bool = False
    run_e2e_learning_observation: bool = False
    run_e2e_smoke: bool = False

    @classmethod
    def all(cls) -> "Scope":
        return cls(**{field.name: True for field in fields(cls)})

    def lines(self) -> list[str]:
        output = [f"{field.name}={'true' if getattr(self, field.name) else 'false'}" for field in fields(self)]
        matrix = {
            "lane": [lane for lane in CORE_E2E_LANES if getattr(self, CORE_E2E_FIELDS[lane])],
        }
        output.append(f"core_e2e_matrix={json.dumps(matrix, separators=(',', ':'))}")
        return output


# Only files that can alter global Quality selection/commands wake every lane.
# Supporting harness pieces are scoped to the runtime they can actually affect;
# pure auditors are already exercised by the always-on contracts job.
GLOBAL_HARNESS_PATHS = {
    ".github/workflows/cicd.yml",
    "Makefile",
    "scripts/quality_scope.py",
}
FRONTEND_HARNESS_PATHS = {
    "scripts/frontend_test_groups.mjs",
    "scripts/run_frontend_test_group.mjs",
}
NODE_HARNESS_PATHS = {
    ".github/actions/cache-node-modules/action.yml",
}
BACKEND_HARNESS_PATHS = {
    ".github/actions/cache-python-venv/action.yml",
}
BROWSER_HARNESS_PATHS = {
    ".github/actions/setup-browser-e2e/action.yml",
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

# Core browser journeys validate behaviour and persistence, not pixels. Pure CSS
# and art changes still run the frontend suite plus the app/specialized visual
# workflows; waking the ~multi-minute generic regression lane for them only burns
# runner time without exercising a code path they can change.
CORE_E2E_RE = re.compile(
    r"^frontend/src/.*\.(?:js|jsx|ts|tsx)$|"
    r"^frontend/(?:index\.html|vite\.config\.(?:js|mjs|ts)|package(?:-lock)?\.json)$"
)

# War Room renderer/paint modules have a dedicated browser matrix that exercises
# 3D input, special states, scale and Android focus. Running the generic
# login/admin/school regression journey as well is expensive duplication.
DEDICATED_3D_BROWSER_RE = re.compile(
    r"^frontend/src/components/(?:Board3D|WarRoom3D)[^/]*\.(?:js|jsx)$|"
    r"^frontend/src/components/(?:WarRoomCastleArchitecture|WarRoomPremiumPaintings|WarRoomArchitectural[^/]*|WarRoomPracticalLighting|WarRoomPremiumFinishPass|WarRoomTeutonicDecor|PremiumWarRoomScene)\.js$"
)

TARGETED_E2E = {
    "e2e/pawn-slug.spec.js": "run_pawn_slug_e2e",
    "e2e/chesscom.spec.js": "run_chesscom_e2e",
    "e2e/pawn-trailblazer.spec.js": "run_trailblazer_e2e",
    "e2e/matthias-home-priority.spec.js": "run_matthias_home_e2e",
}
CORE_E2E_SPEC_LANES = {
    "e2e/regression-journeys.spec.js": "regression",
    "e2e/regression-journeys-core.js": "regression",
    "e2e/learning-golden-path.spec.js": "learning-golden",
    "e2e/learning-second-observation.spec.js": "learning-observation",
    "e2e/smoke.spec.js": "smoke",
    "e2e/mobile-final-interactions.spec.js": "smoke",
}
E2E_SHARED = {
    "e2e/helpers.js",
    "e2e/playwright.config.js",
    "e2e/playwright.config.mjs",
}

SECURITY_RE = re.compile(
    r"(^|/)(?:Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore)$|"
    r"^compose\.ya?ml$|"
    r"^frontend/package(?:-lock)?\.json$|"
    r"^backend-python/requirements[^/]*\.txt$|"
    r"^\.trivy(?:ignore|\.ya?ml)?$|"
    r"^scripts/(?:npm_audit_gate\.py|pip_audit_report\.py|compose_smoke\.py|security[^/]*|trivy_[^/]*|install_trivy\.sh)$|"
    r"^(?:infra|deploy)/|"
    r"^render\.ya?ml$"
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
        field_name = CORE_E2E_FIELDS.get(lane)
        if field_name is None:
            raise ValueError(f"lane E2E core desconocida: {lane}")
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
            targeted = False
            if PAWN_SLUG_RE.search(path):
                scope.run_pawn_slug_e2e = True
                targeted = True
            if CHESSCOM_RE.search(path):
                scope.run_chesscom_e2e = True
                targeted = True
            if TRAILBLAZER_RE.search(path):
                scope.run_trailblazer_e2e = True
                targeted = True
            if MATTHIAS_HOME_RE.search(path):
                scope.run_matthias_home_e2e = True
                targeted = True
            if not targeted and CORE_E2E_RE.search(path) and not DEDICATED_3D_BROWSER_RE.search(path):
                _enable_core_e2e(scope)
            continue

        if path.startswith("backend-python/"):
            # Core Playwright journeys intercept the API with mockApi/page.route,
            # so they cannot validate a changed Python backend. Backend smoke +
            # integration/API tests are the authoritative gate for this surface.
            scope.run_backend = True
            continue

        if path.startswith("e2e/"):
            if path in E2E_SHARED:
                _enable_core_e2e(scope)
                scope.run_pawn_slug_e2e = True
                scope.run_chesscom_e2e = True
                scope.run_trailblazer_e2e = True
                scope.run_matthias_home_e2e = True
            elif path in TARGETED_E2E:
                setattr(scope, TARGETED_E2E[path], True)
            elif path in CORE_E2E_SPEC_LANES:
                _enable_core_e2e(scope, (CORE_E2E_SPEC_LANES[path],))
            else:
                # Unknown browser tests fail closed to the complete core matrix.
                _enable_core_e2e(scope)

    return scope


def _expect(paths: list[str], **expected: bool) -> None:
    result = classify(paths)
    actual = {field.name: getattr(result, field.name) for field in fields(result)}
    wanted = {name: False for name in actual}
    wanted.update(expected)
    assert actual == wanted, f"{paths}: esperado {wanted}, obtenido {actual}"


def _expect_core(paths: list[str], lanes: Iterable[str] = CORE_E2E_LANES, **expected: bool) -> None:
    expected["run_e2e"] = True
    for lane in lanes:
        expected[CORE_E2E_FIELDS[lane]] = True
    _expect(paths, **expected)


def self_test() -> None:
    _expect(
        ["frontend/src/components/Chesscom.jsx"],
        run_frontend=True,
        run_chesscom_e2e=True,
    )
    _expect_core(
        ["frontend/src/components/Chesscom.jsx", "frontend/src/App.jsx"],
        run_frontend=True,
        run_chesscom_e2e=True,
    )
    _expect_core(
        ["frontend/package-lock.json"],
        run_frontend=True,
        run_security=True,
    )
    _expect_core(["frontend/src/App.jsx"], run_frontend=True)
    _expect(["frontend/src/activeGameSession.test.js"], run_frontend=True)
    _expect(["frontend/src/components/Chesscom.test.jsx"], run_frontend=True)
    _expect_core(
        ["frontend/src/activeGameSession.test.js", "frontend/src/App.jsx"],
        run_frontend=True,
    )
    _expect(["frontend/src/components/Board3DRenderer.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoom3DAnimation.js"], run_frontend=True)
    _expect(["frontend/src/components/WarRoomPracticalLighting.js"], run_frontend=True)
    _expect_core(["frontend/src/components/GameBoardView.jsx"], run_frontend=True)
    _expect_core(
        ["frontend/src/components/Board3DRenderer.js", "frontend/src/App.jsx"],
        run_frontend=True,
    )
    _expect(["frontend/src/styles/28-product-resilience.css"], run_frontend=True)
    _expect(["frontend/src/assets/home-canonical/great-hall-dungeon.webp"], run_frontend=True)
    _expect(["frontend/public/home-canonical.webp"], run_frontend=True)
    _expect_core(
        ["frontend/src/styles/28-product-resilience.css", "frontend/src/App.jsx"],
        run_frontend=True,
    )
    _expect(["backend-python/game_api.py"], run_backend=True)
    _expect(
        ["backend-python/requirements.txt"],
        run_backend=True,
        run_security=True,
    )
    _expect(["e2e/pawn-slug.spec.js"], run_pawn_slug_e2e=True)
    _expect_core(
        ["e2e/helpers.js"],
        run_pawn_slug_e2e=True,
        run_chesscom_e2e=True,
        run_trailblazer_e2e=True,
        run_matthias_home_e2e=True,
    )
    _expect_core(["e2e/regression-journeys.spec.js"], lanes=("regression",))
    _expect_core(["e2e/regression-journeys-core.js"], lanes=("regression",))
    _expect_core(["e2e/learning-golden-path.spec.js"], lanes=("learning-golden",))
    _expect_core(["e2e/learning-second-observation.spec.js"], lanes=("learning-observation",))
    _expect_core(["e2e/smoke.spec.js"], lanes=("smoke",))
    _expect_core(["e2e/mobile-final-interactions.spec.js"], lanes=("smoke",))
    _expect_core(["e2e/new-critical-journey.spec.js"])
    _expect(["infra/cloudflare/main.tf"], run_security=True)
    _expect(["Dockerfile"], run_security=True)
    _expect(["scripts/npm_audit_gate.py"], run_security=True)

    # Tooling/deploy workflow edits are already exercised by static-preflight or
    # their own workflow. They must not wake unrelated product/browser suites.
    _expect([".github/workflows/production-promote.yml"])
    _expect([".github/workflows/e2e-full.yml"])
    _expect(["scripts/release_consistency_check.mjs"])
    _expect([".githooks/pre-push"])
    _expect(["scripts/test_entrypoint_parity.py"])
    _expect(["scripts/test_suite_audit.mjs"])

    # Harness pieces pay only for the runtime they can change.
    _expect(["scripts/frontend_test_groups.mjs"], run_frontend=True)
    _expect(["scripts/run_frontend_test_group.mjs"], run_frontend=True)
    _expect([".github/actions/cache-python-venv/action.yml"], run_backend=True)
    _expect_core(
        [".github/actions/cache-node-modules/action.yml"],
        run_frontend=True,
    )
    _expect_core([".github/actions/setup-browser-e2e/action.yml"])

    golden = classify(["e2e/learning-golden-path.spec.js"])
    outputs = dict(line.split("=", 1) for line in golden.lines())
    assert json.loads(outputs["core_e2e_matrix"]) == {"lane": ["learning-golden"]}

    assert classify([".github/workflows/cicd.yml"]) == Scope.all()
    assert classify(["Makefile"]) == Scope.all()
    assert classify(["scripts/quality_scope.py"]) == Scope.all()

    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("quality_scope debe rechazar rutas fuera del repo")

    print("quality-scope self-test OK · producto usa core completo; specs críticos pagan sólo su lane; auditoría/harness siguen fail-closed")


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
