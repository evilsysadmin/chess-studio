#!/usr/bin/env python3
"""Fail-open classifier for skipping staging on unequivocally non-runtime PR merges."""
from __future__ import annotations

import argparse
import os
from pathlib import Path, PurePosixPath
import re
import subprocess

import staging_generation_diff as generation_diff
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
    ".github/workflows/pvp-python-fallback.yml",
    ".github/workflows/war-room-blender-art.yml",
    ".github/workflows/app-visual-artifact.yml",
    "scripts/quality_scope.py",
    "scripts/browser_quality_scope.py",
    "scripts/blender_required_scope.py",
    "scripts/security_scope.py",
    "scripts/workflow_debt_gate.py",
    "scripts/grafana_dashboard_check.py",
    "scripts/pvp_python_fallback_report.py",
    "scripts/dead_code_reachability_check.py",
    "scripts/test_suite_audit.mjs",
    "scripts/test_entrypoint_parity.py",
    "scripts/workflow_static_contracts.py",
    # Diagnostic-only readers cannot change the deployed API or its acceptance.
    # Prevent CI-only updates from superseding an active OCI generation.
    "scripts/oci_backend_diagnose.py",
    "scripts/oci_public_staging_release.py",
    ".github/workflows/oci-host-provenance-on-failure.yml",
    "scripts/staging_deploy_proof.py",
    "scripts/static_contract_risk_audit.mjs",
    "scripts/pr_track_label_check.py",
    "scripts/quality_provenance.py",
    "scripts/pr_merge_diff.py",
    "scripts/run_core_e2e_lane.py",
    "scripts/war_room_visual_freeze_check.mjs",
    # Offline GPU diagnostics and main CI provenance are not deployed runtime.
    "scripts/compare_home_3d_gpu.py",
    "scripts/test_compare_home_3d_gpu.py",
    "scripts/main_ci_source.py",
    # CI admission evidence is verified by main gates; never served by OCI.
    "scripts/main_ci_admission.py",
    # PR provenance validation gates CI, but does not change OCI's deployed binary.
    "scripts/main_ci_admission.py",
    "scripts/main_ci_admission_wait.py",
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


# Changes to staging's deployed acceptance contract must exercise staging.
# Keep this allowlist narrow: ordinary offline E2E tests remain non-runtime.
STAGING_ACCEPTANCE_FILES = frozenset({
    "e2e/staging-live.spec.js",
    "e2e/staging-war-room-restore.spec.js",
    "e2e/staging-pawn-slug-godot.spec.js",
    "e2e/playwright.staging.config.js",
    "e2e/staging-synthetic.js",
})

# Only the two mandatory browser specs and their synthetic helper are
# covered by staging-deploy's always-on smoke matrix.
SMOKE_ONLY_PATHS = frozenset({
    "e2e/staging-live.spec.js",
    "e2e/staging-war-room-restore.spec.js",
    "e2e/staging-synthetic.js",
})


def normalize(path: str) -> str:
    value = path.strip().replace("\\", "/")
    if not value or value.startswith("/") or ".." in PurePosixPath(value).parts:
        raise ValueError(f"invalid repository path: {path!r}")
    return value


def non_runtime_path(path: str) -> bool:
    path = normalize(path)
    name = Path(path).name
    if path in STAGING_ACCEPTANCE_FILES:
        return False
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


def require_pending_since_complete(
    head: str,
    required: bool,
    reason: str,
    *,
    diff_lookup=generation_diff.diff_since_previous_complete,
) -> tuple[bool, str]:
    """Never skip an uncompleted runtime deployment behind a doc/test merge.

    The one-commit classifier is cheap, but rapid merges can cancel the deploy
    of a runtime change before a later non-runtime commit reaches admission.
    Compare against the last *complete* staging generation on the skip path.
    If the baseline cannot be established, run the guarded full deploy.
    """
    if required:
        return required, reason
    try:
        pending_paths, base, _run_id = diff_lookup(head)
        if not pending_paths:
            return False, f"no-pending-diff:{base[:12]}"
        pending_required, pending_reason = deploy_required_for_paths(pending_paths)
        if pending_required:
            return True, f"pending-since-complete:{base[:12]}:{pending_reason}"
        return False, f"non-runtime-since-complete:{base[:12]}"
    except (OSError, RuntimeError, ValueError) as exc:
        return True, f"pending-diff-fail-open:{type(exc).__name__}"


def speculative_prebuild_required_for_paths(paths: list[str]) -> bool:
    """Skip speculative compilation only for obvious browser-smoke edits.

    The actual staging fast path independently proves the last complete SHA,
    ancestry, full baseline diff and three live surfaces. If it declines,
    staging's existing frontend fallback builds the artifact locally.
    """
    cleaned = [normalize(path) for path in paths if path.strip()]
    return not (
        bool(cleaned)
        and any(path in SMOKE_ONLY_PATHS for path in cleaned)
        and all(path in SMOKE_ONLY_PATHS or non_runtime_path(path) for path in cleaned)
    )


def speculative_prebuild_required(sha: str, source: str | None) -> bool:
    if source != "pr":
        return True
    try:
        return speculative_prebuild_required_for_paths(changed_files(sha))
    except (OSError, subprocess.SubprocessError, ValueError):
        return True


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


def emit(path: str, deploy_required: bool, reason: str, prebuild_required: bool = True) -> None:
    if path:
        with open(path, "a", encoding="utf-8") as handle:
            handle.write(f"deploy_required={'true' if deploy_required else 'false'}\n")
            handle.write(f"deploy_reason={reason}\n")
            handle.write(f"prebuild_required={'true' if prebuild_required else 'false'}\n")
    print(f"deploy_required={'true' if deploy_required else 'false'}")
    print(f"deploy_reason={reason}")
    print(f"prebuild_required={'true' if prebuild_required else 'false'}")


def self_test() -> None:
    assert deploy_required_for_paths(["docs/operations/pvp.md", "README.md"]) == (False, "non-runtime-only")
    # Image publishing uses exactly the same pending-generation decision as
    # staging prepare; docs-only last merges must not strand missing GHCR tags.
    sha = "a" * 40
    pending = lambda _sha: (["docs/staging.md", "frontend/src/App.jsx"], "b" * 40, 101)
    needed, reason = require_pending_since_complete(sha, False, "non-runtime-only", diff_lookup=pending)
    assert needed and reason.startswith("pending-since-complete:")
    pure = lambda _sha: (["docs/staging.md"], "b" * 40, 101)
    assert require_pending_since_complete(sha, False, "non-runtime-only", diff_lookup=pure)[0] is False
    assert require_pending_since_complete(sha, True, "runtime:backend-go/pvp.go",
               diff_lookup=lambda _: (_ for _ in ()).throw(AssertionError("unexpected API call")))[0]
    assert require_pending_since_complete(sha, False, "non-runtime-only",
               diff_lookup=lambda _: (_ for _ in ()).throw(RuntimeError("unavailable")))[0]

    assert deploy_required_for_paths(["scripts/staging_deploy_proof.py"]) == (False, "non-runtime-only")
    diagnostic_only = [
        "scripts/oci_backend_diagnose.py",
        "scripts/oci_public_staging_release.py",
        ".github/workflows/oci-host-provenance-on-failure.yml",
    ]
    for path in diagnostic_only:
        assert deploy_required_for_paths([path]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(diagnostic_only) == (False, "non-runtime-only")
    offline_home_ci = [
        "scripts/compare_home_3d_gpu.py",
        "scripts/test_compare_home_3d_gpu.py",
        "scripts/main_ci_source.py",
        "scripts/main_ci_admission.py",
        "scripts/main_ci_admission.py",
        "scripts/main_ci_admission_wait.py",
    ]
    for path in offline_home_ci:
        assert deploy_required_for_paths([path]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(offline_home_ci) == (False, "non-runtime-only")
    assert deploy_required_for_paths([*diagnostic_only, *offline_home_ci]) == (False, "non-runtime-only")
    # Mixing admission-only edits with actual runtime/deployment policy is
    # always a real staging change, regardless of the harmless companion.
    assert deploy_required_for_paths(
        ["scripts/main_ci_admission.py", "backend-go/Dockerfile"]
    ) == (True, "runtime:backend-go/Dockerfile")
    assert deploy_required_for_paths(
        ["scripts/main_ci_admission.py", ".github/workflows/staging-deploy.yml"]
    ) == (True, "runtime:.github/workflows/staging-deploy.yml")
    for runtime in ("frontend/src/components/HomeBlenderScene3D.jsx",
                    "scripts/oci_existing_a1_deploy.sh", "Makefile"):
        assert deploy_required_for_paths([*offline_home_ci, runtime]) == (
            True, f"runtime:{runtime}"
        )
    # Host mutation and actual acceptance changes stay fail-open/deploy-required.
    for deployment_control in (
        "scripts/oci_run_command.py",
        "scripts/oci_existing_a1_deploy.sh",
        "scripts/oci_staging_deploy_launcher.sh",
        ".github/workflows/staging-deploy.yml",
        "scripts/staging_deploy_scope.py",
    ):
        assert deploy_required_for_paths([deployment_control]) == (
            True, f"runtime:{deployment_control}"
        )
        assert deploy_required_for_paths([*diagnostic_only, deployment_control]) == (
            True, f"runtime:{deployment_control}"
        )
    assert deploy_required_for_paths(["e2e/smoke.spec.js", "backend-go/internal/pulse/pulse_test.go"]) == (False, "non-runtime-only")
    for staging_path in sorted(STAGING_ACCEPTANCE_FILES):
        assert deploy_required_for_paths([staging_path]) == (True, f"runtime:{staging_path}")
    assert deploy_required_for_paths(["e2e/ordinary-browser.spec.js"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["e2e/staging-live-other.spec.js"]) == (False, "non-runtime-only")
    assert not speculative_prebuild_required_for_paths(["e2e/staging-live.spec.js"])
    assert not speculative_prebuild_required_for_paths(["e2e/staging-war-room-restore.spec.js", "README.md"])
    assert not speculative_prebuild_required_for_paths(["e2e/staging-synthetic.js", "docs/release.md"])
    assert speculative_prebuild_required_for_paths(["e2e/staging-pawn-slug-godot.spec.js"])
    assert speculative_prebuild_required_for_paths(["e2e/playwright.staging.config.js"])
    assert speculative_prebuild_required_for_paths(["e2e/staging-live.spec.js", "frontend/src/App.jsx"])
    assert speculative_prebuild_required_for_paths(["scripts/staging_deploy_scope.py", "e2e/staging-live.spec.js"])
    assert speculative_prebuild_required_for_paths([])
    assert deploy_required_for_paths(["scripts/quality_scope.py", ".github/workflows/cicd.yml"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["scripts/dead_code_reachability_check.py"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["scripts/grafana_dashboard_check.py", ".github/workflows/billing-cost-export.yml"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths(["scripts/pvp_python_fallback_report.py", ".github/workflows/pvp-python-fallback.yml"]) == (False, "non-runtime-only")
    assert deploy_required_for_paths([".github/workflows/war-room-blender-art.yml", "scripts/blender_required_scope.py"]) == (False, "non-runtime-only")
    # Extracted Chronicles authoring tools are NOT safe to silently ignore if
    # someone reintroduces them. Fail open to staging admission/deployment.
    for retired_script in (
        "scripts/chronicles_contracts.py",
        "scripts/chronicles_area_parity_corpus.py",
        "scripts/validate_chronicles_campaign.py",
    ):
        assert deploy_required_for_paths([retired_script])[0], retired_script
    for retired_workflow in (
        ".github/workflows/chronicles-visual-artifact.yml",
        ".github/workflows/tactics-visual-artifact.yml",
    ):
        assert deploy_required_for_paths([retired_workflow])[0], retired_workflow
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
    assert deploy_required_for_paths(["scripts/staging_deploy_scope.py", *offline_home_ci])[0]
    assert deploy_required_for_paths([])[0]
    print("staging-deploy-scope self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sha")
    parser.add_argument("--source", choices=("pr", "direct"))
    parser.add_argument("--include-pending", action="store_true",
                        help="publish immutable image when staging has uncompleted runtime changes")
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
    if args.include_pending:
        deploy_required, reason = require_pending_since_complete(sha, deploy_required, reason)
    prebuild_required = speculative_prebuild_required(sha, source) if deploy_required else True
    emit(args.github_output, deploy_required, reason, prebuild_required)
    if not deploy_required:
        print("::notice title=Staging no-op::Cambio PR inequívocamente no-runtime; se omite la generación de staging.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
