#!/usr/bin/env python3
"""Static contract for the isolated K3s staging2 shadow workflow."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / ".github/workflows/oci-staging2-shadow.yml"
MANIFEST = ROOT / "infra/oci/gitops/staging2/backend.yaml.tmpl"

workflow = WORKFLOW.read_text(encoding="utf-8")
manifest = MANIFEST.read_text(encoding="utf-8")

for required in (
    "name: OCI staging2 · shadow backend",
    "workflow_run:",
    "Staging · deploy",
    "workflow_dispatch:",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.head_sha || github.sha",
    "group: oci-staging-mutations",
    "git ls-remote",
    "refs/heads/main",
    "No OCI mutation.",
    "steps.admission.outputs.admitted == 'true'",
    'python3 scripts/oci_k3s_staging2.py deploy --repo-ref "$SHADOW_SHA"',
    "python3 scripts/oci_k3s_staging2.py status",
    "always() && steps.admission.outputs.admitted == 'true'",
    "python3 scripts/verify_backend_staging.py",
    '--sha "$SHADOW_SHA"',
):
    assert required in workflow, required

for forbidden in (
    "CLOUDFLARE_API_TOKEN",
    "cloudflared",
    "oci-staging-tunnel",
    "terraform",
    "NodePort",
    "LoadBalancer",
    "kubectl",
    "runtime-sync",
    "vault-bootstrap",
):
    assert forbidden not in workflow, f"shadow workflow gained forbidden coupling: {forbidden}"

assert workflow.index("Admit only the current main SHA") < workflow.index("Restore cached OCI SDK toolchain")
assert workflow.count("always() && steps.admission.outputs.admitted == 'true'") == 2
assert workflow.index("Deploy exact backend SHA into isolated K3s shadow") < workflow.index(
    "Re-prove canonical Compose staging is unchanged"
)

for required in (
    "type: ClusterIP",
    "strategy:",
    "type: Recreate",
    "runAsNonRoot: true",
    "path: /api/health",
    "path: /api/ready",
    "memory: 768Mi",
    "cpu: 600m",
):
    assert required in manifest, required

for forbidden in ("type: NodePort", "type: LoadBalancer", "hostNetwork:", "hostPort:"):
    assert forbidden not in manifest, forbidden

print("OCI staging2 isolated shadow workflow contract: OK")
