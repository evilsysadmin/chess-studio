#!/usr/bin/env python3
"""No-dependency contract checks for the OCI staging deploy/runtime boundary."""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
deploy = (ROOT / "scripts" / "oci_existing_a1_deploy.sh").read_text(encoding="utf-8")
compose = (ROOT / "infra" / "oci" / "runtime" / "docker-compose.yml").read_text(encoding="utf-8")
backend_main_path = ROOT / "backend-python" / "main.py"
backend_main = backend_main_path.read_text(encoding="utf-8")
verifier = (ROOT / "scripts" / "verify_backend_staging.py").read_text(encoding="utf-8")
staging_deploy = (ROOT / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
service_control = (ROOT / ".github" / "workflows" / "oci-staging-service.yml").read_text(encoding="utf-8")
tunnel_control = (ROOT / ".github" / "workflows" / "oci-staging-tunnel.yml").read_text(encoding="utf-8")
infra_apply = (ROOT / ".github" / "workflows" / "oci-staging-deploy.yml").read_text(encoding="utf-8")
infra_lab = (ROOT / ".github" / "workflows" / "oci-staging-lab.yml").read_text(encoding="utf-8")
k3s_root = (ROOT / "scripts" / "oci_k3s_assets_root.py").read_text(encoding="utf-8")
k3s_provision = (ROOT / "scripts" / "oci_k3s_capability_provision.sh").read_text(encoding="utf-8")
k3s_sudoers = (ROOT / "infra" / "oci" / "runtime" / "ocarun.sudoers").read_text(encoding="utf-8")

STAGING_ORIGIN = "https://staging.chess-studio.shadowops.dpdns.org"


def assigned_literal_strings(source: str, variable: str) -> set[str]:
    tree = ast.parse(source)
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == variable for target in node.targets):
            continue
        if not isinstance(node.value, (ast.Set, ast.List, ast.Tuple)):
            raise AssertionError(f"{variable} must remain a literal collection")
        values = set()
        for item in node.value.elts:
            if not isinstance(item, ast.Constant) or not isinstance(item.value, str):
                raise AssertionError(f"{variable} must contain only literal strings")
            values.add(item.value)
        return values
    raise AssertionError(f"missing assignment: {variable}")


required_deploy_fragments = (
    'staging_origin="${CHESS_STUDIO_STAGING_ORIGIN:-https://staging.chess-studio.shadowops.dpdns.org}"',
    'CHESS_STUDIO_CORS_ORIGINS="$staging_origin"',
    'Access-Control-Request-Method: GET',
    'Access-Control-Request-Headers: authorization,x-client-release',
    "access-control-allow-origin",
    "access-control-allow-methods",
    "access-control-allow-headers",
    "cors_attest",
    "readiness/build/CORS attestation",
)
for fragment in required_deploy_fragments:
    assert fragment in deploy, f"missing OCI staging CORS deploy contract: {fragment}"

assert 'CORS_ORIGINS: "${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"' in compose
default_origins = assigned_literal_strings(backend_main, "_DEFAULT_CORS_ORIGINS")
assert STAGING_ORIGIN in default_origins, (
    "FastAPI must always allow the canonical staging browser origin even if runtime "
    "CORS_ORIGINS is stale or missing"
)

required_public_verifier_fragments = (
    f'STAGING_BROWSER_ORIGIN = "{STAGING_ORIGIN}"',
    'method="OPTIONS"',
    '"Access-Control-Request-Method": "PATCH"',
    '"Access-Control-Request-Headers": ",".join(sorted(REQUIRED_CORS_HEADERS))',
    '"access-control-allow-origin"',
    '"access-control-allow-methods"',
    '"access-control-allow-headers"',
    "cors_contract_ok",
    "REQUIRED_CORS_METHODS",
    "REQUIRED_CORS_HEADERS",
)
for fragment in required_public_verifier_fragments:
    assert fragment in verifier, f"missing public staging CORS verifier contract: {fragment}"

# Runtime configuration is operational state, not application release state.
# Canonical deploys consume the already-published private OCI bundle. Updating
# that bundle remains an explicit service-control action instead of a hidden
# side effect of every code release or bringup.
assert "oci_runtime_config.py publish" not in staging_deploy, (
    "canonical staging releases must not republish runtime config from Render"
)
assert "inputs.operation == 'runtime-sync'" in service_control, (
    "OCI service control must keep an explicit runtime-sync operation"
)
assert "python3 scripts/oci_runtime_config.py sync" in service_control, (
    "runtime-sync must remain the owner of Render-to-OCI runtime synchronization"
)
assert "Sync private runtime config\n        if: inputs.operation == 'runtime-sync'" in service_control, (
    "runtime sync must remain an explicit operation instead of a bringup side effect"
)
assert "inputs.operation == 'runtime-sync' || inputs.operation == 'bringup'" not in service_control, (
    "bringup must consume the persisted OCI runtime bundle without resynchronizing Render"
)

# All manual service operations share the same native mutation mutex as the
# canonical backend deploy and Terraform. Diagnostics may queue briefly, but a
# recovery/deploy can never race another OCI mutation.
assert "group: oci-staging-mutations" in service_control, (
    "OCI service control must share the repository-wide staging mutation mutex"
)
assert "group: oci-staging-service-control" not in service_control, (
    "OCI service control must not use a private mutex that can race staging mutations"
)

# Service smoke is an observation, not another readiness controller. Bringup
# may tolerate it and the immutable deploy owns bounded registration readiness;
# reboot-agent already waits for a refreshed RUNNING plugin.
assert "run: python3 scripts/oci_run_command.py smoke" in service_control, (
    "OCI service smoke must call the transport check directly"
)
assert "for attempt in $(seq 1 30)" not in service_control, (
    "OCI service smoke must not reintroduce the legacy outer retry loop"
)

# Tunnel/DNS control-plane state persists independently of code releases and
# service diagnostics. Reconciliation is explicit and serialized with every
# other OCI staging mutation instead of spawning after each service-control run.
assert "workflow_dispatch:" in tunnel_control, "OCI tunnel reconciliation must remain manually invokable"
assert "workflow_run:" not in tunnel_control, "OCI tunnel reconciliation must not auto-run after service control"
assert "OCI staging · service control" not in tunnel_control, (
    "OCI tunnel reconciliation must not depend on service-control completion"
)
assert "group: oci-staging-mutations" in tunnel_control, (
    "OCI tunnel reconciliation must share the repository-wide staging mutation mutex"
)
assert "group: oci-staging-cloudflare-tunnel" not in tunnel_control, (
    "OCI tunnel reconciliation must not use a private mutation mutex"
)

# Infrastructure has one production-grade apply path. The lab remains useful for
# observation/bootstrap/destruction, but must not bypass post-apply agent and
# reserved-egress convergence owned by the dedicated infrastructure workflow.
assert "options: [probe, plan, bootstrap, destroy]" in infra_lab, (
    "OCI lab must not expose a second bare Terraform apply path"
)
assert "options: [probe, plan, apply" not in infra_lab, (
    "OCI lab must not reintroduce apply alongside the canonical infrastructure workflow"
)
assert "run: make -C infra/oci apply" in infra_apply, (
    "dedicated OCI infrastructure workflow must own Terraform apply"
)
assert "Wait for OCI Run Command registration after infrastructure change" in infra_apply, (
    "canonical OCI apply must keep post-apply agent convergence"
)
assert "Attach and verify existing reserved staging egress" in infra_apply, (
    "canonical OCI apply must keep reserved-egress convergence"
)
assert "group: oci-staging-mutations" in infra_apply and "group: oci-staging-mutations" in infra_lab, (
    "all OCI infrastructure operations must share the staging mutation mutex"
)

# K3s asset installation is deliberately a narrow host capability. It is
# provisioned by the already-root deployment path, but ocarun receives exactly
# one additional sudo command with one fixed staging path. The capability pins
# the current verified bundle and may materialize assets only; starting K3s is a
# later, separately reviewed phase.
ast.parse(k3s_root)
assert '/bin/bash "$k3s_capability_provision"' in deploy
assert "OCI_K3S_ASSET_CAPABILITY_READY" in k3s_provision
assert "visudo -cf" in k3s_provision
assert "EXPECTED_BUNDLE_SHA256 = \"db0972ea4c9439e238e777f26d579ae29865f22f05f70c9a01989cc772611256\"" in k3s_root
assert "EXPECTED_BUNDLE_SIZE = 240779539" in k3s_root
assert "os.O_NOFOLLOW" in k3s_root and 'info.st_uid != sudo_uid' in k3s_root
assert "CHESS_STUDIO_K3S_ASSETS = /usr/local/sbin/chess-studio-k3s-assets /tmp/chess-studio-k3s-bundle.tar.gz" in k3s_sudoers
assert "CHESS_STUDIO_DEPLOY, CHESS_STUDIO_RUNTIME, CHESS_STUDIO_K3S_ASSETS" in k3s_sudoers
for forbidden in ("systemctl", "k3s server", "k3s agent", "curl ", "wget "):
    assert forbidden not in k3s_root, f"K3s asset capability must not contain {forbidden!r}"

print("OCI staging CORS + runtime deployment contract: OK")
