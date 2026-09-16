#!/usr/bin/env python3
"""Read-only OCI staging egress diagnostic.

Compares the public IPv4 assigned to the staging A1 VNIC with the IPv4 seen by
external services from inside the instance. It never reads runtime config or
application secrets and performs no infrastructure mutation.
"""
from __future__ import annotations

import argparse
import ipaddress
import os
import sys
from typing import Any

sys.path.insert(0, os.path.dirname(__file__))

from oci_run_command import config_from_env, execute, resolve_staging  # noqa: E402

EGRESS_MARKER = "OCI_EGRESS_OBSERVED_IPV4="
DEFAULT_EXPECTED_IPV4 = "158.180.44.45"


def normalize_ipv4(value: str) -> str:
    try:
        address = ipaddress.ip_address(str(value).strip())
    except ValueError as exc:
        raise SystemExit(f"Invalid IPv4 address: {value!r}") from exc
    if address.version != 4:
        raise SystemExit(f"Expected IPv4 address, got: {address}")
    return str(address)


def egress_probe_command() -> str:
    return r'''set -euo pipefail
python3 - <<'PY_INNER'
import ipaddress
import urllib.request

urls = (
    "https://api.ipify.org",
    "https://checkip.amazonaws.com",
)
observed = []
for url in urls:
    try:
        with urllib.request.urlopen(url, timeout=8) as response:
            value = response.read(128).decode("ascii", "strict").strip()
        ip = ipaddress.ip_address(value)
        if ip.version == 4:
            observed.append(str(ip))
    except Exception:
        pass

if not observed:
    raise SystemExit("OCI_EGRESS_PROBE_FAILED")
if len(set(observed)) != 1:
    raise SystemExit("OCI_EGRESS_PROBE_INCONSISTENT")
print("OCI_EGRESS_OBSERVED_IPV4=" + observed[0])
PY_INNER
'''


def extract_observed_ipv4(output: str) -> str:
    values = [
        line[len(EGRESS_MARKER):].strip()
        for line in output.splitlines()
        if line.startswith(EGRESS_MARKER)
    ]
    if len(values) != 1:
        raise SystemExit("Run Command did not return exactly one egress IPv4 marker")
    return normalize_ipv4(values[0])


def assigned_public_ipv4(oci: Any, config: dict[str, str]) -> str:
    compartment_id, instance_id = resolve_staging(oci, config)
    compute = oci.core.ComputeClient(config)
    network = oci.core.VirtualNetworkClient(config)
    attachments = oci.pagination.list_call_get_all_results(
        compute.list_vnic_attachments,
        compartment_id,
        instance_id=instance_id,
    ).data
    candidates: list[tuple[bool, str]] = []
    for attachment in attachments:
        vnic = network.get_vnic(
            attachment.vnic_id,
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
        public_ip = str(getattr(vnic, "public_ip", "") or "").strip()
        if public_ip:
            candidates.append((bool(getattr(vnic, "is_primary", False)), normalize_ipv4(public_ip)))
    if not candidates:
        raise SystemExit("Running staging instance has no public IPv4 on its VNICs")
    primary = [ip for is_primary, ip in candidates if is_primary]
    if len(primary) == 1:
        return primary[0]
    unique = sorted({ip for _, ip in candidates})
    if len(unique) != 1:
        raise SystemExit(f"Ambiguous public IPv4 set on staging instance: {', '.join(unique)}")
    return unique[0]


def diagnose_egress(
    oci: Any,
    config: dict[str, str],
    *,
    expected: str | None = DEFAULT_EXPECTED_IPV4,
) -> bool:
    assigned = assigned_public_ipv4(oci, config)
    print(f"OCI_VNIC_PUBLIC_IPV4={assigned}", flush=True)

    normalized_expected = normalize_ipv4(expected) if expected else None
    if normalized_expected:
        print(f"OCI_EGRESS_EXPECTED_IPV4={normalized_expected}", flush=True)
        print(
            f"OCI_VNIC_MATCH_EXPECTED={'yes' if assigned == normalized_expected else 'no'}",
            flush=True,
        )

    try:
        output = execute(
            oci,
            config,
            egress_probe_command(),
            display_name="Chess Studio staging egress diagnostic",
            timeout=45,
        )
        observed = extract_observed_ipv4(output)
    except SystemExit as exc:
        print(f"OCI_EGRESS_PROBE_ERROR={str(exc)[:300]}", flush=True)
        return False

    print(f"OCI_EGRESS_OBSERVED_IPV4={observed}", flush=True)
    match_vnic = assigned == observed
    print(f"OCI_EGRESS_MATCH_VNIC={'yes' if match_vnic else 'no'}", flush=True)
    if normalized_expected:
        print(
            f"OCI_EGRESS_MATCH_EXPECTED={'yes' if observed == normalized_expected else 'no'}",
            flush=True,
        )
    return match_vnic and (normalized_expected is None or observed == normalized_expected)


def self_test() -> None:
    assert normalize_ipv4("158.180.44.45") == "158.180.44.45"
    sample = "noise\nOCI_EGRESS_OBSERVED_IPV4=158.180.44.45\n"
    assert extract_observed_ipv4(sample) == "158.180.44.45"
    command = egress_probe_command()
    assert "MONGO_URL" not in command
    assert "JWT_SECRET" not in command
    assert "backend.env" not in command
    assert "api.ipify.org" in command and "checkip.amazonaws.com" in command
    assert DEFAULT_EXPECTED_IPV4 == "158.180.44.45"
    print("OCI egress diagnostic self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--expected",
        default=DEFAULT_EXPECTED_IPV4,
        help="Expected egress IPv4 (defaults to current Atlas /32 allowlist)",
    )
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    try:
        import oci
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required") from exc

    config = config_from_env(oci)
    if not diagnose_egress(oci, config, expected=args.expected):
        raise SystemExit("OCI egress diagnostic did not fully match expected routing")


if __name__ == "__main__":
    main()
