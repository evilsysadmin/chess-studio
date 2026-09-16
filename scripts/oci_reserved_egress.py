#!/usr/bin/env python3
"""Reconcile OCI staging onto the pre-existing reserved egress IPv4.

The staging A1 intentionally boots with an ephemeral public IP so cloud-init can
reach the Internet immediately. Once Oracle Cloud Agent / Run Command is ready,
this script replaces that ephemeral address with the operator-created reserved
public IP. It never creates a reserved IP and refuses ambiguous or unexpected
network state.
"""
from __future__ import annotations

import argparse
import ipaddress
import os
import sys
import time
from typing import Any

sys.path.insert(0, os.path.dirname(__file__))

RESERVED_DISPLAY_NAME = "chess-studio-staging-egress"
RESERVED_IPV4 = "158.180.44.45"
POLL_INTERVAL_SECONDS = 2
ASSIGN_TIMEOUT_SECONDS = 90


def normalize_ipv4(value: str) -> str:
    try:
        address = ipaddress.ip_address(str(value).strip())
    except ValueError as exc:
        raise SystemExit(f"Invalid IPv4 address: {value!r}") from exc
    if address.version != 4:
        raise SystemExit(f"Expected IPv4 address, got: {address}")
    return str(address)


def select_reserved(rows: list[Any]) -> Any:
    matches = [
        row
        for row in rows
        if str(getattr(row, "display_name", "") or "") == RESERVED_DISPLAY_NAME
        and str(getattr(row, "lifetime", "") or "").upper() == "RESERVED"
        and str(getattr(row, "scope", "") or "").upper() == "REGION"
    ]
    if len(matches) != 1:
        raise SystemExit(
            f"Expected exactly one reserved OCI public IP named {RESERVED_DISPLAY_NAME}; found {len(matches)}"
        )
    selected = matches[0]
    observed = normalize_ipv4(str(getattr(selected, "ip_address", "") or ""))
    if observed != RESERVED_IPV4:
        raise SystemExit(
            f"Reserved OCI egress IP drift: expected {RESERVED_IPV4}, found {observed}"
        )
    return selected


def primary_vnic(oci: Any, config: dict[str, str], compartment_id: str, instance_id: str) -> Any:
    compute = oci.core.ComputeClient(config)
    network = oci.core.VirtualNetworkClient(config)
    attachments = oci.pagination.list_call_get_all_results(
        compute.list_vnic_attachments,
        compartment_id,
        instance_id=instance_id,
        lifecycle_state="ATTACHED",
    ).data
    vnics = [
        network.get_vnic(
            attachment.vnic_id,
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
        for attachment in attachments
    ]
    primary = [vnic for vnic in vnics if bool(getattr(vnic, "is_primary", False))]
    if len(primary) != 1:
        raise SystemExit(f"Expected exactly one primary VNIC on staging instance; found {len(primary)}")
    return primary[0]


def primary_private_ip(oci: Any, config: dict[str, str], vnic_id: str) -> Any:
    network = oci.core.VirtualNetworkClient(config)
    rows = oci.pagination.list_call_get_all_results(
        network.list_private_ips,
        vnic_id=vnic_id,
    ).data
    primary = [row for row in rows if bool(getattr(row, "is_primary", False))]
    if len(primary) != 1:
        raise SystemExit(f"Expected exactly one primary private IP on staging VNIC; found {len(primary)}")
    return primary[0]


def current_public_ip(oci: Any, network: Any, private_ip_id: str) -> Any | None:
    try:
        return network.get_public_ip_by_private_ip_id(
            get_public_ip_by_private_ip_id_details=oci.core.models.GetPublicIpByPrivateIpIdDetails(
                private_ip_id=private_ip_id
            ),
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        ).data
    except oci.exceptions.ServiceError as exc:
        if exc.status == 404:
            return None
        raise


def wait_until_unassigned(oci: Any, network: Any, private_ip_id: str, *, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if current_public_ip(oci, network, private_ip_id) is None:
            return
        time.sleep(POLL_INTERVAL_SECONDS)
    raise SystemExit("Timed out waiting for ephemeral public IP to detach")


def wait_until_reserved_assigned(
    network: Any,
    reserved_id: str,
    private_ip_id: str,
    *,
    timeout: int,
) -> Any:
    deadline = time.monotonic() + timeout
    last_state = ""
    while time.monotonic() < deadline:
        observed = network.get_public_ip(reserved_id).data
        state = str(getattr(observed, "lifecycle_state", "") or "").upper()
        assigned = str(getattr(observed, "assigned_entity_id", "") or "")
        if state != last_state:
            print(f"OCI_RESERVED_EGRESS_STATE={state or 'UNKNOWN'}", flush=True)
            last_state = state
        if state == "ASSIGNED" and assigned == private_ip_id:
            return observed
        if state in {"TERMINATED", "TERMINATING"}:
            raise SystemExit(f"Reserved OCI egress entered unexpected state {state}")
        time.sleep(POLL_INTERVAL_SECONDS)
    raise SystemExit("Timed out waiting for reserved OCI egress assignment")


def restore_ephemeral(oci: Any, network: Any, compartment_id: str, private_ip_id: str) -> None:
    if current_public_ip(oci, network, private_ip_id) is not None:
        return
    print("OCI_RESERVED_EGRESS_ROLLBACK=creating_ephemeral", flush=True)
    network.create_public_ip(
        oci.core.models.CreatePublicIpDetails(
            compartment_id=compartment_id,
            lifetime="EPHEMERAL",
            private_ip_id=private_ip_id,
            display_name="chess-studio-staging-egress-rollback",
        ),
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    )


def reconcile(oci: Any, config: dict[str, str]) -> None:
    from oci_run_command import resolve_staging

    compartment_id, instance_id = resolve_staging(oci, config)
    network = oci.core.VirtualNetworkClient(config)

    reserved_rows = oci.pagination.list_call_get_all_results(
        network.list_public_ips,
        scope="REGION",
        compartment_id=compartment_id,
        lifetime="RESERVED",
    ).data
    reserved = select_reserved(reserved_rows)

    vnic = primary_vnic(oci, config, compartment_id, instance_id)
    private_ip = primary_private_ip(oci, config, str(vnic.id))
    private_ip_id = str(private_ip.id)
    reserved_id = str(reserved.id)
    reserved_assigned = str(getattr(reserved, "assigned_entity_id", "") or "")

    print(f"OCI_RESERVED_EGRESS_IPV4={RESERVED_IPV4}", flush=True)
    print(f"OCI_CURRENT_VNIC_PUBLIC_IPV4={str(getattr(vnic, 'public_ip', '') or '')}", flush=True)

    if reserved_assigned and reserved_assigned != private_ip_id:
        raise SystemExit("Reserved OCI egress is already assigned to a different entity; refusing to steal it")

    current = current_public_ip(oci, network, private_ip_id)
    if current is not None and str(getattr(current, "id", "")) == reserved_id:
        print("OCI_RESERVED_EGRESS_RECONCILED=already-assigned", flush=True)
        return

    if current is not None:
        lifetime = str(getattr(current, "lifetime", "") or "").upper()
        current_ipv4 = normalize_ipv4(str(getattr(current, "ip_address", "") or ""))
        if lifetime != "EPHEMERAL":
            raise SystemExit(
                f"Primary private IP already has unexpected non-ephemeral public IP {current_ipv4}; refusing mutation"
            )
        print(f"OCI_EPHEMERAL_EGRESS_REMOVING={current_ipv4}", flush=True)
        network.delete_public_ip(
            str(current.id),
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        )
        wait_until_unassigned(oci, network, private_ip_id, timeout=45)

    try:
        network.update_public_ip(
            reserved_id,
            oci.core.models.UpdatePublicIpDetails(private_ip_id=private_ip_id),
            retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
        )
        observed = wait_until_reserved_assigned(
            network,
            reserved_id,
            private_ip_id,
            timeout=ASSIGN_TIMEOUT_SECONDS,
        )
    except (Exception, SystemExit):
        try:
            restore_ephemeral(oci, network, compartment_id, private_ip_id)
        except (Exception, SystemExit) as rollback_exc:
            print(
                f"OCI_RESERVED_EGRESS_ROLLBACK_ERROR={type(rollback_exc).__name__}:{str(rollback_exc)[:240]}",
                flush=True,
            )
        raise

    observed_ipv4 = normalize_ipv4(str(getattr(observed, "ip_address", "") or ""))
    if observed_ipv4 != RESERVED_IPV4:
        raise SystemExit(
            f"Reserved OCI egress assignment returned unexpected IPv4 {observed_ipv4}"
        )
    refreshed_vnic = network.get_vnic(
        str(vnic.id),
        retry_strategy=oci.retry.DEFAULT_RETRY_STRATEGY,
    ).data
    vnic_public = normalize_ipv4(str(getattr(refreshed_vnic, "public_ip", "") or ""))
    if vnic_public != RESERVED_IPV4:
        raise SystemExit(
            f"Primary VNIC reports {vnic_public} after reserved egress assignment; expected {RESERVED_IPV4}"
        )
    print("OCI_RESERVED_EGRESS_RECONCILED=yes", flush=True)


def self_test() -> None:
    class Row:
        def __init__(self, **kwargs: Any) -> None:
            self.__dict__.update(kwargs)

    lb = Row(
        display_name="Floating IP for VIP public-vip",
        lifetime="RESERVED",
        scope="REGION",
        ip_address="92.5.110.47",
    )
    target = Row(
        display_name=RESERVED_DISPLAY_NAME,
        lifetime="RESERVED",
        scope="REGION",
        ip_address=RESERVED_IPV4,
    )
    assert select_reserved([lb, target]) is target
    assert normalize_ipv4("158.180.44.45") == RESERVED_IPV4
    try:
        select_reserved([lb])
    except SystemExit:
        pass
    else:
        raise AssertionError("missing reserved egress must fail closed")
    drifted = Row(
        display_name=RESERVED_DISPLAY_NAME,
        lifetime="RESERVED",
        scope="REGION",
        ip_address="203.0.113.10",
    )
    try:
        select_reserved([drifted])
    except SystemExit:
        pass
    else:
        raise AssertionError("reserved IPv4 drift must fail closed")
    print("OCI reserved egress self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    try:
        import oci
    except ImportError as exc:
        raise SystemExit("OCI Python SDK is required") from exc

    from oci_run_command import config_from_env

    reconcile(oci, config_from_env(oci))


if __name__ == "__main__":
    main()
