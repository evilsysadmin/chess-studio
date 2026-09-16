#!/usr/bin/env python3
"""Give the existing OCI staging A1 a stable reserved public egress IP.

Safety contract:
- allocate the reserved IP first; if Always Free/service limits reject it, do nothing;
- only then remove the current ephemeral IP and attach the reserved one;
- if assignment fails, recreate an ephemeral public IP as a best-effort network fallback;
- print only public IP metadata, never application secrets.
"""
from __future__ import annotations

import argparse
import time
from typing import Any

from oci_run_command import config_from_env, resolve_staging

DISPLAY_NAME = "chess-studio-staging-egress"


def _is_not_found(exc: Exception) -> bool:
    return int(getattr(exc, "status", 0) or 0) == 404


def _primary_private_ip(oci: Any, config: dict[str, str], compartment_id: str, instance_id: str):
    compute = oci.core.ComputeClient(config)
    network = oci.core.VirtualNetworkClient(config)
    attachments = oci.pagination.list_call_get_all_results(
        compute.list_vnic_attachments,
        compartment_id,
        instance_id=instance_id,
    ).data
    primary_vnic = None
    for attachment in attachments:
        vnic = network.get_vnic(attachment.vnic_id).data
        if bool(getattr(vnic, "is_primary", False)):
            primary_vnic = vnic
            break
    if primary_vnic is None:
        raise SystemExit("Could not resolve the staging primary VNIC")

    private_ips = oci.pagination.list_call_get_all_results(
        network.list_private_ips,
        vnic_id=primary_vnic.id,
    ).data
    primary_private = next(
        (row for row in private_ips if bool(getattr(row, "is_primary", False))),
        None,
    )
    if primary_private is None:
        raise SystemExit("Could not resolve the staging primary private IP")
    return network, primary_vnic, primary_private


def _public_for_private(oci: Any, network: Any, private_ip_id: str):
    try:
        return network.get_public_ip_by_private_ip_id(
            oci.core.models.GetPublicIpByPrivateIpIdDetails(private_ip_id=private_ip_id),
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
    except Exception as exc:
        if _is_not_found(exc):
            return None
        raise


def _wait_no_public(oci: Any, network: Any, private_ip_id: str, timeout: int = 90) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _public_for_private(oci, network, private_ip_id) is None:
            return
        time.sleep(2)
    raise SystemExit("Timed out waiting for the ephemeral public IP to detach")


def _wait_reserved_assigned(network: Any, public_ip_id: str, private_ip_id: str, timeout: int = 120):
    deadline = time.monotonic() + timeout
    last_state = "UNKNOWN"
    while time.monotonic() < deadline:
        row = network.get_public_ip(public_ip_id).data
        last_state = str(getattr(row, "lifecycle_state", "UNKNOWN") or "UNKNOWN").upper()
        assigned = str(
            getattr(row, "assigned_entity_id", None)
            or getattr(row, "private_ip_id", None)
            or ""
        )
        if last_state == "ASSIGNED" and assigned == private_ip_id:
            return row
        time.sleep(2)
    raise SystemExit(f"Timed out assigning reserved public IP; last_state={last_state}")


def reserve(oci: Any) -> None:
    config = config_from_env(oci)
    compartment_id, instance_id = resolve_staging(oci, config)
    network, vnic, private_ip = _primary_private_ip(
        oci, config, compartment_id, instance_id
    )
    current = _public_for_private(oci, network, private_ip.id)

    if current is not None and str(getattr(current, "lifetime", "")).upper() == "RESERVED":
        print(
            "OCI_RESERVED_EGRESS_READY "
            f"address={current.ip_address} lifetime=RESERVED changed=no"
        )
        return

    old_address = str(getattr(current, "ip_address", "") or getattr(vnic, "public_ip", "") or "none")

    # This allocation is intentionally first. If the tenancy's Always Free/service
    # limit does not permit a reserved IP, OCI rejects here and the current
    # ephemeral address remains untouched.
    reserved = network.create_public_ip(
        oci.core.models.CreatePublicIpDetails(
            compartment_id=compartment_id,
            lifetime="RESERVED",
            display_name=DISPLAY_NAME,
            freeform_tags={
                "service": "chess-studio",
                "component": "backend-egress",
                "managed_by": "p0-migration",
            },
        ),
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data

    try:
        if current is not None:
            network.delete_public_ip(
                current.id,
                retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
            )
            _wait_no_public(oci, network, private_ip.id)

        network.update_public_ip(
            reserved.id,
            oci.core.models.UpdatePublicIpDetails(private_ip_id=private_ip.id),
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        )
        assigned = _wait_reserved_assigned(network, reserved.id, private_ip.id)
    except Exception:
        # Restore internet reachability as best effort. The exact old ephemeral
        # address cannot be recovered by OCI, but the host should not be stranded.
        try:
            if _public_for_private(oci, network, private_ip.id) is None:
                network.create_public_ip(
                    oci.core.models.CreatePublicIpDetails(
                        compartment_id=compartment_id,
                        lifetime="EPHEMERAL",
                        private_ip_id=private_ip.id,
                        display_name="chess-studio-staging-fallback",
                    ),
                    retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
                )
        finally:
            try:
                row = network.get_public_ip(reserved.id).data
                assigned_to = str(
                    getattr(row, "assigned_entity_id", None)
                    or getattr(row, "private_ip_id", None)
                    or ""
                )
                if not assigned_to:
                    network.delete_public_ip(reserved.id)
            except Exception:
                pass
        raise

    print(
        "OCI_RESERVED_EGRESS_READY "
        f"address={assigned.ip_address} lifetime=RESERVED changed=yes old_address={old_address}"
    )


def self_test() -> None:
    assert DISPLAY_NAME == "chess-studio-staging-egress"
    assert _is_not_found(type("E", (), {"status": 404})())
    assert not _is_not_found(type("E", (), {"status": 429})())
    print("OCI reserved egress IP self-test: OK")


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
    reserve(oci)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
