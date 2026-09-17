#!/usr/bin/env python3
"""No-dependency contract for K3s readiness serialization and asset fast-path."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/oci-readiness.yml").read_text(encoding="utf-8")
probe = (ROOT / "scripts/oci_k3s_bundle_probe.py").read_text(encoding="utf-8")

for required_path in (
    "      - infra/oci/k3s/**",
    "      - scripts/oci_k3s_bundle.py",
    "      - scripts/oci_k3s_bundle_publish.py",
    "      - scripts/oci_k3s_bundle_probe.py",
    "      - scripts/oci_k3s_readiness_contract.py",
):
    assert workflow.count(required_path) >= 2, (
        f"K3s readiness path must participate in both PR and main-push gates: {required_path.strip()}"
    )

publish = workflow.split("\n  publish-k3s:\n", 1)[1]
assert "    concurrency:\n      group: oci-staging-mutations\n      cancel-in-progress: false" in publish, (
    "publish-k3s must share the repository-wide OCI staging mutation mutex"
)
assert "python3 scripts/oci_k3s_bundle_publish.py reconcile" in publish
assert "python3 scripts/oci_k3s_bundle_probe.py install" in publish

assert "fast_path=true" in probe and "fast_path=false" in probe
assert probe.index("fast_path=true") < probe.index("InstancePrincipalsSecurityTokenSigner")
assert "K3s service unexpectedly exists" not in probe, (
    "asset reconciliation must remain compatible with the separately prepared inert K3s service"
)
assert "sudo --non-interactive" in probe, "slow path must retain the narrow root installer"

print("OCI K3s readiness serialization + fast-path contract: OK")
