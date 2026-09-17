#!/usr/bin/env python3
"""Drive the narrow K3s lifecycle wrapper over OCI Run Command."""
from __future__ import annotations

import argparse

from oci_run_command import (
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
)

WRAPPER = "/usr/local/sbin/chess-studio-k3s-control"
OPERATIONS = ("start", "rollback")
SUCCESS_MARKERS = {
    "start": "OCI_K3S_START_OK",
    "rollback": "OCI_K3S_ROLLBACK_OK",
}


def control_command(operation: str) -> str:
    if operation not in OPERATIONS:
        raise SystemExit(f"unsupported K3s lifecycle operation: {operation}")
    command = f"""set -euo pipefail
test -x '{WRAPPER}' || {{ echo 'OCI_K3S_CONTROL_WRAPPER_MISSING' >&2; exit 44; }}
sudo --non-interactive '{WRAPPER}' '{operation}'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("K3s lifecycle payload exceeds Run Command inline limit")
    return command


def validate_output(operation: str, output: str) -> None:
    marker = SUCCESS_MARKERS[operation]
    if not any(line.startswith(marker) for line in output.splitlines()):
        raise SystemExit(f"K3s lifecycle output missing success marker: {marker}")


def self_test() -> None:
    for operation in OPERATIONS:
        command = control_command(operation)
        assert f"'{WRAPPER}' '{operation}'" in command
        assert "sudo --non-interactive" in command
        assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
        validate_output(operation, f"noise\n{SUCCESS_MARKERS[operation]} sample=true\n")
    try:
        control_command("shell")
    except SystemExit:
        pass
    else:
        raise AssertionError("arbitrary K3s lifecycle operations must be rejected")
    print("OCI K3s Run Command lifecycle self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=OPERATIONS)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    timeout = 420 if args.operation == "start" else 180
    output = execute(
        oci,
        config,
        control_command(args.operation),
        display_name=f"chess-studio-k3s-{args.operation}",
        timeout=timeout,
    )
    validate_output(args.operation, output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
