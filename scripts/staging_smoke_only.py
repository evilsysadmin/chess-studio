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


# The matrix in staging-deploy runs only the War Room live + F5 restore
# contracts. Pawn Slug and Playwright's shared config retain full staging.
SMOKE_ONLY_PATHS = frozenset({
    "e2e/staging-live.spec.js",
    "e2e/staging-war-room-restore.spec.js",
    "e2e/staging-synthetic.js",
})


def safe_changes(rows: list[tuple[str, str]]) -> bool:
    """Allow only pure acceptance/test/documentation changes since deployment."""
    if not rows:
        return False
    acceptance = False
    for status, path in rows:
        if status not in {"M", "A", "D"}:
            return False
        if path in SMOKE_ONLY_PATHS:
            acceptance = True
        elif path in scope.STAGING_ACCEPTANCE_FILES or not scope.non_runtime_path(path):
            return False
    return acceptance


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


def select(head: str, source: str) -> tuple[str, str]:
    """(deployed SHA or '', diagnostic reason). Never raise for a missing fast path."""
    if source != "pr" or os.environ.get("GITHUB_EVENT_NAME") != "workflow_run":
        return "", "not-an-automatic-pr-merge"
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    token = os.environ.get("GITHUB_TOKEN", "")
    if not token or repo.count("/") != 1:
        return "", "missing-readonly-api-access"
    try:
        base, run_id = latest_automatic_generation(repo, token)
        if base == head:
            return "", "already-deployed"
        if not comparison_ahead(repo, base, head, token):
            return "", "not-in-accredited-lineage"
        if not safe_changes(diff_status(base, head)):
            return "", "runtime-diff-needs-deploy"
        if not surfaces_are_exact(base):
            return "", "three-surface-parity-not-proven"
        # A new main may have merged during external reads. Re-check before
        # electing the no-mutation route; the job also guards its test source.
        if generation.current_main() != head:
            return "", "superseded"
        return base, f"complete-automatic-run:{run_id}"
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError,
            generation.GenerationError, admission.AdmissionError, HTTPError, URLError) as exc:
        return "", f"fallback-full-deploy:{type(exc).__name__}"


def self_test() -> None:
    a = "a" * 40
    b = "b" * 40
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
    assert "TEST_SOURCE_SHA: ${{ needs.prepare.outputs.deploy_sha }}" in workflow
    assert 'ref: ${{ env.TEST_SOURCE_SHA }}' in workflow
    assert 'smoke_sha || needs.prepare.outputs.deploy_sha' in workflow
    assert "Verify smoke-only runtime and source stayed unchanged" in workflow
    assert "Staging generation complete" in proof.REQUIRED_JOBS
    for name in ("Backend · exact OCI generation", "Frontend · exact Pages generation", "Worker · exact AI generation"):
        assert name in proof.REQUIRED_JOBS
    print("staging-smoke-only self-test: OK")


if __name__ == "__main__":
    self_test()
