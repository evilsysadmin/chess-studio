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

print("OCI staging CORS + runtime deployment contract: OK")
