#!/usr/bin/env python3
"""Decide whether a PR needs the heavyweight canonical visual capture."""
from __future__ import annotations

import argparse
import fnmatch
import sys
from pathlib import Path, PurePosixPath
from typing import Iterable


TRIGGER_PATTERNS = (
    "frontend/src/**/*.jsx",
    "frontend/src/**/*.css",
    "frontend/src/components/**",
    "frontend/src/assets/**",
    "frontend/public/**",
    "e2e/*visual*.spec.js",
    "e2e/browser-*-health.spec.js",
    "scripts/app_visual_*",
    "scripts/war_room_visual_freeze_check.mjs",
    ".github/actions/app-visual-pipeline/**",
    ".github/workflows/app-visual-artifact.yml",
)
EXCLUDED_TRIGGER_PATTERNS = (
    "frontend/src/**/*.test.js",
    "frontend/src/**/*.test.jsx",
)

# These surfaces have their own browser gates and are not present in the
# canonical Home/War Room capture. Building/capturing the canonical app for a
# PR that only changes one of them is pure duplication.
ISOLATED_PATTERNS = (
    "frontend/src/pawnSlug*.js",
    "frontend/src/pawnSlug*.jsx",
    "frontend/src/components/PawnSlug*.js",
    "frontend/src/components/PawnSlug*.jsx",
    "frontend/src/components/PawnSlug*.css",
    "frontend/src/assets/pawnSlug/**",
    "frontend/src/chesscom*.js",
    "frontend/src/chesscom*.jsx",
    "frontend/src/components/Chesscom*.js",
    "frontend/src/components/Chesscom*.jsx",
    "frontend/src/components/Chesscom*.css",
    "frontend/public/chesscom/**",
    "e2e/chesscom*visual*.spec.js",
    "frontend/src/pawnTrailblazer*.js",
    "frontend/src/pawnTrailblazer*.jsx",
    "frontend/src/components/PawnTrailblazer*.js",
    "frontend/src/components/PawnTrailblazer*.jsx",
    "frontend/src/components/PawnTrailblazer*.css",
    "frontend/src/assets/pawnTrailblazer/**",
)

# Release identity changes can accompany an isolated feature PR, but do not
# alter any pixels captured by the canonical visual artifact.
NEUTRAL_PATTERNS = ("frontend/public/release.json",)


def _clean(paths: Iterable[str]) -> list[str]:
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


def triggered_paths(paths: Iterable[str]) -> list[str]:
    result: list[str] = []
    for path in _clean(paths):
        if _matches(path, EXCLUDED_TRIGGER_PATTERNS):
            continue
        if _matches(path, TRIGGER_PATTERNS):
            result.append(path)
    return result


def should_run(paths: Iterable[str]) -> bool:
    triggered = triggered_paths(paths)
    relevant = [path for path in triggered if not _matches(path, NEUTRAL_PATTERNS)]
    if not relevant:
        return False
    return any(not _matches(path, ISOLATED_PATTERNS) for path in relevant)


def self_test() -> None:
    assert not should_run(["frontend/src/components/PawnSlugScene.jsx"])
    assert not should_run(["frontend/src/chesscomImport.js", "frontend/public/release.json", "README.md"])
    assert not should_run(["frontend/src/assets/pawnTrailblazer/matthias.webp"])
    assert not should_run(["frontend/src/components/Foo.test.jsx"])
    assert should_run(["frontend/src/components/PawnSlugScene.jsx", "frontend/src/components/MenuInner.jsx"])
    assert should_run(["frontend/src/components/Board3DRenderer.js"])
    assert should_run(["frontend/src/styles/25-visual-coherence.css"])
    assert should_run(["frontend/public/home-canonical.webp"])
    assert should_run([".github/actions/app-visual-pipeline/action.yml"])
    assert should_run(["scripts/app_visual_scope.py"])
    assert not should_run(["README.md", "RELEASE.txt"])
    try:
        should_run(["../outside"])
    except ValueError:
        pass
    else:
        raise AssertionError("app_visual_scope debe rechazar rutas fuera del repo")
    print("app-visual-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--github-output")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    run = should_run(sys.stdin.read().splitlines())
    line = f"run={'true' if run else 'false'}\n"
    if args.github_output:
        with Path(args.github_output).open("a", encoding="utf-8") as fh:
            fh.write(line)
    else:
        sys.stdout.write(line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
