#!/usr/bin/env python3
"""Prepare one coherent staging generation and its optional live evidence."""
from __future__ import annotations

import argparse
import os
from pathlib import Path

import main_ci_admission as admission
import staging_deploy_scope as deploy_scope
import staging_generation as generation
import staging_pawn_slug_visual_scope as pawn_scope
from main_ci_source import SourceError


def append_summary(text: str) -> None:
    path = os.environ.get("GITHUB_STEP_SUMMARY", "").strip()
    if path:
        with Path(path).open("a", encoding="utf-8") as handle:
            handle.write(text.rstrip() + "\n")


def resolve_source(sha: str) -> str:
    repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    try:
        if not repository or "/" not in repository or not token:
            raise SourceError("missing repository/token")
        return deploy_scope.source_for_sha(repository, sha, token)
    except (SourceError, admission.AdmissionError, OSError):
        return "unknown"


def prepare(sha: str) -> dict[str, str]:
    head = generation.valid_sha(sha)
    source = resolve_source(head)
    required, reason = deploy_scope.decide(head, source)
    values = {
        "deploy_sha": head,
        "admitted": "false",
        "pawn_slug_visual_required": "false",
        "pawn_slug_visual_reason": "not-admitted",
    }
    if not required:
        append_summary(f"### Staging no-op · {head} · {reason}")
        return values

    current = generation.current_main()
    if current != head:
        append_summary(f"### Staging superseded · {head}")
        return values

    values["admitted"] = "true"
    pawn_required, pawn_reason, _base = pawn_scope.decide(head)
    values["pawn_slug_visual_required"] = "true" if pawn_required else "false"
    values["pawn_slug_visual_reason"] = pawn_reason
    return values


def emit(path: str, values: dict[str, str]) -> None:
    lines = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(lines)
    print(lines, end="")


def self_test() -> None:
    deploy_scope.self_test()
    generation.self_test()
    pawn_scope.self_test()
    print("staging-deploy-prepare self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    emit(args.github_output, prepare(args.sha or ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
