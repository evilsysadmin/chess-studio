#!/usr/bin/env python3
"""Drive the narrow K3s staging2 shadow backend wrapper over OCI Run Command."""
from __future__ import annotations

import argparse
import hashlib
import re
from pathlib import Path

from oci_run_command import (
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
)

WRAPPER = "/usr/local/sbin/chess-studio-k3s-staging2"
ROOT_WRAPPER_SOURCE = Path(__file__).with_name("oci_k3s_staging2_root.py")
OPERATIONS = ("deploy", "status", "rollback")
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
CAPABILITY_RE = re.compile(r"(?:^|\s)capability_sha256=([0-9a-f]{64})(?:\s|$)")
SUCCESS_MARKERS = {
    "deploy": "OCI_K3S_STAGING2_DEPLOY_OK",
    "status": "OCI_K3S_STAGING2_STATUS_OK",
    "rollback": "OCI_K3S_STAGING2_ROLLBACK_OK",
}


def root_capability_sha256() -> str:
    digest = hashlib.sha256()
    with ROOT_WRAPPER_SOURCE.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


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
log="$(mktemp /tmp/chess-studio-staging2.XXXXXX)"
cleanup() {{ rm -f "$log"; }}
trap cleanup EXIT
rc=0
if test -x '{WRAPPER}'; then
  set +e
  sudo --non-interactive '{WRAPPER}' {arguments} >"$log" 2>&1
  rc=$?
  set -e
else
  echo 'OCI_K3S_STAGING2_WRAPPER_MISSING' >"$log"
  rc=44
fi
cat "$log"
printf 'OCI_K3S_STAGING2_REMOTE_RC=%s\\n' "$rc"
exit 0
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("staging2 Run Command payload exceeds inline limit")
    return command


def validate_output(operation: str, output: str) -> None:
    lines = output.splitlines()
    rc_lines = [line for line in lines if line.startswith("OCI_K3S_STAGING2_REMOTE_RC=")]
    if len(rc_lines) != 1:
        raise SystemExit("staging2 output missing unique remote rc marker")
    try:
        remote_rc = int(rc_lines[0].split("=", 1)[1])
    except ValueError as exc:
        raise SystemExit("staging2 output returned invalid remote rc marker") from exc
    if remote_rc != 0:
        raise SystemExit(f"staging2 remote wrapper failed rc={remote_rc}")
    marker = SUCCESS_MARKERS[operation]
    success_lines = [line for line in lines if line.startswith(marker)]
    if len(success_lines) != 1:
        raise SystemExit(f"staging2 output missing unique success marker: {marker}")
    match = CAPABILITY_RE.search(success_lines[0])
    if not match:
        raise SystemExit("staging2 output missing remote capability digest")
    observed = match.group(1)
    expected = root_capability_sha256()
    if observed != expected:
        raise SystemExit(
            "staging2 remote capability stale: "
            f"observed={observed} expected={expected}"
        )


def self_test() -> None:
    sha = "0123456789abcdef0123456789abcdef01234567"
    capability = root_capability_sha256()
    assert re.fullmatch(r"[0-9a-f]{64}", capability)
    for operation in OPERATIONS:
        command = staging2_command(operation, sha if operation == "deploy" else "")
        assert "sudo --non-interactive" in command
        assert WRAPPER in command
        assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
        validate_output(
            operation,
            (
                f"noise\n{SUCCESS_MARKERS[operation]} sample=true "
                f"capability_sha256={capability}\n"
                "OCI_K3S_STAGING2_REMOTE_RC=0\n"
            ),
        )
    try:
        validate_output(
            "deploy",
            "OCI_K3S_STAGING2_DEPLOY_OK sample=true\nOCI_K3S_STAGING2_REMOTE_RC=0\n",
        )
    except SystemExit as exc:
        assert "capability digest" in str(exc)
    else:
        raise AssertionError("missing remote capability digest must fail closed")
    try:
        validate_output(
            "deploy",
            (
                "OCI_K3S_STAGING2_DEPLOY_OK sample=true "
                f"capability_sha256={'0' * 64}\n"
                "OCI_K3S_STAGING2_REMOTE_RC=0\n"
            ),
        )
    except SystemExit as exc:
        assert "capability stale" in str(exc)
    else:
        raise AssertionError("stale remote capability must fail closed")
    try:
        validate_output("deploy", "OCI_K3S_STAGING2_REMOTE_RC=9\n")
    except SystemExit as exc:
        assert "rc=9" in str(exc)
    else:
        raise AssertionError("non-zero staging2 remote rc must fail closed")
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
