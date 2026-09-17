#!/usr/bin/env python3
"""Run only the local self-tests required by one OCI service-control operation."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVICE_WORKFLOW = ROOT / ".github/workflows/oci-staging-service.yml"

TRANSPORT = (("scripts/oci_run_command.py", "--self-test"),)
RUNTIME = (("scripts/oci_runtime_config.py", "--self-test"),)
VAULT_RUNTIME = (("scripts/oci_vault_runtime.py", "--self-test"),)
VAULT_COMPARE = (("scripts/oci_vault_compare.py", "--self-test"),)
VAULT_BOOTSTRAP = (("scripts/oci_vault_bootstrap.py", "--self-test"),)
BACKEND_DIAG = (("scripts/oci_backend_diagnose.py", "--self-test"),)
RENDER_MONGO_DIAG = (("scripts/render_mongo_target_diagnose.py", "--self-test"),)
MONGO_NETWORK_DIAG = (("scripts/oci_mongo_network_diagnose.py", "--self-test"),)
RESERVED_EGRESS = (("scripts/oci_reserve_egress_ip.py", "--self-test"),)
K3S_CONTROL = (
    ("scripts/oci_k3s_control.py", "--self-test"),
    ("scripts/oci_k3s_control_root.py", "self-test"),
)
K3S_STATUS = (
    ("scripts/oci_k3s_status.py", "--self-test"),
    ("scripts/oci_k3s_status_root.py", "self-test"),
)
BACKEND_VERIFY = (("scripts/verify_backend_staging.py", "--self-test"),)

OPERATIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "diagnose": TRANSPORT,
    "backend-diagnose": TRANSPORT + BACKEND_DIAG,
    "mongo-target-diagnose": RENDER_MONGO_DIAG,
    "mongo-network-diagnose": TRANSPORT + MONGO_NETWORK_DIAG,
    "reserved-egress": TRANSPORT + RESERVED_EGRESS,
    "smoke": TRANSPORT,
    "reboot-agent": TRANSPORT,
    "deploy": TRANSPORT + BACKEND_VERIFY,
    "bringup": TRANSPORT + BACKEND_VERIFY,
    "runtime-sync": TRANSPORT + RUNTIME,
    "vault-bootstrap": TRANSPORT + VAULT_BOOTSTRAP + VAULT_RUNTIME,
    "vault-validate": TRANSPORT + VAULT_RUNTIME,
    "vault-validate-pending": TRANSPORT + VAULT_RUNTIME,
    "vault-compare-current": TRANSPORT + VAULT_RUNTIME + VAULT_COMPARE,
    "k3s-start": TRANSPORT + K3S_CONTROL + K3S_STATUS + BACKEND_VERIFY,
    "k3s-status": TRANSPORT + K3S_STATUS,
    "k3s-rollback": TRANSPORT + K3S_CONTROL + K3S_STATUS + BACKEND_VERIFY,
}


def commands_for(operation: str) -> tuple[tuple[str, str], ...]:
    try:
        return OPERATIONS[operation]
    except KeyError as exc:
        raise SystemExit(f"unknown OCI service operation: {operation}") from exc


def run(operation: str) -> None:
    commands = commands_for(operation)
    print(f"OCI service contracts: operation={operation} checks={len(commands)}")
    for script, argument in commands:
        subprocess.run(
            [sys.executable, "-S", script, argument],
            cwd=ROOT,
            check=True,
        )
    print(f"OCI service contracts OK: operation={operation}")


def self_test() -> None:
    expected = {
        "diagnose",
        "backend-diagnose",
        "mongo-target-diagnose",
        "mongo-network-diagnose",
        "reserved-egress",
        "smoke",
        "reboot-agent",
        "deploy",
        "bringup",
        "runtime-sync",
        "vault-bootstrap",
        "vault-validate",
        "vault-validate-pending",
        "vault-compare-current",
        "k3s-start",
        "k3s-status",
        "k3s-rollback",
    }
    assert set(OPERATIONS) == expected

    assert commands_for("diagnose") == TRANSPORT
    assert commands_for("smoke") == TRANSPORT
    assert commands_for("mongo-target-diagnose") == RENDER_MONGO_DIAG
    assert TRANSPORT[0] not in commands_for("mongo-target-diagnose")

    runtime_sync = commands_for("runtime-sync")
    assert runtime_sync == TRANSPORT + RUNTIME
    assert VAULT_RUNTIME[0] not in runtime_sync
    assert K3S_STATUS[0] not in runtime_sync

    vault_validate = commands_for("vault-validate")
    assert vault_validate == TRANSPORT + VAULT_RUNTIME
    assert K3S_CONTROL[0] not in vault_validate

    vault_compare = commands_for("vault-compare-current")
    assert vault_compare == TRANSPORT + VAULT_RUNTIME + VAULT_COMPARE
    assert RUNTIME[0] not in vault_compare
    assert K3S_CONTROL[0] not in vault_compare

    k3s_status = commands_for("k3s-status")
    assert k3s_status == TRANSPORT + K3S_STATUS
    assert VAULT_BOOTSTRAP[0] not in k3s_status
    assert RUNTIME[0] not in k3s_status

    k3s_start = commands_for("k3s-start")
    assert K3S_CONTROL[0] in k3s_start
    assert K3S_STATUS[0] in k3s_start
    assert BACKEND_VERIFY[0] in k3s_start
    assert VAULT_BOOTSTRAP[0] not in k3s_start

    for operation, commands in OPERATIONS.items():
        assert commands, operation
        assert len(commands) == len(set(commands)), f"duplicate service contract for {operation}"
        for script, argument in commands:
            assert script.startswith("scripts/") and script.endswith(".py")
            assert argument in {"--self-test", "self-test"}

    workflow = SERVICE_WORKFLOW.read_text(encoding="utf-8")
    assert "python3 scripts/oci_runtime_config.py sync" in workflow
    assert "Wait for OCI Run Command registration before runtime sync" not in workflow
    assert "for attempt in $(seq 1 60)" not in workflow
    assert "retrying in 10s" not in workflow
    assert "Host/agent registration convergence belongs to the infrastructure apply" in workflow
    assert "python3 scripts/oci_vault_compare.py compare-current" in workflow

    concurrency_block = workflow.split("\nconcurrency:\n", 1)[1].split("\njobs:\n", 1)[0]
    assert '"vault-compare-current"' not in concurrency_block, (
        "Vault runtime comparison is read-only and must not take the staging mutation mutex"
    )
    compare_block = workflow.split(
        "- name: Compare CURRENT Vault + Git runtime with installed backend.env", 1
    )[1].split("\n      - name:", 1)[0]
    assert "RENDER_API_KEY" not in compare_block
    assert "runtime-sync" not in compare_block

    print("OCI service contract isolation self-test: OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("operation", nargs="?", choices=tuple(OPERATIONS))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return 0
    if not args.operation:
        parser.error("operation is required unless --self-test is used")
    run(args.operation)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
