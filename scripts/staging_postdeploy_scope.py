#!/usr/bin/env python3
"""Classify optional post-staging followups from one exact-SHA diff."""
from __future__ import annotations

import argparse
import os
import re
import subprocess
from collections.abc import Callable

SHA_RE = re.compile(r"^[0-9a-f]{40}$")
RESEND_MARKER = "infra/oci/runtime/resend-bootstrap-v1.txt"
CONTINUITY_EXACT = frozenset({
    "scripts/staging_deploy_continuity_probe.py",
    "scripts/verify_backend_staging.py",
    "scripts/staging_release_identity.py",
    ".github/workflows/staging-deploy.yml",
    ".github/workflows/staging-deploy-continuity.yml",
    ".github/workflows/main-backend-image.yml",
})
CONTINUITY_PREFIXES = (
    "backend-python/",
    "backend-go/",
    "infra/oci/runtime/",
    "scripts/oci_",
)

Runner = Callable[..., subprocess.CompletedProcess[str]]


def normalize(paths: list[str]) -> list[str]:
    return [path.strip().replace("\\", "/") for path in paths if path.strip()]


def continuity_path(path: str) -> bool:
    return path in CONTINUITY_EXACT or path.startswith(CONTINUITY_PREFIXES)


def classify(paths: list[str]) -> tuple[bool, bool]:
    cleaned = normalize(paths)
    resend = RESEND_MARKER in cleaned
    continuity = any(continuity_path(path) for path in cleaned)
    return resend, continuity


def _run(args: list[str], runner: Runner = subprocess.run) -> str:
    result = runner(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"command failed ({result.returncode}): {' '.join(args)}")
    return (result.stdout or "").strip()


def changed_files(sha: str, runner: Runner = subprocess.run) -> list[str]:
    head = sha.strip().lower()
    if not SHA_RE.fullmatch(head):
        raise ValueError("deploy SHA must be a full lowercase commit")
    parent = _run(["git", "rev-parse", f"{head}^1"], runner)
    if not SHA_RE.fullmatch(parent):
        raise RuntimeError("could not resolve first parent")
    diff = _run(["git", "diff", "--name-only", parent, head], runner)
    return normalize(diff.splitlines())


def decide(sha: str, runner: Runner = subprocess.run) -> dict[str, str]:
    paths = changed_files(sha, runner)
    resend, continuity = classify(paths)
    return {
        "deploy_sha": sha.strip().lower(),
        "resend_required": "true" if resend else "false",
        "continuity_required": "true" if continuity else "false",
    }


def emit(path: str, values: dict[str, str]) -> None:
    payload = "".join(f"{key}={value}\n" for key, value in values.items())
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(payload)
    print(payload, end="")


def self_test() -> None:
    assert classify(["frontend/src/App.jsx"]) == (False, False)
    assert classify([RESEND_MARKER]) == (True, True)
    assert classify(["backend-python/main.py"]) == (False, True)
    assert classify(["backend-go/internal/pulse/pulse.go"]) == (False, True)
    assert classify(["infra/oci/runtime/docker-compose.yml"]) == (False, True)
    assert classify(["scripts/oci_run_command.py"]) == (False, True)
    assert classify(["scripts/staging_deploy_continuity_probe.py"]) == (False, True)
    assert classify([".github/workflows/main-backend-image.yml"]) == (False, True)
    assert classify(["docs/operations/pvp.md"]) == (False, False)
    assert not continuity_path("scripts/cloudflare_auth_rate_limit.py")
    print("staging-postdeploy-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    emit(args.github_output, decide(args.sha or ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
