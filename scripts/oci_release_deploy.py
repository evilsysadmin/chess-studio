#!/usr/bin/env python3
"""Deploy one immutable OCI backend release without rewriting runtime config."""
from __future__ import annotations

import argparse
from typing import Any

from oci_run_command import (
    DEPLOY_WRAPPER,
    RUN_COMMAND_INLINE_MAX_BYTES,
    assert_nonsecret_command,
    config_from_env,
    diagnose_plugin,
    execute,
    validate_sha,
)


def release_command(repo_ref: str) -> str:
    sha = validate_sha(repo_ref)
    command = f"""set -euo pipefail

test -x '{DEPLOY_WRAPPER}' || {{ echo 'CHESS_STUDIO_DEPLOY_WRAPPER_MISSING' >&2; exit 44; }}
sudo --non-interactive '{DEPLOY_WRAPPER}' '{sha}'
"""
    assert_nonsecret_command(command)
    if len(command.encode("utf-8")) > RUN_COMMAND_INLINE_MAX_BYTES:
        raise SystemExit("OCI release payload exceeds Run Command inline limit")
    return command


def deploy_release(oci: Any, repo_ref: str) -> None:
    sha = validate_sha(repo_ref)
    config = config_from_env(oci)
    diagnose_plugin(oci, config, wait_for_registration=True)
    execute(
        oci,
        config,
        release_command(sha),
        display_name=f"chess-studio-release-{sha[:12]}",
        timeout=900,
    )


def self_test() -> None:
    sample = "0123456789abcdef0123456789abcdef01234567"
    command = release_command(sample)
    assert DEPLOY_WRAPPER in command
    assert "sudo --non-interactive" in command
    assert sample in command
    assert len(command.encode("utf-8")) <= RUN_COMMAND_INLINE_MAX_BYTES
    for forbidden in (
        "chess-studio-install-runtime",
        "RUNTIME_NAMESPACE",
        "ObjectStorageClient",
        "InstancePrincipalsSecurityTokenSigner",
        "COMMIT_SHA=",
        "backend.env",
        "pip install",
        "systemctl",
    ):
        assert forbidden not in command, forbidden
    assert_nonsecret_command(command)
    print("OCI release deploy self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("deploy",))
    parser.add_argument("--repo-ref", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "deploy":
        parser.error("deploy is required unless --self-test is used")
    if not args.repo_ref:
        parser.error("--repo-ref is required")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    deploy_release(oci, args.repo_ref)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
