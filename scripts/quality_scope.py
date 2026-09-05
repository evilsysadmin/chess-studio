#!/usr/bin/env python3
"""Classify which expensive Quality gates a PR actually needs.

The classifier is deliberately fail-closed at the workflow boundary: callers use
--all when the diff cannot be trusted. Here we keep pure path -> gate logic small,
reviewable and self-tested instead of duplicating regex policy in workflow YAML.
"""
from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass, fields
from pathlib import PurePosixPath
from typing import Iterable


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

    @classmethod
    def all(cls) -> "Scope":
        return cls(**{field.name: True for field in fields(cls)})

    def lines(self) -> list[str]:
        return [f"{field.name}={'true' if getattr(self, field.name) else 'false'}" for field in fields(self)]


# Changes to the Quality harness itself must exercise every lane because they can
# alter selection, setup or aggregation globally. Other workflow/tooling changes
# are validated by static-preflight and their own dedicated workflows.
FULL_HARNESS_PATHS = {
    ".github/workflows/cicd.yml",
    ".github/actions/setup-browser-e2e/action.yml",
    ".github/actions/cache-node-modules/action.yml",
    ".github/actions/cache-python-venv/action.yml",
    "Makefile",
    "scripts/quality_scope.py",
    "scripts/frontend_test_groups.mjs",
    "scripts/run_frontend_test_group.mjs",
    "scripts/test_entrypoint_parity.py",
    "scripts/test_suite_audit.mjs",
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

TARGETED_E2E = {
    "e2e/pawn-slug.spec.js": "run_pawn_slug_e2e",
    "e2e/chesscom.spec.js": "run_chesscom_e2e",
    "e2e/pawn-trailblazer.spec.js": "run_trailblazer_e2e",
    "e2e/matthias-home-priority.spec.js": "run_matthias_home_e2e",
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
        # Reject traversal-like input rather than accidentally classifying a path
        # outside the repository namespace.
        if path.startswith("/") or ".." in PurePosixPath(path).parts:
            raise ValueError(f"ruta de diff inválida: {raw!r}")
        cleaned.append(path)
    return cleaned


def classify(paths: Iterable[str]) -> Scope:
    changed = _clean_paths(paths)
    if any(path in FULL_HARNESS_PATHS for path in changed):
        return Scope.all()

    scope = Scope()
    for path in changed:
        if SECURITY_RE.search(path):
            scope.run_security = True

        if path.startswith("frontend/"):
            scope.run_frontend = True
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
            if not targeted:
                scope.run_e2e = True
            continue

        if path.startswith("backend-python/"):
            scope.run_backend = True
            scope.run_e2e = True
            continue

        if path.startswith("e2e/"):
            if path in E2E_SHARED:
                scope.run_e2e = True
                scope.run_pawn_slug_e2e = True
                scope.run_chesscom_e2e = True
                scope.run_trailblazer_e2e = True
                scope.run_matthias_home_e2e = True
            elif path in TARGETED_E2E:
                setattr(scope, TARGETED_E2E[path], True)
            else:
                scope.run_e2e = True

    return scope


def _expect(paths: list[str], **expected: bool) -> None:
    result = classify(paths)
    actual = {field.name: getattr(result, field.name) for field in fields(result)}
    wanted = {name: False for name in actual}
    wanted.update(expected)
    assert actual == wanted, f"{paths}: esperado {wanted}, obtenido {actual}"


def self_test() -> None:
    _expect(
        ["frontend/src/components/Chesscom.jsx"],
        run_frontend=True,
        run_chesscom_e2e=True,
    )
    _expect(
        ["frontend/src/components/Chesscom.jsx", "frontend/src/App.jsx"],
        run_frontend=True,
        run_e2e=True,
        run_chesscom_e2e=True,
    )
    _expect(
        ["frontend/package-lock.json"],
        run_frontend=True,
        run_e2e=True,
        run_security=True,
    )
    _expect(
        ["backend-python/game_api.py"],
        run_backend=True,
        run_e2e=True,
    )
    _expect(
        ["backend-python/requirements.txt"],
        run_backend=True,
        run_e2e=True,
        run_security=True,
    )
    _expect(["e2e/pawn-slug.spec.js"], run_pawn_slug_e2e=True)
    _expect(
        ["e2e/helpers.js"],
        run_e2e=True,
        run_pawn_slug_e2e=True,
        run_chesscom_e2e=True,
        run_trailblazer_e2e=True,
        run_matthias_home_e2e=True,
    )
    _expect(["infra/cloudflare/main.tf"], run_security=True)
    _expect(["Dockerfile"], run_security=True)
    _expect(["scripts/npm_audit_gate.py"], run_security=True)

    # Tooling/deploy workflow edits are already exercised by static-preflight or
    # their own workflow. They must not wake unrelated product/browser suites.
    _expect([".github/workflows/production-promote.yml"])
    _expect([".github/workflows/e2e-full.yml"])
    _expect(["scripts/release_consistency_check.mjs"])
    _expect([".githooks/pre-push"])

    assert classify([".github/workflows/cicd.yml"]) == Scope.all()
    assert classify(["Makefile"]) == Scope.all()
    assert classify(["scripts/quality_scope.py"]) == Scope.all()

    try:
        classify(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("quality_scope debe rechazar rutas fuera del repo")

    print("quality-scope self-test OK · producto dirigido; harness full; tooling/infra no despiertan browsers ajenos")


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
