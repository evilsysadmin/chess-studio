#!/usr/bin/env python3
"""Classify which OCI readiness gates are required for a change."""
from __future__ import annotations

import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path


WORKFLOW_PATH = ".github/workflows/oci-readiness.yml"
ARM64_RE = re.compile(
    r"^(?:backend-python/Dockerfile|backend-python/requirements[^/]*\.txt|"
    r"scripts/oci_arm64_smoke\.sh|\.github/workflows/oci-readiness\.yml)$"
)
TERRAFORM_SCRIPT = "scripts/oci_floci_smoke.sh"


@dataclass(frozen=True)
class Scope:
    arm64: bool
    terraform: bool


def classify(files: list[str], *, event_name: str) -> Scope:
    if event_name == "workflow_dispatch":
        return Scope(arm64=True, terraform=True)

    normalized = [item.strip() for item in files if item.strip()]
    arm64 = any(ARM64_RE.fullmatch(path) is not None for path in normalized)
    terraform = any(
        path.startswith("infra/oci/") or path in {WORKFLOW_PATH, TERRAFORM_SCRIPT}
        for path in normalized
    )
    return Scope(arm64=arm64, terraform=terraform)


def diff_spec(base_sha: str, head_sha: str) -> str:
    if not base_sha or not head_sha:
        raise ValueError("BASE_SHA y HEAD_SHA son obligatorios para eventos no manuales")
    return f"{base_sha}...{head_sha}"


def changed_files(base_sha: str, head_sha: str) -> list[str]:
    completed = subprocess.run(
        ["git", "diff", "--name-only", diff_spec(base_sha, head_sha)],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line for line in completed.stdout.splitlines() if line.strip()]


def write_outputs(path: Path, scope: Scope) -> None:
    with path.open("a", encoding="utf-8") as handle:
        handle.write(f"arm64={'true' if scope.arm64 else 'false'}\n")
        handle.write(f"terraform={'true' if scope.terraform else 'false'}\n")


def self_test() -> None:
    assert diff_spec("base", "head") == "base...head"
    assert classify([], event_name="workflow_dispatch") == Scope(True, True)
    assert classify(["backend-python/Dockerfile"], event_name="pull_request") == Scope(True, False)
    assert classify(["backend-python/requirements-dev.txt"], event_name="pull_request") == Scope(True, False)
    assert classify(["scripts/oci_arm64_smoke.sh"], event_name="pull_request") == Scope(True, False)
    assert classify([TERRAFORM_SCRIPT], event_name="pull_request") == Scope(False, True)
    assert classify(["infra/oci/main.tf"], event_name="pull_request") == Scope(False, True)
    assert classify([WORKFLOW_PATH], event_name="pull_request") == Scope(True, True)
    assert classify(["frontend/src/App.jsx"], event_name="pull_request") == Scope(False, False)
    assert classify(
        ["backend-python/requirements.txt", "infra/oci/variables.tf"],
        event_name="pull_request",
    ) == Scope(True, True)
    assert classify(["backend-python/sub/requirements.txt"], event_name="pull_request") == Scope(False, False)
    print("oci readiness scope self-test: OK")


def main() -> int:
    if "--self-test" in sys.argv[1:]:
        self_test()
        return 0

    event_name = os.environ.get("EVENT_NAME", "")
    if not event_name:
        print("::error::EVENT_NAME ausente", file=sys.stderr)
        return 2

    try:
        files = [] if event_name == "workflow_dispatch" else changed_files(
            os.environ.get("BASE_SHA", ""), os.environ.get("HEAD_SHA", "")
        )
    except (ValueError, subprocess.CalledProcessError) as exc:
        print(f"::error::No se pudo clasificar OCI readiness: {exc}", file=sys.stderr)
        return 2

    if files:
        print("OCI changed files:")
        for path in files:
            print(f"- {path}")

    scope = classify(files, event_name=event_name)
    output = os.environ.get("GITHUB_OUTPUT", "")
    if not output:
        print("::error::GITHUB_OUTPUT ausente", file=sys.stderr)
        return 2
    write_outputs(Path(output), scope)
    print(
        "OCI readiness scope: "
        f"arm64={'true' if scope.arm64 else 'false'} "
        f"terraform={'true' if scope.terraform else 'false'}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
