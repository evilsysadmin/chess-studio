#!/usr/bin/env python3
"""Read-only root status probe for the pinned OCI staging K3s node.

The installed wrapper is root-owned and exposed to `ocarun` with no arguments.
It reports service, cluster and host-resource state without mutating systemd,
Kubernetes, files or network configuration.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

K3S_VERSION = "v1.36.4+k3s1"
K3S_BINARY = Path("/usr/local/bin/k3s")
START_APPROVAL = Path("/var/lib/chess-studio/K3S_START_APPROVED")
K3S_STATE = Path("/var/lib/rancher/k3s")
ENABLED_STATES = {"enabled", "enabled-runtime", "linked", "linked-runtime"}


def _run(*args: str, timeout: int = 20) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [*args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=timeout,
    )


def _systemctl(*args: str) -> subprocess.CompletedProcess[str]:
    return _run("systemctl", *args)


def _active() -> bool:
    return _systemctl("is-active", "--quiet", "k3s.service").returncode == 0


def _enabled_state() -> str:
    result = _systemctl("is-enabled", "k3s.service")
    return result.stdout.strip() or "not-found"


def _approval_state() -> str:
    if START_APPROVAL.is_symlink():
        return "symlink"
    if not START_APPROVAL.exists():
        return "missing"
    if not START_APPROVAL.is_file():
        return "invalid"
    expected_prefix = f"K3S_START_APPROVED version={K3S_VERSION} "
    try:
        text = START_APPROVAL.read_text(encoding="utf-8")
    except OSError:
        return "unreadable"
    return "valid" if text.startswith(expected_prefix) else "invalid"


def _read_mem_available() -> int:
    for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
        if line.startswith("MemAvailable:"):
            fields = line.split()
            if len(fields) >= 2 and fields[1].isdigit():
                return int(fields[1]) * 1024
    raise SystemExit("could not read MemAvailable from /proc/meminfo")


def _disk_free() -> int:
    probe = K3S_STATE if K3S_STATE.exists() else Path("/var/lib/rancher")
    if not probe.exists():
        probe = Path("/")
    stats = os.statvfs(probe)
    return stats.f_bavail * stats.f_frsize


def _kubectl_json(*args: str) -> dict:
    if not K3S_BINARY.is_file() or K3S_BINARY.is_symlink():
        return {}
    completed = _run(str(K3S_BINARY), "kubectl", *args, "-o", "json", timeout=12)
    if completed.returncode != 0:
        return {}
    try:
        value = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _node_ready(payload: dict) -> tuple[bool, str]:
    items = payload.get("items")
    if not isinstance(items, list) or len(items) != 1 or not isinstance(items[0], dict):
        return False, ""
    node = items[0]
    name = str((node.get("metadata") or {}).get("name") or "")
    conditions = (node.get("status") or {}).get("conditions") or []
    ready = any(
        isinstance(row, dict)
        and row.get("type") == "Ready"
        and row.get("status") == "True"
        for row in conditions
    )
    return ready, name


def _system_deployments_ready(payload: dict) -> bool:
    items = payload.get("items")
    if not isinstance(items, list):
        return False
    observed: dict[str, int] = {}
    for row in items:
        if not isinstance(row, dict):
            continue
        name = str((row.get("metadata") or {}).get("name") or "")
        available = int((row.get("status") or {}).get("availableReplicas") or 0)
        observed[name] = available
    return observed.get("coredns", 0) >= 1 and observed.get("metrics-server", 0) >= 1


def _pod_count(payload: dict) -> int:
    items = payload.get("items")
    return len(items) if isinstance(items, list) else 0


def status() -> None:
    if os.geteuid() != 0:
        raise SystemExit("K3s status probe requires root")
    if not Path("/run/systemd/system").is_dir():
        raise SystemExit("K3s status probe requires systemd")

    active = _active()
    enabled = _enabled_state()
    approval = _approval_state()
    node_ready = False
    node_name = ""
    system_ready = False
    pod_count = 0

    if active:
        node_ready, node_name = _node_ready(_kubectl_json("get", "nodes"))
        system_ready = _system_deployments_ready(
            _kubectl_json("-n", "kube-system", "get", "deployment", "coredns", "metrics-server")
        )
        pod_count = _pod_count(_kubectl_json("get", "pods", "-A"))

    mem = _read_mem_available()
    disk = _disk_free()
    load1 = os.getloadavg()[0]
    print(
        "OCI_K3S_STATUS_OK "
        f"version={K3S_VERSION} active={'true' if active else 'false'} "
        f"enabled={enabled} approval={approval} "
        f"node_ready={'true' if node_ready else 'false'} node={node_name or '-'} "
        f"system_deployments_ready={'true' if system_ready else 'false'} pod_count={pod_count} "
        f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f}"
    )


def self_test() -> None:
    assert START_APPROVAL == Path("/var/lib/chess-studio/K3S_START_APPROVED")
    assert K3S_STATE == Path("/var/lib/rancher/k3s")
    assert "enabled" in ENABLED_STATES
    ready_sample = {
        "items": [
            {
                "metadata": {"name": "staging-node"},
                "status": {"conditions": [{"type": "Ready", "status": "True"}]},
            }
        ]
    }
    assert _node_ready(ready_sample) == (True, "staging-node")
    assert _system_deployments_ready(
        {
            "items": [
                {"metadata": {"name": "coredns"}, "status": {"availableReplicas": 1}},
                {"metadata": {"name": "metrics-server"}, "status": {"availableReplicas": 1}},
            ]
        }
    )
    assert _pod_count({"items": [{}, {}, {}]}) == 3
    print("OCI K3s read-only status self-test: OK")


def main() -> None:
    args = sys.argv[1:]
    if args == ["self-test"]:
        self_test()
        return
    if args:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} [self-test]")
    status()


if __name__ == "__main__":
    main()
