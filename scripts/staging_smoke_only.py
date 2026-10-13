#!/usr/bin/env python3
"""Fail-closed reuse of the last fully deployed staging SHA for smoke-only changes.

Diagnostic tests are run from the new (admitted) main commit, but the runtime
remains the previous complete, automatic staging generation. This path never
issues a promotion accreditation for the newer commit.
"""
from __future__ import annotations

import os
import subprocess
from urllib.error import HTTPError, URLError
from urllib.parse import quote

import main_ci_admission as admission
import staging_deploy_scope as scope
import staging_generation as generation
import staging_generation_diff as diff
import staging_deploy_proof as proof


def safe_changes(rows: list[tuple[str, str]]) -> bool:
    """Allow only pure acceptance/test/documentation changes since deployment."""
    if not rows:
        return False
    acceptance = False
    for status, path in rows:
        if status not in {"M", "A", "D"}:
            return False
        if path in scope.SMOKE_ONLY_PATHS:
            acceptance = True
        elif path in scope.STAGING_ACCEPTANCE_FILES or not scope.non_runtime_path(path):
            return False
    return acceptance


SMOKE_KEYS = ("live", "restore")


def required_smokes(rows: list[tuple[str, str]]) -> tuple[str, ...]:
    """Select only changed browser contracts, never narrow a suspicious diff.

    Eligible smoke-only merges are already bounded to the last complete
    accredited runtime. Shared synthetic helpers affect both smoke specs.
    Every full runtime deployment still runs both irrespective of this helper.
    """
    if not safe_changes(rows):
        return SMOKE_KEYS
    paths = {path for _, path in rows}
    # An unrelated E2E helper/config/test (or a CI support script) can affect
    # both browser contracts. The existing safe_changes() permits these
    # *non-runtime* edits, but they are not proof of per-smoke independence.
    # Only plain documentation is inert enough to preserve single-spec scope.
    docs_exact = {"README.md", "AGENTS.md", ".github/workflows/README.md"}
    shared_or_unknown = any(
        path not in scope.SMOKE_ONLY_PATHS
        and path not in docs_exact
        and not (path.startswith("docs/") and path.endswith(".md"))
        for path in paths
    )
    if shared_or_unknown or "e2e/staging-synthetic.js" in paths:
        return SMOKE_KEYS
    keys = tuple(key for key, path in (
        ("live", "e2e/staging-live.spec.js"),
        ("restore", "e2e/staging-war-room-restore.spec.js"),
    ) if path in paths)
    return keys or SMOKE_KEYS


def diff_status(base: str, head: str) -> list[tuple[str, str]]:
    """Disable rename detection: never hide a runtime deletion behind a test rename."""
    fetched = subprocess.run(
        ["git", "fetch", "--no-tags", "--depth=1", "origin", base],
        capture_output=True, text=True, check=False,
    )
    if fetched.returncode != 0:
        raise RuntimeError("base fetch failed")
    result = subprocess.run(
        ["git", "diff", "--name-status", "--no-renames", base, head],
        check=True, capture_output=True, text=True,
    )
    rows = []
    for row in result.stdout.splitlines():
        fields = row.split("\t")
        if len(fields) != 2:
            raise ValueError("unexpected diff status")
        status, path = fields
        path = scope.normalize(path)
        rows.append((status, path))
    return rows


def latest_automatic_generation(repository: str, token: str) -> tuple[str, int]:
    runs = [
        run for run in diff.successful_runs(repository, token)
        if run.get("event") == "workflow_run"
    ]
    return diff.select_complete_generation(
        runs,
        lambda run_id: proof.fetch_jobs(repository, run_id, token),
    )


def comparison_ahead(repository: str, base: str, head: str, token: str) -> bool:
    if not repository or repository.count("/") != 1 or not token:
        return False
    owner, name = repository.split("/", 1)
    result = admission.api_get(
        f"/repos/{quote(owner)}/{quote(name)}/compare/{base}...{head}", token,
    )
    return isinstance(result, dict) and result.get("status") == "ahead"


def surfaces_are_exact(sha: str) -> bool:
    return all(
        generation.observe(kind, sha, generation.http_fetch)[0]
        for kind in generation.SURFACES
    )


def select(head: str, source: str) -> tuple[str, str, tuple[str, ...]]:
    """(runtime SHA or '', reason, smoke keys); ambiguous cases deploy fully."""
    if source != "pr" or os.environ.get("GITHUB_EVENT_NAME") != "workflow_run":
        return "", "not-an-automatic-pr-merge", SMOKE_KEYS
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token or repo.count("/") != 1:
        return "", "missing-readonly-api-access", SMOKE_KEYS
    try:
        base, run_id = latest_automatic_generation(repo, token)
        if base == head:
            return "", "already-deployed", SMOKE_KEYS
        if not comparison_ahead(repo, base, head, token):
            return "", "not-in-accredited-lineage", SMOKE_KEYS
        changes = diff_status(base, head)
        if not safe_changes(changes):
            return "", "runtime-diff-needs-deploy", SMOKE_KEYS
        if not surfaces_are_exact(base):
            return "", "three-surface-parity-not-proven", SMOKE_KEYS
        # A new main may have merged during external reads. Re-check before
        # electing the no-mutation route; the job also guards its test source.
        if generation.current_main() != head:
            return "", "superseded", SMOKE_KEYS
        return base, f"complete-automatic-run:{run_id}", required_smokes(changes)
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError,
            generation.GenerationError, admission.AdmissionError, HTTPError, URLError) as exc:
        return "", f"fallback-full-deploy:{type(exc).__name__}", SMOKE_KEYS


def self_test() -> None:
    a = "a" * 40
    b = "b" * 40
    assert required_smokes([("M", "e2e/staging-live.spec.js")]) == ("live",)
    assert required_smokes([("M", "e2e/staging-war-room-restore.spec.js"), ("A", "README.md")]) == ("restore",)
    assert required_smokes([("M", "e2e/staging-live.spec.js"), ("M", "e2e/staging-war-room-restore.spec.js")]) == SMOKE_KEYS
    assert required_smokes([("D", "e2e/staging-synthetic.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-war-room-restore.spec.js"), ("M", "e2e/helpers.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-live.spec.js"), ("M", "e2e/helpers.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-live.spec.js"), ("M", "scripts/quality_scope.py")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-war-room-restore.spec.js"), ("M", "e2e/other.spec.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-war-room-restore.spec.js"), ("M", "docs/staging.json")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-war-room-restore.spec.js"), ("M", ".github/workflows/README.md")]) == ("restore",)

    assert required_smokes([("M", "e2e/staging-synthetic.js"), ("M", "e2e/staging-live.spec.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "frontend/src/App.jsx"), ("M", "e2e/staging-live.spec.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "e2e/staging-pawn-slug-godot.spec.js")]) == SMOKE_KEYS
    assert required_smokes([("M", "docs/staging.md")]) == SMOKE_KEYS
    assert safe_changes([("M", "e2e/staging-live.spec.js")])
    assert safe_changes([("M", "e2e/staging-war-room-restore.spec.js"), ("A", "README.md")])
    assert safe_changes([("D", "e2e/staging-synthetic.js"), ("M", "docs/staging.md")])
    assert not safe_changes([])
    assert not safe_changes([("M", "docs/staging.md")])
    assert not safe_changes([("M", "e2e/staging-pawn-slug-godot.spec.js")])
    assert not safe_changes([("M", "e2e/playwright.staging.config.js")])
    assert not safe_changes([("M", "e2e/staging-live.spec.js"), ("M", "e2e/staging-pawn-slug-godot.spec.js")])
    assert not safe_changes([("M", "frontend/src/App.jsx"), ("M", "e2e/staging-live.spec.js")])
    assert not safe_changes([("D", "backend-go/go.mod"), ("M", "e2e/staging-live.spec.js")])
    assert not safe_changes([("R100", "e2e/staging-live.spec.js")])
    assert not safe_changes([("M", ".github/workflows/staging-deploy.yml"), ("M", "e2e/staging-live.spec.js")])
    assert select(a, "direct")[0] == ""
    assert not comparison_ahead("", a, b, "")
    # Fail loudly in preflight if an unrelated refactor removes the no-deploy or
    # no-accredit safety contract. The proof requires every runtime job success.
    from pathlib import Path
    workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/staging-deploy.yml").read_text(encoding="utf-8")
    assert "needs.prepare.outputs.smoke_only != 'true'" in workflow
    assert "needs.prepare.outputs.smoke_only == 'true'" in workflow
    assert "needs.backend.result == 'skipped'" in workflow
    assert "needs.frontend.result == 'skipped'" in workflow
    assert "needs.worker.result == 'skipped'" in workflow
    assert "smoke_matrix: ${{ steps.admission.outputs.smoke_matrix }}" in workflow
    assert "matrix: ${{ fromJSON(needs.prepare.outputs.smoke_matrix) }}" in workflow
    assert "staging-live.spec.js" in workflow and "staging-war-room-restore.spec.js" in workflow
    assert "Staging generation complete" in proof.REQUIRED_JOBS
    assert "Browser smoke · War Room live" in proof.REQUIRED_JOBS
    assert "Browser smoke · authoritative F5 restore" in proof.REQUIRED_JOBS
    assert "TEST_SOURCE_SHA: ${{ needs.prepare.outputs.deploy_sha }}" in workflow
    assert 'ref: ${{ env.TEST_SOURCE_SHA }}' in workflow
    assert 'smoke_sha || needs.prepare.outputs.deploy_sha' in workflow
    assert "Verify smoke-only runtime and source stayed unchanged" in workflow
    # The summary runs on a fresh runner. Missing checkout previously turned
    # optional timing metrics into a hard failure and blocked accreditation.
    summary_block = workflow.split("\n  summary:\n", 1)[1]
    summary_steps = summary_block.split("\n    steps:\n", 1)[1]
    assert summary_steps.index("- name: Summary") < summary_steps.index("- name: Checkout staging metrics scripts")
    assert summary_steps.index("- name: Checkout staging metrics scripts") < summary_steps.index("- name: Diagnostic staging timings (non-blocking)")
    assert summary_steps.count("continue-on-error: true") >= 2
    assert "uses: actions/checkout@v7" in summary_steps
    assert "ref: ${{ env.DEPLOY_SHA }}" in summary_steps
    assert "if: steps.metrics_checkout.outcome == 'success'" in summary_steps
    assert "scripts/staging_deploy_metrics.py --self-test" in summary_steps
    # OCI SDK venv cache restores but is unusable on fresh hosted runners.
    # The browser-only package tree can be imported from PYTHONPATH without
    # embedding an interpreter path in the cache; other OCI jobs retain venv.
    smoke_block = workflow.split("\n  smoke:\n", 1)[1].split("\n  pawn_slug_visual:\n", 1)[0]
    assert "cache-layout: portable" in smoke_block
    assert smoke_block.count("Restore cached OCI SDK toolchain") == 1
    sdk_action = (Path(__file__).resolve().parents[1] / ".github/actions/setup-oci-sdk/action.yml").read_text(encoding="utf-8")
    assert "default: 'venv'" in sdk_action
    assert "if: inputs.cache-layout != 'portable'" in sdk_action
    assert "if: inputs.cache-layout == 'portable'" in sdk_action
    assert "python3 -m pip install --disable-pip-version-check --no-cache-dir --target" in sdk_action
    assert 'PYTHONPATH="$target" python3 -c' in sdk_action
    assert 'echo "PYTHONPATH=$target' in sdk_action
    assert 'echo "OCI_PYTHON=$(command -v python3)"' in sdk_action
    main_workflow = (Path(__file__).resolve().parents[1] / ".github/workflows/main-admission.yml").read_text(encoding="utf-8")
    assert "prebuild_required: ${{ steps.deploy_scope.outputs.prebuild_required }}" in main_workflow
    assert "needs.source.outputs.prebuild_required == 'true'" in main_workflow
    assert "Staging generation complete" in proof.REQUIRED_JOBS
    for name in ("Backend · exact OCI generation", "Frontend · exact Pages generation", "Worker · exact AI generation"):
        assert name in proof.REQUIRED_JOBS
    print("staging-smoke-only self-test: OK")


if __name__ == "__main__":
    self_test()
