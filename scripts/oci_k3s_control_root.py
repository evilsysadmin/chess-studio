#!/usr/bin/env python3
"""Narrow root-only lifecycle control for the pinned OCI staging K3s node.

This wrapper is installed root-owned and exposed to `ocarun` only with the
literal `start` and `rollback` arguments. It never reads executable content
from the repository at invocation time.
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

K3S_VERSION = "v1.36.4+k3s1"
BUNDLE_SHA256 = "db0972ea4c9439e238e777f26d579ae29865f22f05f70c9a01989cc772611256"
K3S_BINARY_SHA256 = "c920706346d5ad4e5cd3c7bf1bb09ce71ebe07fec829e513e40f1caf98aed8bb"
K3S_IMAGES_SHA256 = "9d3c4c2197bcf857ca17633aa393bad683cc982ddd408620f93036a3cca953b5"
CONFIG_SHA256 = "f58e11d4d22fe63c8ea88db6540a461f2f9d8769c1e061d7ea5898fc6ce728a7"
UNIT_SHA256 = "909ee145a04f6594fc2047e284771ce6e832fe9cc5ef995851c442426ebf774b"

ASSET_MARKER = Path("/var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY")
START_APPROVAL = Path("/var/lib/chess-studio/K3S_START_APPROVED")
K3S_BINARY = Path("/usr/local/bin/k3s")
K3S_IMAGES = Path("/var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst")
CONFIG = Path("/etc/rancher/k3s/config.yaml")
UNIT = Path("/etc/systemd/system/k3s.service")
K3S_STATE = Path("/var/lib/rancher/k3s")

MIN_START_MEM_AVAILABLE = 4 * 1024**3
MIN_READY_MEM_AVAILABLE = 3 * 1024**3
MIN_START_DISK_FREE = 8 * 1024**3
MIN_READY_DISK_FREE = 6 * 1024**3
READY_TIMEOUT_SECONDS = 300
POLL_SECONDS = 3
ENABLED_STATES = {"enabled", "enabled-runtime", "linked", "linked-runtime"}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_regular(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"{label} must be a regular non-symlink file: {path}")


def _approval_text() -> str:
    return (
        f"K3S_START_APPROVED version={K3S_VERSION} "
        f"config_sha256={CONFIG_SHA256} unit_sha256={UNIT_SHA256}\n"
    )


def _verify_pinned_contract() -> None:
    _require_regular(ASSET_MARKER, "K3s asset marker")
    expected_marker = (
        f"K3S_AIRGAP_ASSETS_READY version={K3S_VERSION} bundle_sha256={BUNDLE_SHA256}"
    )
    if ASSET_MARKER.read_text(encoding="utf-8").strip() != expected_marker:
        raise SystemExit("K3s asset marker does not match the pinned start contract")

    for path, digest, label in (
        (K3S_BINARY, K3S_BINARY_SHA256, "K3s binary"),
        (K3S_IMAGES, K3S_IMAGES_SHA256, "K3s air-gap images"),
        (CONFIG, CONFIG_SHA256, "K3s config"),
        (UNIT, UNIT_SHA256, "K3s unit"),
    ):
        _require_regular(path, label)
        if _sha256(path) != digest:
            raise SystemExit(f"{label} digest does not match the pinned start contract")

    unit_text = UNIT.read_text(encoding="utf-8")
    if "ExecStartPre=/usr/bin/test -f /var/lib/chess-studio/K3S_START_APPROVED" not in unit_text:
        raise SystemExit("K3s unit lost the explicit start-approval fuse")
    if "ExecStart=/usr/local/bin/k3s server" not in unit_text:
        raise SystemExit("K3s unit does not execute the pinned binary path")


def _systemctl(*args: str, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["systemctl", *args],
        check=check,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=45,
    )


def _active() -> bool:
    return _systemctl("is-active", "--quiet", "k3s.service").returncode == 0


def _enabled_state() -> str:
    result = _systemctl("is-enabled", "k3s.service")
    return result.stdout.strip() or "not-found"


def _read_mem_available() -> int:
    for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
        if line.startswith("MemAvailable:"):
            fields = line.split()
            if len(fields) >= 2 and fields[1].isdigit():
                return int(fields[1]) * 1024
    raise SystemExit("could not read MemAvailable from /proc/meminfo")


def _disk_free() -> int:
    K3S_STATE.mkdir(parents=True, exist_ok=True, mode=0o755)
    stats = os.statvfs(K3S_STATE)
    return stats.f_bavail * stats.f_frsize


def _resources() -> tuple[int, int, float]:
    return _read_mem_available(), _disk_free(), os.getloadavg()[0]


def _resource_gate(mem_floor: int, disk_floor: int, phase: str) -> tuple[int, int, float]:
    mem, disk, load1 = _resources()
    if mem < mem_floor:
        raise SystemExit(
            f"K3s {phase} resource gate failed: MemAvailable={mem // 1024**2}MiB "
            f"requires>={mem_floor // 1024**2}MiB"
        )
    if disk < disk_floor:
        raise SystemExit(
            f"K3s {phase} resource gate failed: disk_free={disk // 1024**2}MiB "
            f"requires>={disk_floor // 1024**2}MiB"
        )
    return mem, disk, load1


def _write_approval() -> None:
    if START_APPROVAL.exists() or START_APPROVAL.is_symlink():
        _require_regular(START_APPROVAL, "K3s start approval marker")
        if START_APPROVAL.read_text(encoding="utf-8") != _approval_text():
            raise SystemExit("existing K3s start approval marker has an unexpected contract")
        return
    START_APPROVAL.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{START_APPROVAL.name}.", dir=START_APPROVAL.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", closefd=True) as handle:
            handle.write(_approval_text())
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, 0o644)
        os.chown(tmp_name, 0, 0)
        os.replace(tmp_name, START_APPROVAL)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def _kubectl_json(*args: str) -> dict:
    completed = subprocess.run(
        [str(K3S_BINARY), "kubectl", *args, "-o", "json"],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=12,
    )
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


def _deployments_ready(payload: dict) -> bool:
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


def _wait_ready() -> str:
    deadline = time.monotonic() + READY_TIMEOUT_SECONDS
    last = ""
    while time.monotonic() < deadline:
        if not _active():
            state = _systemctl("is-active", "k3s.service").stdout.strip() or "inactive"
            if state == "failed":
                raise SystemExit("K3s service entered failed state during bootstrap")
            time.sleep(POLL_SECONDS)
            continue
        nodes = _kubectl_json("get", "nodes")
        deployments = _kubectl_json(
            "-n", "kube-system", "get", "deployment", "coredns", "metrics-server"
        )
        ready, node_name = _node_ready(nodes)
        marker = f"node_ready={ready} system_deployments={_deployments_ready(deployments)}"
        if marker != last:
            print(f"OCI_K3S_BOOTSTRAP_WAIT {marker}", flush=True)
            last = marker
        if ready and _deployments_ready(deployments):
            return node_name
        time.sleep(POLL_SECONDS)
    raise SystemExit(f"K3s did not become Ready within {READY_TIMEOUT_SECONDS}s")


def _remove_approval() -> None:
    if START_APPROVAL.is_symlink():
        raise SystemExit("refusing to remove symlinked K3s start approval marker")
    try:
        START_APPROVAL.unlink()
    except FileNotFoundError:
        pass


def rollback(reason: str = "explicit") -> None:
    if os.geteuid() != 0:
        raise SystemExit("K3s lifecycle control requires root")
    if not Path("/run/systemd/system").is_dir():
        raise SystemExit("K3s lifecycle control requires systemd")
    _systemctl("disable", "--now", "k3s.service")
    if _active():
        raise SystemExit("K3s rollback could not stop k3s.service; approval marker retained")
    if _enabled_state() in ENABLED_STATES:
        raise SystemExit("K3s rollback could not disable k3s.service; approval marker retained")
    _remove_approval()
    mem, disk, load1 = _resources()
    print(
        "OCI_K3S_ROLLBACK_OK "
        f"reason={reason} active=false enabled={_enabled_state()} "
        f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f}"
    )


def start() -> None:
    if os.geteuid() != 0:
        raise SystemExit("K3s lifecycle control requires root")
    if not Path("/run/systemd/system").is_dir():
        raise SystemExit("K3s lifecycle control requires systemd")
    _verify_pinned_contract()
    pre_mem, pre_disk, pre_load = _resource_gate(
        MIN_START_MEM_AVAILABLE, MIN_START_DISK_FREE, "pre-start"
    )

    already_active = _active()
    approved_before = START_APPROVAL.exists() or START_APPROVAL.is_symlink()
    if already_active and not approved_before:
        raise SystemExit("K3s is active without the explicit approval marker")
    if _enabled_state() in ENABLED_STATES and not approved_before:
        raise SystemExit("K3s is enabled without the explicit approval marker")

    _write_approval()
    mutated = not approved_before or not already_active
    try:
        _systemctl("daemon-reload", check=True)
        if not already_active:
            _systemctl("start", "k3s.service", check=True)
        node_name = _wait_ready()
        post_mem, post_disk, post_load = _resource_gate(
            MIN_READY_MEM_AVAILABLE, MIN_READY_DISK_FREE, "ready"
        )
        _systemctl("enable", "k3s.service", check=True)
        if _enabled_state() not in ENABLED_STATES:
            raise SystemExit("K3s became Ready but systemd enablement did not persist")
    except BaseException:
        if mutated:
            try:
                rollback("start-failed")
            except BaseException as rollback_exc:
                print(f"OCI_K3S_ROLLBACK_FAILED detail={rollback_exc}", file=sys.stderr)
        raise

    print(
        "OCI_K3S_START_OK "
        f"version={K3S_VERSION} node={node_name} active=true enabled={_enabled_state()} "
        f"pre_mem_mib={pre_mem // 1024**2} post_mem_mib={post_mem // 1024**2} "
        f"pre_disk_mib={pre_disk // 1024**2} post_disk_mib={post_disk // 1024**2} "
        f"pre_load1={pre_load:.2f} post_load1={post_load:.2f} "
        "coredns=ready metrics_server=ready"
    )


def self_test() -> None:
    assert len(BUNDLE_SHA256) == 64
    assert len(K3S_BINARY_SHA256) == 64
    assert len(K3S_IMAGES_SHA256) == 64
    assert len(CONFIG_SHA256) == 64
    assert len(UNIT_SHA256) == 64
    assert MIN_START_MEM_AVAILABLE > MIN_READY_MEM_AVAILABLE
    assert MIN_START_DISK_FREE > MIN_READY_DISK_FREE
    assert READY_TIMEOUT_SECONDS <= 300
    assert START_APPROVAL == Path("/var/lib/chess-studio/K3S_START_APPROVED")
    sample = {
        "items": [
            {
                "metadata": {"name": "staging-node"},
                "status": {"conditions": [{"type": "Ready", "status": "True"}]},
            }
        ]
    }
    assert _node_ready(sample) == (True, "staging-node")
    assert _deployments_ready(
        {
            "items": [
                {"metadata": {"name": "coredns"}, "status": {"availableReplicas": 1}},
                {"metadata": {"name": "metrics-server"}, "status": {"availableReplicas": 1}},
            ]
        }
    )
    print("OCI K3s lifecycle control self-test: OK")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in {"start", "rollback", "self-test"}:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} <start|rollback|self-test>")
    operation = sys.argv[1]
    if operation == "self-test":
        self_test()
    elif operation == "start":
        start()
    else:
        rollback()


if __name__ == "__main__":
    main()
