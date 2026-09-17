#!/usr/bin/env python3
"""No-dependency contract for the dormant minimal Flux seam."""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "infra/oci/gitops/flux/versions.env"
README = ROOT / "infra/oci/gitops/flux/README.md"
ADMISSION = ROOT / "scripts/oci_flux_admission.py"
STATIC_CONTRACTS = ROOT / "scripts/workflow_static_contracts.py"

versions = VERSIONS.read_text(encoding="utf-8")
readme = README.read_text(encoding="utf-8")
admission = ADMISSION.read_text(encoding="utf-8")
static_contracts = STATIC_CONTRACTS.read_text(encoding="utf-8")
ast.parse(admission)
ast.parse(static_contracts)

expected = {
    "FLUX_VERSION": "v2.9.5",
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

# The seam is always checked by the protected static preflight. It must not need
# oci-readiness.yml wiring merely to validate pins/admission logic.
assert "scripts/oci_flux_contract.py" in static_contracts
assert "scripts/oci_flux_admission.py" in static_contracts
assert "--self-test" in static_contracts
assert "run_flux_seam_contracts" in static_contracts

# The admission helper is pure/read-only. It can consume the existing K3s
# status marker, but cannot acquire cluster, host or OCI mutation primitives.
assert 'STATUS_MARKER = "OCI_K3S_STATUS_OK"' in admission
assert 'SUCCESS_MARKER = "OCI_FLUX_ADMISSION_OK"' in admission
assert '"active": "true"' in admission
assert '"enabled": "enabled"' in admission
assert '"approval": "valid"' in admission
assert '"node_ready": "true"' in admission
assert '"system_deployments_ready": "true"' in admission
assert 'FLUX_MIN_MEM_AVAILABLE_MIB' in admission
assert 'FLUX_MIN_DISK_FREE_MIB' in admission
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

# Documentation must keep the migration boundary explicit.
for marker in (
    "dormant",
    "source-controller",
    "kustomize-controller",
    "Docker/systemd staging remains the fallback",
    "explicit activation PR",
    "protected static preflight",
    "not** wired into `oci-readiness.yml`",
    "Do not add Terraform Kubernetes/Helm providers",
):
    assert marker in readme, f"Flux seam documentation lost ownership marker: {marker}"

print("OCI dormant minimal Flux seam contract: OK")
