#!/usr/bin/env python3
"""Classify whether the OCI readiness workflow needs the expensive ARM64 backend lane."""
from __future__ import annotations

import os
import re
import subprocess

ARM64_RE = re.compile(
    r"^(backend-python/Dockerfile|backend-python/requirements[^/]*\.txt|"
    r"scripts/oci_arm64_smoke\.sh|\.github/workflows/oci-readiness\.yml)$"
)


def needs_arm64(paths: list[str]) -> bool:
    return any(ARM64_RE.fullmatch(path.strip()) for path in paths if path.strip())


def changed_paths() -> list[str]:
    event = os.environ.get("GITHUB_EVENT_NAME", "")
    if event == "workflow_dispatch":
        return ["backend-python/Dockerfile"]
    if event == "push":
        # Push is currently scoped to K3s publication only.
        return []
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
    assert needs_arm64([".github/workflows/oci-readiness.yml"])
    assert not needs_arm64(["scripts/oci_k3s_bundle.py"])
    assert not needs_arm64(["infra/oci/runtime/README.md"])


def main() -> None:
    if os.environ.get("OCI_READINESS_SCOPE_SELF_TEST") == "1":
        self_test()
        print("OCI readiness scope self-test: OK")
        return
    print(f"arm64={'true' if needs_arm64(changed_paths()) else 'false'}")


if __name__ == "__main__":
    main()
