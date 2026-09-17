#!/usr/bin/env python3
"""Run the read-only K3s status probe over OCI Run Command."""
from __future__ import annotations

import argparse

from oci_run_command import (
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
)

WRAPPER = "/usr/local/sbin/chess-studio-k3s-status"
SUCCESS_MARKER = "OCI_K3S_STATUS_OK"


def status_command() -> str:
    command = f"""set -euo pipefail
test -x '{WRAPPER}' || {{ echo 'OCI_K3S_STATUS_WRAPPER_MISSING' >&2; exit 44; }}
sudo --non-interactive '{WRAPPER}'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("K3s status payload exceeds Run Command inline limit")
    return command


def validate_output(output: str) -> None:
    if not any(line.startswith(SUCCESS_MARKER) for line in output.splitlines()):
        raise SystemExit(f"K3s status output missing success marker: {SUCCESS_MARKER}")


def self_test() -> None:
    command = status_command()
    assert f"'{WRAPPER}'" in command
    assert "sudo --non-interactive" in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    validate_output(f"noise\n{SUCCESS_MARKER} active=false\n")
    print("OCI K3s status Run Command self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0

    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc

    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    output = execute(
        oci,
        config,
        status_command(),
        display_name="chess-studio-k3s-status",
        timeout=120,
    )
    validate_output(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
