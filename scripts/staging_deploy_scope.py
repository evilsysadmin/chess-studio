#!/usr/bin/env python3
"""Fail-open classifier for skipping staging on unequivocally non-runtime PR merges."""
from __future__ import annotations

import argparse
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
from urllib.parse import quote

import main_ci_admission as admission
from main_ci_source import SourceError, classify_main_source

NON_RUNTIME_PREFIXES = (
    "docs/",
    "e2e/",
)
NON_RUNTIME_EXACT = frozenset({
    "AGENTS.md",
    "README.md",
    ".github/workflows/README.md",
    ".github/workflows/cicd.yml",
    ".github/workflows/pr-track-label.yml",
    ".github/workflows/e2e-full.yml",
    ".github/workflows/coverage.yml",
    ".github/workflows/menu-ux-audit.yml",
    ".github/workflows/capacity-staging.yml",
    ".github/workflows/capacity-virtual-players.yml",
    ".github/workflows/billing-cost-export.yml",
    ".github/workflows/observability-live.yml",
    ".github/workflows/security-llm-lab.yml",
    ".github/workflows/app-visual-artifact.yml",
    "scripts/quality_scope.py",
    "scripts/browser_quality_scope.py",
    "scripts/blender_required_scope.py",
    "scripts/security_scope.py",
    "scripts/workflow_debt_gate.py",
    "scripts/test_suite_audit.mjs",
    "scripts/test_entrypoint_parity.py",
    "scripts/workflow_static_contracts.py",
    "scripts/static_contract_risk_audit.mjs",
    "scripts/pr_track_label_check.py",
    "scripts/quality_provenance.py",
    "scripts/pr_merge_diff.py",
    "scripts/run_core_e2e_lane.py",
    "scripts/war_room_visual_freeze_check.mjs",
})
NON_RUNTIME_ACTION_PREFIXES = (
    ".github/actions/cache-node-modules/",
    ".github/actions/cache-python-venv/",
    ".github/actions/setup-browser-e2e/",
    ".github/actions/app-visual-pipeline/",
)
NON_RUNTIME_SCRIPT_PREFIXES = (
    "scripts/app_visual_",
)
FRONTEND_TEST_RE = re.compile(r"^frontend/src/.*\.(?:test|spec)\.(?:js|jsx|ts|tsx)$")


def normalize(path: str) -> str:
    value = path.strip().replace("\\", "/")
    if not value or value.startswith("/") or ".." in PurePosixPath(value).parts:
        raise ValueError(f"invalid repository path: {path!r}")
    return value


def non_runtime_path(path: str) -> bool:
    path = normalize(path)
    name = Path(path).name
    if path in NON_RUNTIME_EXACT or path.startswith(NON_RUNTIME_PREFIXES):
        return True
    if path.startswith(NON_RUNTIME_ACTION_PREFIXES):
        return True
    if path.startswith(NON_RUNTIME_SCRIPT_PREFIXES):
        return True
    if FRONTEND_TEST_RE.match(path):
        return True
    if path.startswith("backend-python/") and (name.startswith("test_") and name.endswith(".py") or name == "conftest.py"):
        return True
    if path.startswith("backend-go/") and name.endswith("_test.go"):
        return True
    if "/tests/" in path and path.startswith(("infra/", "scripts/")):
        return True
    return False


def deploy_required_for_paths(paths: list[str]) -> tuple[bool, str]:
    cleaned = [normalize(path) for path in paths if path.strip()]
    if not cleaned:
        return True, "empty-diff-fail-open"
    runtime = [path for path in cleaned if not non_runtime_path(path)]
    if runtime:
        return True, f"runtime:{runtime[0]}"
    return False, "non-runtime-only"


def changed_files(sha: str) -> list[str]:
    parent = subprocess.run(
        ["git", "rev-parse", f"{sha}^1"],
        check=True, capture_output=True, text=True,
    ).stdout.strip()
    output = subprocess.run(
        ["git", "diff", "--name-only", parent, sha],
        check=True, capture_output=True, text=True,
    ).stdout
    return [line.strip() for line in output.splitlines() if line.strip()]


def source_for_sha(repository: str, sha: str, token: str) -> str:
    owner, repo = repository.split("/", 1)
    pulls = admission.api_get(
        f"/repos/{quote(owner)}/{quote(repo)}/commits/{sha}/pulls",
        token,
    )
    if not isinstance(pulls, list):
        raise SourceError("unexpected commit-pulls response")
    source, _ = classify_main_source(pulls, sha)
    return source


def decide(sha: str, source: str | None) -> tuple[bool, str]:
    if source != "pr":
        return True, f"{source or 'unknown'}-source-fail-open"
    try:
        return deploy_required_for_paths(changed_files(sha))
    except (OSError, subprocess.SubprocessError, ValueError) as exc:
        return True, f"diff-fail-open:{type(exc).__name__}"


def emit(path: str, deploy_required: bool, reason: str) -> None:
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"deploy_required={'true' if deploy_required else 'false'}\n")
            handle.write(f"deploy_reason={reason}\n")
    print(f"deploy_required={'true' if deploy_required else 'false'}")
    print(f"deploy_reason={reason}")


def self_test() -> None:
    assert deploy_required_for_paths(["docs/operations/pvp.md", "README.md"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["e2e/smoke.spec.js", "backend-go/internal/pulse/pulse_test.go"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["scripts/quality_scope.py", ".github/workflows/cicd.yml"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths([
        "e2e/war-room-visual-artifact.spec.js",
        "scripts/app_visual_capture.sh",
        "scripts/app_visual_producer_scope.py",
        ".github/actions/app-visual-pipeline/action.yml",
        ".github/workflows/app-visual-artifact.yml",
        "scripts/war_room_visual_freeze_check.mjs",
    ]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["frontend/src/components/GameScreen.jsx"])[0]
    assert deploy_required_for_paths(["backend-go/internal/pulse/pulse.go"])[0]
    assert deploy_required_for_paths([".github/workflows/staging-deploy.yml"])[0]
    assert deploy_required_for_paths([".github/actions/build-staging-frontend/action.yml"])[0]
    assert deploy_required_for_paths(["scripts/staging_deploy_scope.py"])[0]
    assert deploy_required_for_paths([])[0]
    print("staging-deploy-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--source", choices=("pr", "direct"))
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT", ""))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    sha = (args.sha or "").strip().lower()
    if len(sha) != 40:
        raise SystemExit("--sha must be a full commit SHA")

    source = args.source
    if source is None:
        repository = os.environ.get("GITHUB_REPOSITORY", "").strip()
        token = os.environ.get("GITHUB_TOKEN", "").strip()
        try:
            if not repository or "/" not in repository or not token:
                raise SourceError("missing repository/token")
            source = source_for_sha(repository, sha, token)
        except (SourceError, admission.AdmissionError, OSError) as exc:
            emit(args.github_output, True, f"source-fail-open:{type(exc).__name__}")
            return 0

    deploy_required, reason = decide(sha, source)
    emit(args.github_output, deploy_required, reason)
    if not deploy_required:
        print("::notice title=Staging no-op::Cambio PR inequívocamente no-runtime; se omite la generación de staging.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
