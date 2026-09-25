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
signal_controller = (ROOT / "scripts" / "oci_staging_signal_controller.sh").read_text(encoding="utf-8")
signal_service = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-staging-signal.service").read_text(encoding="utf-8")
signal_timer = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-staging-signal.timer").read_text(encoding="utf-8")
deploy_watcher = (ROOT / "scripts" / "oci_staging_deploy_watcher.py").read_text(encoding="utf-8")
deploy_watcher_unit = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-deploy-watcher.service").read_text(encoding="utf-8")

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
    'target=staging',
    'cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"',
    'CHESS_STUDIO_CORS_ORIGINS="$cors_origin"',
    'env_file="${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/production/backend.env}"',
    'state_dir="${CHESS_STUDIO_STATE_DIR:-/var/lib/chess-studio-production}"',
    'project="${CHESS_STUDIO_COMPOSE_PROJECT:-chess-studio-production}"',
    'port="${CHESS_STUDIO_BACKEND_PORT:-4100}"',
    'cors_origin="${CHESS_STUDIO_CORS_ORIGINS:-https://chess-studio.shadowops.dpdns.org}"',
    'deploy_lock_file="/var/lib/chess-studio/deploy.lock"',
    'git -C "$repo" ls-remote --exit-code origin refs/heads/main',
    'OCI_DEPLOY_SUPERSEDED repo_ref=$sha current_main=$current_main',
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

# Runtime configuration is operational state. Normal releases consume the
# already-installed runtime on both the host-watcher path and the Run Command
# fallback. Runtime refresh remains an explicit operational action: making it an
# implicit pre-deploy step doubles the delivery penalty whenever Oracle's command
# channel is degraded. The deploy helper can still recover a missing installed
# runtime from the private runtime object.
assert "oci_runtime_config.py publish" not in staging_deploy, (
    "canonical staging releases must not republish runtime config from Render"
)
assert "python3 scripts/oci_vault_sync.py sync-current" not in staging_deploy, (
    "canonical staging deploy must not pay a second Run Command for implicit runtime sync"
)
assert 'python3 scripts/oci_run_command.py deploy --repo-ref "$DEPLOY_SHA"' in staging_deploy, (
    "canonical fallback must retain the resilient single-command deploy path"
)
assert "OCI fallback avoided" in staging_deploy, (
    "canonical fallback must re-check late host-watcher convergence before Run Command"
)
assert "inputs.operation == 'runtime-sync'" in service_control, (
    "OCI service control must keep an explicit runtime-sync operation"
)
assert "python3 scripts/oci_vault_sync.py sync-current" in service_control, (
    "runtime-sync must materialize the CURRENT Vault + Git runtime"
)
assert "python3 scripts/oci_runtime_config.py sync" not in service_control, (
    "runtime-sync must no longer source staging runtime from Render"
)
assert (
    "if: github.event_name == 'workflow_dispatch' && inputs.operation == 'runtime-sync'"
    in service_control
), "runtime sync must remain workflow_dispatch-only instead of a release side effect"
assert "inputs.operation == 'runtime-sync' || inputs.operation == 'bringup'" not in service_control, (
    "bringup must consume the persisted OCI runtime bundle without an implicit runtime sync"
)
runtime_sync_block = service_control.split(
    "- name: Sync CURRENT Vault + Git runtime to staging", 1
)[1].split("\n      - name:", 1)[0]
assert "RENDER_API_KEY" not in runtime_sync_block

# Mutating service operations share the native mutex with canonical backend
# deploy and Terraform. Read-only diagnostics deliberately get a per-run group
# so observation never queues behind unrelated control-plane changes.
concurrency_block = service_control.split("\nconcurrency:\n", 1)[1].split("\njobs:\n", 1)[0]
assert "'oci-staging-mutations'" in concurrency_block, (
    "mutating OCI service operations must retain the repository-wide mutation mutex"
)
assert "format('oci-staging-observe-{0}', github.run_id)" in concurrency_block, (
    "read-only OCI service operations must use a non-serializing per-run group"
)
mutating_operations = (
    "reserved-egress",
    "reboot-agent",
    "deploy",
    "bringup",
    "runtime-sync",
    "production-runtime-bootstrap",
    "production-runtime-sync",
    "vault-bootstrap",
)
read_only_operations = (
    "diagnose",
    "backend-diagnose",
    "mongo-target-diagnose",
    "mongo-network-diagnose",
    "smoke",
    "vault-validate",
    "vault-validate-pending",
)
for operation in mutating_operations:
    assert f'"{operation}"' in concurrency_block, f"missing mutation lock classification: {operation}"
for operation in read_only_operations:
    assert f'"{operation}"' not in concurrency_block, f"read-only operation must not take mutation lock: {operation}"
assert "group: oci-staging-service-control" not in service_control, (
    "OCI service control must not use a private mutation mutex that can race staging mutations"
)

for retired_operation in (
    "k3s-start",
    "k3s-status",
    "k3s-rollback",
    "k3s-staging2-deploy",
    "k3s-staging2-status",
    "k3s-staging2-rollback",
):
    assert retired_operation not in service_control, (
        f"K3s HOLD operation leaked back into canonical service control: {retired_operation}"
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
assert "options: [probe, plan, bootstrap, destroy," in infra_lab, (
    "OCI lab must retain the Terraform observation/bootstrap/destruction operations"
)
assert "apply" not in infra_lab.split("options:", 1)[1].split("\n", 1)[0], (
    "OCI lab must not expose a second bare Terraform apply path"
)
for operation in ("k3s-start", "k3s-status", "k3s-rollback", "k3s-staging2-deploy", "k3s-staging2-status", "k3s-staging2-rollback"):
    assert operation in infra_lab, f"missing explicit K3s lab operation: {operation}"
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

# K3s/Flux is HOLD experiment tooling. Canonical Docker/Compose deploys must not
# validate, install, prepare or reconcile K3s assets as a release side effect.
for forbidden in (
    "oci_k3s_capability_provision",
    "oci_k3s_service_prepare",
    "reconcile_k3s_contract",
    "run_k3s_reconcile_steps",
    "K3S_START_APPROVED",
):
    assert forbidden not in deploy, f"canonical Compose deploy must not depend on K3s: {forbidden}"
assert "phase_done k3s" not in deploy
assert " k3s=%s" not in deploy

# Healthy public routing of the exact new SHA is sufficient to reuse the
# existing tunnel. Any probe failure must retain the full connector self-heal.
assert "public_tunnel_attest" in deploy
assert 'Cache-Control: no-cache' in deploy
assert 'if ! /bin/bash "$tunnel_connector"; then' in deploy
assert 'tunnel_action="restarted"' in deploy

# Deploy timing markers are observational only: they expose where time is spent
# without weakening or bypassing any readiness/integrity gate.
for phase in ("checkout", "preflight", "image_pull", "recreate", "readiness", "tunnel", "total"):
    assert f"phase_done {phase}" in deploy
assert "OCI_DEPLOY_TIMINGS target=%s phases=%s tunnel=%s" in deploy
assert 'if [[ "$target" == staging ]]; then' in deploy
assert 'tunnel_action="local-only"' in deploy
assert 'CHESS_STUDIO_DEPLOY_OK target=$target repo_ref=$sha' in deploy
assert 'install -o root -g root -m 0755 "$source_launcher" "$target_launcher"' in deploy
assert 'install -o root -g root -m 0755 "$source_runtime_installer" "$target_runtime_installer"' in deploy
assert 'source_runtime_installer="$repo/scripts/oci_runtime_install.sh"' in deploy
assert '/bin/bash "$tunnel_connector" --self-test >/dev/null' in deploy
assert 'docker pull --quiet "$target_image" >/dev/null' in deploy
assert 'compose "$sha" up -d --no-build --force-recreate backend >"$compose_log" 2>&1' in deploy
assert 'cat "$compose_log" >&2' in deploy
assert "OCI_DEPLOY_PHASE name=%s duration_ms=%s" not in deploy
assert 'docker pull --quiet "$target_image"' in deploy

# Agent diagnostics are aggregate-only and observational. Never emit raw agent
# log lines into Actions, and never let diagnostics block an otherwise healthy deploy.
assert "agent_diag_summary()" in deploy
assert "OCI_AGENT_DIAG version=%s active=%s restarts=%s" in deploy
assert "tail -n 2000" in deploy
assert "poll_errors" in deploy and "backoff" in deploy and "transport_errors" in deploy
assert "agent_diag_summary ||" in deploy
assert 'cat "$log"' not in deploy.split("agent_diag_summary()", 1)[1].split("total_started_ms=", 1)[0]

# The GHCR signal controller is staged but deliberately dormant in this change.
# It adds no OCI resource, no inbound port and no polling traffic until a later
# reviewed change explicitly enables the timer.
assert "prepare_signal_controller_disabled()" in deploy
assert "systemctl disable --now chess-studio-staging-signal.timer" in deploy
assert 'install -o root -g root -m 0755 "$signal_controller_source"' in deploy
assert 'install -o root -g root -m 0644 "$signal_service_source"' in deploy
assert 'install -o root -g root -m 0644 "$signal_timer_source"' in deploy
assert "systemctl enable --now chess-studio-staging-signal.timer" not in deploy
assert "oci-staging-approved" in signal_controller
assert "org.opencontainers.image.revision" in signal_controller
assert "org.opencontainers.image.source" in signal_controller
assert "flock -n 9" in signal_controller
assert "docker pull --quiet" in signal_controller
assert "approved and immutable image identities differ" in signal_controller
assert "ssh " not in signal_controller.lower()
assert "object_storage" not in signal_controller.lower()
assert "bastion" not in signal_controller.lower()
assert "ExecStart=/usr/local/sbin/chess-studio-staging-signal" in signal_service
assert "OnUnitActiveSec=15s" in signal_timer
assert "WantedBy=timers.target" in signal_timer

# Active fast-path is outbound-only on the existing A1. It adds no OCI
# resource/listener and the existing Run Command path remains the fallback.
# The watcher already suppresses same-SHA repeats; an explicit deploy must
# recreate the backend so a newly installed runtime is actually consumed.
assert "require flock" in deploy
assert 'flock -w 120 8' in deploy
assert "OCI_DEPLOY_ALREADY_CURRENT" not in deploy
assert "prepare_deploy_watcher()" in deploy
assert "enable_deploy_watcher()" in deploy
assert 'install -o root -g root -m 0755 "$deploy_watcher_source"' in deploy
assert 'install -o root -g root -m 0644 "$deploy_watcher_unit_source"' in deploy
assert "DEPLOY_WATCH_ENABLED" in deploy
assert "systemctl enable --now chess-studio-deploy-watcher.service" in deploy
assert deploy.rfind('record_successful_backend "$sha"') < deploy.rfind("enable_deploy_watcher")
assert "ai-staging.shadowops.dpdns.org/health" in deploy_watcher
assert "refs/heads/main" not in deploy_watcher
assert "ls-remote" not in deploy_watcher
assert "OCI_DEPLOY_WATCH_SUPERSEDED" in deploy_watcher
assert "OCI_DEPLOY_WATCH_IMAGE_PENDING" in deploy_watcher
assert '["docker", "manifest", "inspect", backend_image_ref(candidate)]' in deploy_watcher
assert 'git -C "$repo" ls-remote --exit-code origin refs/heads/main' in deploy
assert '["sudo", "--non-interactive", DEPLOY_WRAPPER, candidate]' in deploy_watcher
assert "ENABLE_MARKER.is_symlink()" in deploy_watcher
assert "import oci" not in deploy_watcher
assert "User=ocarun" in deploy_watcher_unit
assert "PrivateTmp=true" in deploy_watcher_unit
assert "ListenStream" not in deploy_watcher_unit

from oci_production_tunnel import self_test as production_tunnel_self_test
from oci_vault_sync import self_test as vault_sync_self_test

vault_sync_self_test()
production_tunnel_self_test()
print("OCI staging CORS + runtime deployment contract: OK")