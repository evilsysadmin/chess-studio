#!/usr/bin/env python3
"""Fail closed when OCI IaC drifts outside the zero-cost staging contract.

This gate is intentionally conservative. A new OCI resource type is rejected until
someone proves it belongs inside the Always Free budget and updates this allowlist.
Runtime usage limits still need live/account checks; this script prevents silent IaC
expansion into unreviewed resource families.
"""
from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RESOURCE_RE = re.compile(r'^\s*resource\s+"(oci_[^"]+)"\s+"[^"]+"\s*\{', re.MULTILINE)

ALLOWED_RESOURCE_TYPES = {
    "oci_core_instance",
    "oci_core_internet_gateway",
    "oci_core_route_table",
    "oci_core_security_list",
    "oci_core_subnet",
    "oci_core_vcn",
    "oci_identity_compartment",
    "oci_identity_dynamic_group",
    "oci_identity_policy",
    "oci_kms_key",
    "oci_kms_vault",
    "oci_load_balancer_backend",
    "oci_load_balancer_backend_set",
    "oci_load_balancer_listener",
    "oci_load_balancer_load_balancer",
    "oci_objectstorage_bucket",
}

MAX_COUNTS = {
    "oci_core_instance": 1,
    "oci_kms_key": 1,
    "oci_kms_vault": 1,
    "oci_load_balancer_load_balancer": 1,
    # Terraform state + shared staging runtime/artifact bucket. A third bucket
    # needs an explicit zero-cost review instead of silently widening scope.
    "oci_objectstorage_bucket": 2,
}


def terraform_text(root: Path) -> tuple[str, list[Path]]:
    files: list[Path] = []
    chunks: list[str] = []
    for stack in (root / "infra" / "oci" / "bootstrap", root / "infra" / "oci" / "staging"):
        for path in sorted(stack.rglob("*.tf")):
            if ".terraform" in path.parts:
                continue
            files.append(path)
            chunks.append(path.read_text(encoding="utf-8"))
    return "\n".join(chunks), files


def require(text: str, marker: str, message: str) -> None:
    if marker not in text:
        raise SystemExit(f"OCI zero-cost contract: FAIL · {message}")


def validate(root: Path = ROOT) -> None:
    text, files = terraform_text(root)
    if not files:
        raise SystemExit("OCI zero-cost contract: FAIL · no Terraform files found")

    resources = RESOURCE_RE.findall(text)
    counts = Counter(resources)
    unknown = sorted(set(resources) - ALLOWED_RESOURCE_TYPES)
    if unknown:
        raise SystemExit(
            "OCI zero-cost contract: FAIL · unreviewed OCI resource types: " + ", ".join(unknown)
        )

    for resource_type, maximum in MAX_COUNTS.items():
        if counts[resource_type] > maximum:
            raise SystemExit(
                f"OCI zero-cost contract: FAIL · {resource_type} count {counts[resource_type]} exceeds {maximum}"
            )

    staging_main = (root / "infra" / "oci" / "staging" / "main.tf").read_text(encoding="utf-8")
    variables = (root / "infra" / "oci" / "staging" / "variables.tf").read_text(encoding="utf-8")
    load_balancer = (root / "infra" / "oci" / "staging" / "load-balancer.tf").read_text(encoding="utf-8")
    runtime = (root / "infra" / "oci" / "staging" / "runtime-config.tf").read_text(encoding="utf-8")

    require(variables, 'default     = "VM.Standard.A1.Flex"', "A1 shape default must stay pinned")
    require(variables, 'var.shape == "VM.Standard.A1.Flex"', "non-A1 shapes must remain rejected")
    require(variables, "var.ocpus >= 1 && var.ocpus <= 2", "A1 OCPU ceiling must remain 2")
    require(variables, "var.memory_gb >= 6 && var.memory_gb <= 12", "A1 RAM ceiling must remain 12 GiB")
    require(variables, "var.boot_volume_size_gb >= 50 && var.boot_volume_size_gb <= 100", "boot volume ceiling must remain conservatively <=100 GiB")

    require(staging_main, 'operating_system         = "Canonical Ubuntu"', "staging must use the platform Ubuntu image")
    require(staging_main, 'operating_system_version = "24.04"', "staging platform image must remain Ubuntu 24.04")
    require(staging_main, 'data "oci_identity_region_subscriptions" "tenancy"', "staging must discover the tenancy home region")
    require(staging_main, "var.region == local.home_region", "A1 creation must fail outside the tenancy home region")
    if "image_ocid" in staging_main or "OCI_IMAGE_OCID" in staging_main:
        raise SystemExit("OCI zero-cost contract: FAIL · custom image override resurfaced")

    require(load_balancer, 'shape          = "flexible"', "load balancer must remain Flexible")
    require(load_balancer, "minimum_bandwidth_in_mbps = 10", "load balancer minimum must remain 10 Mbps")
    require(load_balancer, "maximum_bandwidth_in_mbps = 10", "load balancer maximum must remain 10 Mbps")

    require(runtime, 'vault_type     = "DEFAULT"', "Vault must remain DEFAULT, never Virtual Private")
    if "VIRTUAL_PRIVATE" in runtime:
        raise SystemExit("OCI zero-cost contract: FAIL · Virtual Private Vault is outside Always Free")
    require(runtime, 'protection_mode     = "HSM"', "existing key protection mode drifted unexpectedly")
    require(runtime, 'access_type    = "NoPublicAccess"', "runtime Object Storage bucket must remain private")
    require(runtime, 'versioning     = "Disabled"', "runtime bucket must not accumulate hidden object versions")

    print(
        "OCI zero-cost contract: OK · "
        f"resources={len(resources)} types={len(set(resources))} "
        "A1<=2OCPU/12GiB boot<=100GiB LB=10Mbps home-region-only"
    )


def self_test() -> None:
    assert "oci_core_instance" in ALLOWED_RESOURCE_TYPES
    assert "oci_core_image" not in ALLOWED_RESOURCE_TYPES
    assert MAX_COUNTS["oci_core_instance"] == 1
    assert MAX_COUNTS["oci_objectstorage_bucket"] == 2
    sample = 'resource "oci_core_instance" "x" {\n}\nresource "oci_kms_key" "k" {\n}\n'
    assert RESOURCE_RE.findall(sample) == ["oci_core_instance", "oci_kms_key"]
    data_only = 'data "oci_core_images" "arm64" {}\n'
    assert RESOURCE_RE.findall(data_only) == []


if __name__ == "__main__":
    self_test()
    validate()
