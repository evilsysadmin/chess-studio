#!/usr/bin/env python3
"""Drive the narrow K3s staging2 shadow backend wrapper over OCI Run Command."""
from __future__ import annotations

import argparse
import re

from oci_run_command import (
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
)

WRAPPER = "/usr/local/sbin/chess-studio-k3s-staging2"
OPERATIONS = ("deploy", "status", "rollback")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
SUCCESS_MARKERS = {
    "deploy": "OCI_K3S_STAGING2_DEPLOY_OK",
    "status": "OCI_K3S_STAGING2_STATUS_OK",
    "rollback": "OCI_K3S_STAGING2_ROLLBACK_OK",
}


def staging2_command(operation: str, sha: str = "") -> str:
    if operation not in OPERATIONS:
        raise SystemExit(f"unsupported staging2 operation: {operation}")
    if operation == "deploy":
        if not SHA_RE.fullmatch(sha):
            raise SystemExit("staging2 deploy requires immutable 40-char lowercase SHA")
        arguments = f"deploy {sha}"
    else:
        if sha:
            raise SystemExit(f"staging2 {operation} does not accept a SHA")
        arguments = operation
    command = f"""set -euo pipefail
test -x '{WRAPPER}' || {{ echo 'OCI_K3S_STAGING2_WRAPPER_MISSING' >&2; exit 44; }}
set +e
output="$(sudo --non-interactive '{WRAPPER}' {arguments} 2>&1)"
rc=$?
set -e
printf '%s\\n' "$output"
if [ "$rc" -ne 0 ]; then
  printf 'OCI_K3S_STAGING2_REMOTE_FAILED operation=%s rc=%s\\n' '{operation}' "$rc"
  exit 0
fi
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("staging2 Run Command payload exceeds inline limit")
    return command


def validate_output(operation: str, output: str) -> None:
    marker = SUCCESS_MARKERS[operation]
    lines = output.splitlines()
    failure = next((line for line in lines if line.startswith("OCI_K3S_STAGING2_REMOTE_FAILED")), "")
    if failure:
        diagnostics = [line for line in lines if line.startswith("OCI_K3S_STAGING2_DIAG")]
        detail = " | ".join(diagnostics[-8:]) or "no safe diagnostics returned"
        raise SystemExit(f"staging2 remote operation failed: {failure}; {detail}")
    if not any(line.startswith(marker) for line in lines):
        raise SystemExit(f"staging2 output missing success marker: {marker}")


def self_test() -> None:
    sha = "0123456789abcdef0123456789abcdef01234567"
    for operation in OPERATIONS:
        command = staging2_command(operation, sha if operation == "deploy" else "")
        assert "sudo --non-interactive" in command
        assert "OCI_K3S_STAGING2_REMOTE_FAILED" in command
        assert 'printf \'%s\\n\' "$output"' in command
        assert WRAPPER in command
        assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
        validate_output(operation, f"noise\n{SUCCESS_MARKERS[operation]} sample=true\n")
    for bad in ("main", "ABC", "0" * 39):
        try:
            staging2_command("deploy", bad)
        except SystemExit:
            pass
        else:
            raise AssertionError("mutable/invalid staging2 refs must fail closed")
    try:
        staging2_command("shell")
    except SystemExit:
        pass
    else:
        raise AssertionError("arbitrary staging2 operations must be rejected")
    print("OCI K3s staging2 Run Command self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=OPERATIONS)
    parser.add_argument("--repo-ref", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")
    sha = args.repo_ref if args.operation == "deploy" else ""
    command = staging2_command(args.operation, sha)

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    timeout = 360 if args.operation == "deploy" else 150
    output = execute(
        oci,
        config,
        command,
        display_name=f"chess-studio-k3s-staging2-{args.operation}",
        timeout=timeout,
    )
    validate_output(args.operation, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
