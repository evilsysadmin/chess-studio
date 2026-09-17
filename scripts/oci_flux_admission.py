#!/usr/bin/env python3
"""Fail-closed admission gate for a future minimal Flux install on OCI staging."""
from __future__ import annotations

import argparse
import re
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "infra/oci/gitops/flux/versions.env"
STATUS_MARKER = "OCI_K3S_STATUS_OK"
SUCCESS_MARKER = "OCI_FLUX_ADMISSION_OK"


@dataclass(frozen=True)
class Policy:
    min_mem_mib: int
    min_disk_mib: int


def _read_env(path: Path = VERSIONS) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not key or not value:
            raise SystemExit(f"invalid Flux versions entry: {raw!r}")
        result[key] = value
    return result


def _policy() -> Policy:
    env = _read_env()
    return Policy(
        min_mem_mib=int(env["FLUX_MIN_MEM_AVAILABLE_MIB"]),
        min_disk_mib=int(env["FLUX_MIN_DISK_FREE_MIB"]),
    )


def parse_status(line: str) -> dict[str, str]:
    stripped = line.strip()
    if not stripped.startswith(STATUS_MARKER + " "):
        raise ValueError(f"missing {STATUS_MARKER} marker")
    fields: dict[str, str] = {}
    for token in stripped.split()[1:]:
        key, sep, value = token.partition("=")
        if sep and key and value:
            fields[key] = value
    return fields


def admit(line: str, policy: Policy | None = None) -> tuple[bool, str]:
    policy = policy or _policy()
    try:
        fields = parse_status(line)
        mem = int(fields["mem_available_mib"])
        disk = int(fields["disk_free_mib"])
    except (KeyError, ValueError) as exc:
        return False, f"invalid-status:{exc}"

    required = {
        "active": "true",
        "enabled": "enabled",
        "approval": "valid",
        "node_ready": "true",
        "system_deployments_ready": "true",
    }
    for key, expected in required.items():
        if fields.get(key) != expected:
            return False, f"{key}={fields.get(key, 'missing')}"
    if mem < policy.min_mem_mib:
        return False, f"mem_available_mib={mem}<{policy.min_mem_mib}"
    if disk < policy.min_disk_mib:
        return False, f"disk_free_mib={disk}<{policy.min_disk_mib}"
    return True, f"mem_available_mib={mem} disk_free_mib={disk}"


def self_test() -> None:
    policy = Policy(min_mem_mib=4096, min_disk_mib=32768)
    healthy = (
        "OCI_K3S_STATUS_OK version=v1.36.4+k3s1 active=true enabled=enabled approval=valid "
        "node_ready=true node=chessbackend system_deployments_ready=true pod_count=3 "
        "mem_available_mib=4794 disk_free_mib=43650 load1=0.20"
    )
    ok, _ = admit(healthy, policy)
    assert ok
    for broken in (
        healthy.replace("active=true", "active=false"),
        healthy.replace("approval=valid", "approval=missing"),
        healthy.replace("node_ready=true", "node_ready=false"),
        healthy.replace("system_deployments_ready=true", "system_deployments_ready=false"),
        healthy.replace("mem_available_mib=4794", "mem_available_mib=4095"),
        healthy.replace("disk_free_mib=43650", "disk_free_mib=32767"),
        "not-a-k3s-status-line",
    ):
        allowed, _ = admit(broken, policy)
        assert not allowed
    assert re.fullmatch(r"v\d+\.\d+\.\d+", _read_env()["FLUX_VERSION"])
    print("OCI Flux admission self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--status-line")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if not args.status_line:
        raise SystemExit("--status-line is required")
    allowed, reason = admit(args.status_line)
    if not allowed:
        raise SystemExit(f"OCI_FLUX_ADMISSION_DENIED {reason}")
    print(f"{SUCCESS_MARKER} {reason}")


if __name__ == "__main__":
    main()
