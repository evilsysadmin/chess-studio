#!/usr/bin/env python3
"""No-dependency contract for the dormant minimal Flux seam."""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "infra/oci/gitops/flux/versions.env"
README = ROOT / "infra/oci/gitops/flux/README.md"
ADMISSION = ROOT / "scripts/oci_flux_admission.py"
EXPORT = ROOT / "scripts/oci_flux_export.py"
STATIC_CONTRACTS = ROOT / "scripts/workflow_static_contracts.py"

versions = VERSIONS.read_text(encoding="utf-8")
readme = README.read_text(encoding="utf-8")
admission = ADMISSION.read_text(encoding="utf-8")
export = EXPORT.read_text(encoding="utf-8")
static_contracts = STATIC_CONTRACTS.read_text(encoding="utf-8")
ast.parse(admission)
ast.parse(export)
ast.parse(static_contracts)

expected = {
    "FLUX_VERSION": "v2.9.5",
    "FLUX_LINUX_AMD64_SHA256": "b853df82adfd7736f580692f9f734473d571606307139f8fd20c2a80dd1ff473",
    "FLUX_LINUX_ARM64_SHA256": "f3e159af616ec0b9bd0a405c2185cf09d06b74652c1de3c7f377e8166826651a",
    "FLUX_COMPONENTS": "source-controller,kustomize-controller",
    "FLUX_NAMESPACE": "flux-system",
    "FLUX_MIN_MEM_AVAILABLE_MIB": "4096",
    "FLUX_MIN_DISK_FREE_MIB": "32768",
}
parsed: dict[str, str] = {}
for raw in versions.splitlines():
    line = raw.strip()
    if not line:
        continue
    key, sep, value = line.partition("=")
    assert sep and key and value, f"invalid Flux versions line: {raw!r}"
    parsed[key] = value
assert parsed == expected, f"Flux seam pin drifted: {parsed!r}"

# Protected preflight owns both the always-offline checks and the conditional
# checksum-verified export contract for Flux-seam PRs.
for marker in (
    "scripts/oci_flux_contract.py",
    "scripts/oci_flux_admission.py",
    "scripts/oci_flux_export.py",
    "--self-test",
    "--ci-if-required",
    "run_flux_seam_contracts",
):
    assert marker in static_contracts, f"Flux static wiring lost marker: {marker}"

# The admission helper is pure/read-only. It can consume the existing K3s
# status marker, but cannot acquire cluster, host or OCI mutation primitives.
assert 'STATUS_MARKER = "OCI_K3S_STATUS_OK"' in admission
assert 'SUCCESS_MARKER = "OCI_FLUX_ADMISSION_OK"' in admission
for required in (
    '"active": "true"',
    '"enabled": "enabled"',
    '"approval": "valid"',
    '"node_ready": "true"',
    '"system_deployments_ready": "true"',
    'FLUX_MIN_MEM_AVAILABLE_MIB',
    'FLUX_MIN_DISK_FREE_MIB',
):
    assert required in admission
for forbidden in (
    "subprocess",
    "os.system",
    "systemctl",
    "kubectl",
    "flux install",
    "terraform",
    "sudo",
    "requests.",
    "urllib",
):
    assert forbidden not in admission, f"Flux admission unexpectedly mutates or reaches external state: {forbidden}"

# The export gate may download and execute the pinned CLI, but it must remain a
# no-cluster renderer: exact minimal components, --export, missing kubeconfig,
# no kubectl/bootstrap or host mutation path.
for marker in (
    'SUCCESS_MARKER = "OCI_FLUX_EXPORT_OK"',
    'SKIP_MARKER = "OCI_FLUX_EXPORT_SKIPPED"',
    '"install"',
    '"--export"',
    '"--network-policy=true"',
    'intentionally-missing-kubeconfig',
    'FLUX_LINUX_AMD64_SHA256',
    'FLUX_LINUX_ARM64_SHA256',
    'required_in_ci',
    'is_flux_seam_path',
):
    assert marker in export, f"Flux export contract lost marker: {marker}"
for forbidden in ("kubectl", "flux bootstrap", "systemctl", "sudo", "terraform apply"):
    assert forbidden not in export, f"Flux export unexpectedly gained mutation primitive: {forbidden}"

# Documentation must keep the migration boundary explicit.
for marker in (
    "dormant",
    "source-controller",
    "kustomize-controller",
    "Docker/systemd staging remains the fallback",
    "explicit activation PR",
    "protected static preflight",
    "not** wired into `oci-readiness.yml`",
    "Protected export contract",
    "never mutates the A1 host",
    "Do not add Terraform Kubernetes/Helm providers",
):
    assert marker in readme, f"Flux seam documentation lost ownership marker: {marker}"

print("OCI dormant minimal Flux seam contract: OK")
