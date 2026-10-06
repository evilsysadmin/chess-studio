#!/usr/bin/env python3
"""Decide whether the next exact staging generation needs Pawn Slug live evidence.

Automatic staging already pays a prepare runner. This classifier uses the SHA
currently served by backend + frontend as the base, diffs it against the new
DEPLOY_SHA and reuses Quality's canonical Pawn Slug scope. Ambiguity always
fails open to required=true.
"""
from __future__ import annotations

import argparse
import os
import subprocess
from collections.abc import Callable

import quality_scope
import staging_generation as generation

EXPLICIT_PATHS = frozenset({
    ".github/workflows/staging-deploy.yml",
    ".github/workflows/staging-pawn-slug-visual.yml",
    "e2e/staging-pawn-slug-godot.spec.js",
    "scripts/staging_pawn_slug_visual_scope.py",
})

Runner = Callable[..., subprocess.CompletedProcess]


def live_base_sha(fetch=generation.http_fetch) -> tuple[str | None, str]:
    targets = (
        f"{generation.url('STAGING_API_URL')}/release?scope=pawnslug",
        f"{generation.url('STAGING_URL')}/release.json?scope=pawnslug",
    )
    builds: list[str] = []
    for target in targets:
        status, body = fetch(target)
        if status != 200:
            return None, f"live-base-http-{status or 'error'}"
        build = generation.build_of(body)
        if not generation.SHA_RE.match(build):
            return None, f"live-base-invalid:{build}"
        builds.append(build)
    if len(set(builds)) != 1:
        return None, "live-base-mismatch"
    return builds[0], "live-base-exact"


def changed_files(base_sha: str, head_sha: str, runner: Runner = subprocess.run) -> list[str]:
    base = generation.valid_sha(base_sha)
    head = generation.valid_sha(head_sha)
    if base == head:
        return []

    fetched = runner(
        ["git", "fetch", "--no-tags", "--depth=1", "origin", base],
        capture_output=True,
        text=True,
        check=False,
    )
    if fetched.returncode != 0:
        raise RuntimeError("could not fetch live staging base")

    diff = runner(
        ["git", "diff", "--name-only", base, head],
        capture_output=True,
        text=True,
        check=True,
    )
    return [line.strip() for line in (diff.stdout or "").splitlines() if line.strip()]


def requires_live_visual(paths: list[str]) -> bool:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    if any(path in EXPLICIT_PATHS for path in cleaned):
        return True
    scope = quality_scope.classify(cleaned)
    return bool(scope.run_pawn_slug_godot or scope.run_pawn_slug_e2e)


def decide(
    head_sha: str,
    *,
    fetch=generation.http_fetch,
    runner: Runner = subprocess.run,
) -> tuple[bool, str, str]:
    try:
        head = generation.valid_sha(head_sha)
        base, base_reason = live_base_sha(fetch)
        if not base:
            return True, f"fail-open:{base_reason}", ""
        paths = changed_files(base, head, runner)
        if requires_live_visual(paths):
            return True, f"pawn-slug-change:{base[:12]}..{head[:12]}", base
        return False, f"no-pawn-slug-change:{base[:12]}..{head[:12]}", base
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError, generation.GenerationError) as exc:
        return True, f"fail-open:{type(exc).__name__}", ""


def emit(path: str, required: bool, reason: str, base_sha: str) -> None:
    lines = (
        f"pawn_slug_visual_required={'true' if required else 'false'}\n"
        f"pawn_slug_visual_reason={reason}\n"
        f"pawn_slug_visual_base_sha={base_sha}\n"
    )
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(lines)
    print(lines, end="")


def self_test() -> None:
    sha = "a" * 40
    other = "b" * 40

    def good_fetch(_target: str) -> tuple[int, str]:
        return 200, '{"build":"' + sha + '"}'

    base, reason = live_base_sha(good_fetch)
    assert base == sha and reason == "live-base-exact"

    seen = {"count": 0}

    def mismatch_fetch(_target: str) -> tuple[int, str]:
        seen["count"] += 1
        build = sha if seen["count"] == 1 else other
        return 200, '{"build":"' + build + '"}'

    assert live_base_sha(mismatch_fetch) == (None, "live-base-mismatch")
    assert requires_live_visual(["games/pawn-slug-godot/scripts/main.gd"])
    assert requires_live_visual(["frontend/src/components/PawnSlugScreen.jsx"])
    assert requires_live_visual(["e2e/staging-pawn-slug-godot.spec.js"])
    assert requires_live_visual([".github/workflows/staging-deploy.yml"])
    assert not requires_live_visual(["frontend/src/components/GameScreen.jsx"])
    assert not requires_live_visual(["docs/operations/pvp.md"])
    print("staging-pawn-slug-visual-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    required, reason, base_sha = decide(args.sha or "")
    emit(args.github_output, required, reason, base_sha)
    if required:
        print(f"::notice title=Pawn Slug live visual::required · {reason}")
    else:
        print(f"::notice title=Pawn Slug live visual skipped::{reason}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
