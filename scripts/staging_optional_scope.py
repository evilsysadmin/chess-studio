#!/usr/bin/env python3
"""Classify optional post-staging work from one durable generation diff."""
from __future__ import annotations

import argparse
import os

import staging_generation_diff as generation_diff
import staging_pawn_slug_visual_scope as pawn_scope

RESEND_MARKER = "infra/oci/runtime/resend-bootstrap-v1.txt"
CONTINUITY_PREFIXES = (
    "backend-python/",
    "backend-go/",
    "infra/oci/runtime/",
    "scripts/oci_",
)
CONTINUITY_EXACT = frozenset({
    "scripts/staging_deploy_continuity_probe.py",
    "scripts/verify_backend_staging.py",
    "scripts/staging_release_identity.py",
    ".github/workflows/staging-deploy.yml",
    ".github/workflows/staging-deploy-continuity.yml",
    ".github/workflows/main-backend-image.yml",
})


def continuity_required(paths: list[str]) -> bool:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    return any(
        path in CONTINUITY_EXACT or any(path.startswith(prefix) for prefix in CONTINUITY_PREFIXES)
        for path in cleaned
    )


def classify(paths: list[str]) -> dict[str, bool]:
    cleaned = [path.strip().replace("\\", "/") for path in paths if path.strip()]
    return {
        "pawn_slug_visual_required": pawn_scope.requires_live_visual(cleaned),
        "resend_bootstrap_required": RESEND_MARKER in cleaned,
        "continuity_required": continuity_required(cleaned),
    }


def decide(head_sha: str) -> dict[str, str]:
    try:
        paths, base, run_id = generation_diff.diff_since_previous_complete(head_sha)
        flags = classify(paths)
        span = f"{base[:12]}..{head_sha[:12]}"
        return {
            **{key: "true" if value else "false" for key, value in flags.items()},
            "optional_scope_reason": f"complete-staging:{run_id}:{span}",
            "optional_scope_base_sha": base,
        }
    except (OSError, RuntimeError, ValueError, generation_diff.generation.GenerationError) as exc:
        # Optional release work is safety-oriented. Ambiguity spends extra work
        # instead of silently skipping evidence, recovery or continuity.
        return {
            "pawn_slug_visual_required": "true",
            "resend_bootstrap_required": "true",
            "continuity_required": "true",
            "optional_scope_reason": f"fail-open:{type(exc).__name__}",
            "optional_scope_base_sha": "",
        }


def emit(path: str, values: dict[str, str]) -> None:
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(lines)
    print(lines, end="")


def self_test() -> None:
    assert classify(["games/pawn-slug-godot/scripts/main.gd"])["pawn_slug_visual_required"]
    assert classify([RESEND_MARKER])["resend_bootstrap_required"]
    assert continuity_required(["backend-python/app.py"])
    assert continuity_required(["scripts/oci_release_deploy.py"])
    assert continuity_required([".github/workflows/staging-deploy.yml"])
    assert not continuity_required(["frontend/src/components/GameScreen.jsx"])
    assert not classify(["docs/operations/pvp.md"])["resend_bootstrap_required"]
    pawn_scope.self_test()
    generation_diff.self_test()
    print("staging-optional-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    values = decide(args.sha or "")
    emit(args.github_output, values)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
