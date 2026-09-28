#!/usr/bin/env python3
"""Run the weekly production Mongo backup on the OCI A1 without exposing secrets."""
from __future__ import annotations

import argparse
from typing import Any

from oci_run_command import (
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
    resolve_staging,
)

BACKUP_WRAPPER = "/usr/local/sbin/chess-studio-mongo-backup"
OK_MARKER = "CHESS_STUDIO_MONGO_BACKUP_OK"


def backup_command() -> str:
    command = f"""set -euo pipefail
test -x '{BACKUP_WRAPPER}' || {{ echo 'CHESS_STUDIO_MONGO_BACKUP_WRAPPER_MISSING' >&2; exit 44; }}
sudo --non-interactive '{BACKUP_WRAPPER}'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI Mongo backup payload exceeds Run Command inline limit")
    return command


def validate_output(output: str) -> str:
    marker = next(
        (line.strip() for line in output.splitlines() if line.strip().startswith(OK_MARKER + " ")),
        "",
    )
    if not marker:
        raise SystemExit("OCI production Mongo backup did not return success marker")
    return marker


def run_backup(oci: Any) -> None:
    config = config_from_env(oci)
    target = resolve_staging(oci, config)
    diagnose_plugin(oci, config, resolved=target, include_desired_config=False)
    output = execute(
        oci,
        config,
        backup_command(),
        display_name="chess-studio-production-mongo-backup",
        timeout=1800,
        resolved=target,
    )
    print(validate_output(output))


def self_test() -> None:
    command = backup_command()
    assert BACKUP_WRAPPER in command
    assert "sudo --non-interactive" in command
    assert "MONGO_URL" not in command
    assert "backend.env" not in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    assert validate_output(
        "noise\nCHESS_STUDIO_MONGO_BACKUP_OK timestamp=20260928T040000Z "
        "bytes=123 retained=2 sha256=" + "a" * 64
    ).startswith(OK_MARKER)
    assert_nonsecret_command(command)
    print("OCI production Mongo backup self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("backup",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "backup":
        parser.error("backup is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    run_backup(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
