#!/usr/bin/env python3
"""Classify whether OCI readiness needs the expensive ARM64 backend lane."""
from __future__ import annotations

import os
import re
import subprocess

WORKFLOW_PATH = ".github/workflows/oci-readiness.yml"
ARM64_RE = re.compile(
    r"^(backend-python/Dockerfile|backend-python/requirements[^/]*\.txt|"
    r"scripts/oci_arm64_smoke\.sh|scripts/oci_readiness_scope\.py)$"
)
JOB_RE = re.compile(r"(?m)^  ([A-Za-z0-9_-]+):\s*$")


def job_block(source: str, job_name: str) -> str:
    marker = f"  {job_name}:"
    start = source.find(marker)
    if start < 0:
        return ""
    next_job = JOB_RE.search(source, start + len(marker))
    end = next_job.start() if next_job else len(source)
    return source[start:end].rstrip()


def needs_arm64(paths: list[str], *, arm64_job_changed: bool = False) -> bool:
    direct = any(ARM64_RE.fullmatch(path.strip()) for path in paths if path.strip())
    workflow_changed = any(path.strip() == WORKFLOW_PATH for path in paths)
    return direct or (workflow_changed and arm64_job_changed)


def _git(*args: str) -> str:
    completed = subprocess.run(
        ["git", *args],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout


def workflow_arm64_job_changed(merge_sha: str) -> bool:
    if not re.fullmatch(r"[0-9a-f]{40}", merge_sha):
        raise SystemExit("OCI readiness scope requires an immutable merge SHA")
    parents = _git("show", "-s", "--format=%P", merge_sha).strip().split()
    if len(parents) != 2:
        raise SystemExit("OCI readiness scope requires a two-parent synthetic merge commit")
    base_source = _git("show", f"{parents[0]}:{WORKFLOW_PATH}")
    merge_source = _git("show", f"{merge_sha}:{WORKFLOW_PATH}")
    base_block = job_block(base_source, "backend-arm64")
    merge_block = job_block(merge_source, "backend-arm64")
    if not base_block or not merge_block:
        return True
    return base_block != merge_block


def changed_paths() -> list[str]:
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    if event == "workflow_dispatch":
        return ["backend-python/Dockerfile"]
    base = os.environ.get("BASE_SHA", "").strip()
    merge = os.environ.get("GITHUB_SHA", "").strip()
    if not re.fullmatch(r"[0-9a-f]{40}", base) or not re.fullmatch(r"[0-9a-f]{40}", merge):
        raise SystemExit("OCI readiness scope requires immutable base/merge SHAs")
    completed = subprocess.run(
        ["python3", "-S", "scripts/pr_merge_diff.py", "--base", base, "--merge", merge],
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def self_test() -> None:
    assert needs_arm64(["backend-python/Dockerfile"])
    assert needs_arm64(["backend-python/requirements.txt"])
    assert needs_arm64(["backend-python/requirements-dev.txt"])
    assert needs_arm64(["scripts/oci_arm64_smoke.sh"])
    assert needs_arm64(["scripts/oci_readiness_scope.py"])
    assert not needs_arm64(["scripts/oci_k3s_bundle.py"])
    assert not needs_arm64(["infra/oci/runtime/README.md"])
    assert not needs_arm64([WORKFLOW_PATH], arm64_job_changed=False)
    assert needs_arm64([WORKFLOW_PATH], arm64_job_changed=True)

    base = """name: OCI readiness\njobs:\n  classify:\n    runs-on: ubuntu\n  backend-arm64:\n    needs: classify\n    runs-on: ubuntu\n  terraform:\n    runs-on: ubuntu\n"""
    unrelated = base.replace("name: OCI readiness", "name: OCI readiness · validation")
    arm64_changed = base.replace("    runs-on: ubuntu\n  terraform:", "    runs-on: ubuntu-24.04\n  terraform:")
    assert job_block(base, "backend-arm64") == job_block(unrelated, "backend-arm64")
    assert job_block(base, "backend-arm64") != job_block(arm64_changed, "backend-arm64")
    assert job_block(base, "missing") == ""


def main() -> None:
    if os.environ.get("OCI_READINESS_SCOPE_SELF_TEST") == "1":
        self_test()
        print("OCI readiness scope self-test: OK")
        return
    paths = changed_paths()
    merge = os.environ.get("GITHUB_SHA", "").strip()
    arm64_job_changed = WORKFLOW_PATH in paths and workflow_arm64_job_changed(merge)
    print(f"arm64={'true' if needs_arm64(paths, arm64_job_changed=arm64_job_changed) else 'false'}")


if __name__ == "__main__":
    main()
