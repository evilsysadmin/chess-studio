#!/usr/bin/env python3
"""No-dependency contract for K3s readiness serialization and asset fast-path."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/oci-readiness.yml").read_text(encoding="utf-8")
probe = (ROOT / "scripts/oci_k3s_bundle_probe.py").read_text(encoding="utf-8")
install_source = probe.split("\ndef install_command", 1)[1].split("\ndef _run", 1)[0]

assert workflow.count("'infra/oci/k3s/**'") >= 2, "K3s infra must participate in PR + main-push readiness"
assert workflow.count("'scripts/oci_k3s_*'") >= 2, "K3s scripts must participate in PR + main-push readiness"

publish = workflow.split("\n  publish-k3s:\n", 1)[1]
assert "concurrency: {group: oci-staging-mutations, cancel-in-progress: false}" in publish, (
    "publish-k3s must share the repository-wide OCI staging mutation mutex"
)
assert "python3 scripts/oci_k3s_bundle_publish.py reconcile" in publish
assert "python3 scripts/oci_k3s_bundle_probe.py install" in publish

assert "fast_path=true" in install_source and "fast_path=false" in install_source
assert install_source.index("fast_path=true") < install_source.index("InstancePrincipalsSecurityTokenSigner")
assert "K3s service unexpectedly exists" not in install_source, (
    "asset reconciliation must remain compatible with the separately prepared inert K3s service"
)
assert "sudo --non-interactive" in install_source, "slow path must retain the narrow root installer"

print("OCI K3s readiness serialization + fast-path contract: OK")
