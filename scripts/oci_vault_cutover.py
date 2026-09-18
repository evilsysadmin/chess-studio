#!/usr/bin/env python3
"""Ensure OCI staging has a usable CURRENT Vault + Git runtime."""
from __future__ import annotations

import argparse
from collections.abc import Callable


def ensure_with(sync_runtime: Callable[[], None], bootstrap_missing: Callable[[], None]) -> None:
    try:
        sync_runtime()
    except SystemExit as first_error:
        print(
            "OCI_VAULT_CUTOVER_RECOVERY reason=initial-runtime-sync-failed "
            f"detail={str(first_error)[:180]}",
            flush=True,
        )
        bootstrap_missing()
        sync_runtime()
        print("OCI_VAULT_CUTOVER_BOOTSTRAPPED", flush=True)
    else:
        print("OCI_VAULT_CUTOVER_REUSED_CURRENT", flush=True)


def ensure(oci: object) -> None:
    from oci_vault_bootstrap import bootstrap
    from oci_vault_sync import sync_current

    ensure_with(
        lambda: sync_current(oci),
        lambda: bootstrap(oci),
    )


def self_test() -> None:
    calls: list[str] = []

    def green_sync() -> None:
        calls.append("sync")

    def unused_bootstrap() -> None:
        calls.append("bootstrap")

    ensure_with(green_sync, unused_bootstrap)
    assert calls == ["sync"]

    calls.clear()
    attempts = 0

    def first_sync_fails() -> None:
        nonlocal attempts
        attempts += 1
        calls.append("sync")
        if attempts == 1:
            raise SystemExit("missing CURRENT secret")

    def bootstrap_once() -> None:
        calls.append("bootstrap")

    ensure_with(first_sync_fails, bootstrap_once)
    assert calls == ["sync", "bootstrap", "sync"]

    calls.clear()

    def always_fails() -> None:
        calls.append("sync")
        raise SystemExit("IAM still broken")

    try:
        ensure_with(always_fails, bootstrap_once)
    except SystemExit as exc:
        assert "IAM still broken" in str(exc)
    else:
        raise AssertionError("second runtime-sync failure must fail closed")
    assert calls == ["sync", "bootstrap", "sync"]
    print("OCI Vault cutover self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=("ensure",))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.operation != "ensure":
        parser.error("ensure is required unless --self-test is used")
    try:
        import oci  # type: ignore
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required: pip install oci") from exc
    ensure(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
