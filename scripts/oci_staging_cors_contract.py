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
go_cors_policy = (
    ROOT / "backend-go" / "internal" / "corspolicy" / "origins.go"
).read_text(encoding="utf-8")
verifier = (ROOT / "scripts" / "verify_backend_staging.py").read_text(encoding="utf-8")
staging_deploy = (ROOT / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
staging_generation = (ROOT / "scripts" / "staging_generation.py").read_text(encoding="utf-8")
service_control = (ROOT / ".github" / "workflows" / "oci-staging-service.yml").read_text(encoding="utf-8")
tunnel_control = (ROOT / ".github" / "workflows" / "oci-staging-tunnel.yml").read_text(encoding="utf-8")
infra_apply = (ROOT / ".github" / "workflows" / "oci-staging-deploy.yml").read_text(encoding="utf-8")
infra_lab = (ROOT / ".github" / "workflows" / "oci-staging-lab.yml").read_text(encoding="utf-8")
signal_controller = (ROOT / "scripts" / "oci_staging_signal_controller.sh").read_text(encoding="utf-8")
signal_service = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-staging-signal.service").read_text(encoding="utf-8")
signal_timer = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-staging-signal.timer").read_text(encoding="utf-8")
deploy_watcher = (ROOT / "scripts" / "oci_staging_deploy_watcher.py").read_text(encoding="utf-8")
deploy_watcher_unit = (ROOT / "infra" / "oci" / "runtime" / "chess-studio-deploy-watcher.service").read_text(encoding="utf-8")
existing_install = (ROOT / "scripts" / "oci_existing_a1_install.sh").read_text(encoding="utf-8")
sudoers = (ROOT / "infra" / "oci" / "runtime" / "ocarun.sudoers").read_text(encoding="utf-8")
ssh_authorize_root = (ROOT / "scripts" / "oci_ssh_authorize_root.py").read_text(encoding="utf-8")
ssh_authorize_client = (ROOT / "scripts" / "oci_ssh_authorize.py").read_text(encoding="utf-8")
makefile = (ROOT / "Makefile").read_text(encoding="utf-8")

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
    'canonical_cors_origin="https://staging.chess-studio.shadowops.dpdns.org"',
    'canonical_cors_origin="https://chess-studio.shadowops.dpdns.org"',
    '[[ "$cors_origin" != "$canonical_cors_origin" ]]',
    'refusing non-canonical browser CORS origin',
    'CHESS_STUDIO_CORS_ORIGINS="$cors_origin"',
    'pvp_sparring_enabled=true',
    'pvp_sparring_enabled=false',
    'CHESS_PVP_SPARRING_ENABLED="$pvp_sparring_enabled"',
    'CHESS_PVP_SPARRING_OWNER="$pvp_sparring_owner"',
    'CHESS_PVP_SPARRING_USERNAME="$pvp_sparring_username"',
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
    "pvp_browser_cors_attest",
    "/api/pvp/roster",
    "pvp_lobby_read_attest",
    "pvp_virtual_roster_attest",
    "PVP_VIRTUAL_ROSTER_OK",
    "pvp_browser_token",
    "pvp_authenticated_browser_attest",
    'endpoint="$api_base/pvp/lobby/pulse"',
    "PVP_AUTHENTICATED_BROWSER_OK",
    "virtualPlayersEnabled",
    "pythonRetired",
    "any(value is not True for value in native.values())",
    "/api/pvp/lobby",
    "pvp_challenge_browser_attest",
    "/api/pvp/challenges",
    "Access-Control-Request-Method: POST",
    "authorization,content-type,x-request-id,x-client-release",
    "edge PvP browser CORS attestation failed after cutover",
    "edge PvP full lobby read attestation failed after cutover",
    "edge PvP authenticated browser lobby/pulse attestation failed after cutover",
    "edge PvP challenge browser transport attestation failed after cutover",
    "OCI staging public PvP roster did not prove native Go browser response semantics",
    "OCI staging public PvP lobby did not prove native Go read semantics",
    "OCI staging public PvP authenticated browser lobby/pulse contract failed",
    "OCI staging public PvP challenge transport did not prove browser JSON/CORS semantics",
    "X-Chess-Pvp-Native",
    "deliberately-invalid",
    "Go readiness/build attestation",
)
for fragment in required_deploy_fragments:
    assert fragment in deploy, f"missing OCI staging CORS deploy contract: {fragment}"

staging_live = (ROOT / "e2e" / "staging-live.spec.js").read_text(encoding="utf-8")
for fragment in (
    "assertLivePvpBrowserPath",
    "page.on('requestfailed', onRequestFailed)",
    "headers['access-control-allow-origin']",
    "x-chess-pvp-edge",
    "x-chess-pvp-native",
    "'/lobby/pulse'",
    "'Recibir retos'",
):
    assert fragment in staging_live, f"missing real Chromium PvP CORS staging gate: {fragment}"

# Human SSH remains tunnel-only, but the already-created A1 still needs a
# controlled way to authorize an operator public key. Keep this recovery path
# narrower than general root Run Command access.
for fragment in (
    'ssh_authorize_source="$repo/scripts/oci_ssh_authorize_root.py"',
    'ssh_authorize_target="/usr/local/sbin/chess-studio-ssh-authorize"',
    'install -o root -g root -m 0755 "$ssh_authorize_source" "$ssh_authorize_target"',
):
    assert fragment in deploy, f"missing SSH authorization deploy contract: {fragment}"
for fragment in (
    'source_ssh_authorize="$repo/scripts/oci_ssh_authorize_root.py"',
    'target_ssh_authorize=/usr/local/sbin/chess-studio-ssh-authorize',
    'install -o root -g root -m 0755 "$source_ssh_authorize" "$target_ssh_authorize"',
):
    assert fragment in existing_install, f"missing SSH authorization adoption contract: {fragment}"

ssh_sudoers = (
    "Cmnd_Alias CHESS_STUDIO_SSH_AUTHORIZE = "
    "/usr/local/sbin/chess-studio-ssh-authorize /tmp/chess-studio-operator-key.*"
)
assert ssh_sudoers in sudoers
assert "/usr/local/sbin/chess-studio-ssh-authorize *" not in sudoers
assert "CHESS_STUDIO_SSH_AUTHORIZE" in sudoers.split("NOPASSWD:", 1)[1]
for fragment in (
    'getattr(os, "O_NOFOLLOW", 0)',
    "os.fstat(fd)",
    'pwd.getpwnam("ubuntu")',
    "os.chmod(authorized, 0o600)",
    "CHESS_STUDIO_SSH_OPERATOR_KEY_OK",
    'source.parent != Path("/tmp")',
    'source.name.startswith(TMP_PREFIX)',
):
    assert fragment in ssh_authorize_root, f"missing narrow root SSH key guard: {fragment}"
for fragment in (
    "OCI_SSH_PUBLIC_KEY",
    '"instance-agent"',
    '"command-execution"',
    "base64.b64encode((public_key",
    "sudo --non-interactive /usr/local/sbin/chess-studio-ssh-authorize",
    "CHESS_STUDIO_SSH_OPERATOR_KEY_OK",
):
    assert fragment in ssh_authorize_client, f"missing operator SSH authorization client contract: {fragment}"
assert "oci-a1-authorize-ssh: oci-session" in makefile


# The human ubuntu operator intentionally has Docker socket access. The docker
# group is root-equivalent, so this is limited to the operator account and must
# be reconciled by both adoption and every immutable deploy.
for source, label in (
    (deploy, "deploy"),
    (existing_install, "adoption"),
):
    for fragment in (
        "ensure_operator_docker_access()",
        "getent group docker",
        "id -nG ubuntu | grep -qw docker",
        "usermod -aG docker ubuntu",
        "failed to grant ubuntu docker group membership",
        "OCI_OPERATOR_DOCKER_ACCESS state=added",
        "OCI_OPERATOR_DOCKER_ACCESS state=already",
        "ensure_operator_docker_access",
    ):
        assert fragment in source, f"missing operator Docker access contract ({label}): {fragment}"

assert 'CORS_ORIGINS: "${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"' in compose
assert compose.count('CHESS_PVP_SPARRING_ENABLED: "${CHESS_PVP_SPARRING_ENABLED:-false}"') == 2  # the two Go slots
assert compose.count('CHESS_PVP_SPARRING_OWNER: "${CHESS_PVP_SPARRING_OWNER:-evilsysadmin}"') == 2  # the two Go slots
assert compose.count('CHESS_PVP_SPARRING_USERNAME: "${CHESS_PVP_SPARRING_USERNAME:-sparringmeister}"') == 2  # the two Go slots
default_origins = assigned_literal_strings(backend_main, "_DEFAULT_CORS_ORIGINS")
assert STAGING_ORIGIN in default_origins, (
    "FastAPI must always allow the canonical staging browser origin even if runtime "
    "CORS_ORIGINS is stale or missing"
)

assert STAGING_ORIGIN in go_cors_policy, (
    "native Go handlers must retain the canonical staging browser origin "
    "independently of runtime CORS_ORIGINS"
)
assert "https://chess-studio.shadowops.dpdns.org" in go_cors_policy, (
    "native Go handlers must retain the canonical production browser origin"
)

required_public_verifier_fragments = (
    f'STAGING_BROWSER_ORIGIN = "{STAGING_ORIGIN}"',
    'method="OPTIONS"',
    'method: str = "PATCH"',
    '"Access-Control-Request-Method": method',
    '"Access-Control-Request-Headers": ",".join(sorted(request_headers))',
    '"access-control-allow-origin"',
    '"access-control-allow-methods"',
    '"access-control-allow-headers"',
    "cors_contract_ok",
    "REQUIRED_CORS_METHODS",
    "REQUIRED_CORS_HEADERS",
    "PVP_ROSTER_CORS_METHODS",
    "PVP_ROSTER_CORS_HEADERS",
    "PVP_CHALLENGE_CORS_METHODS",
    "PVP_CHALLENGE_CORS_HEADERS",
    'f"{base}/pvp/roster?probe={probe}"',
    'f"{base}/pvp/challenges?probe={probe}"',
    'method="POST"',
    "pvp_roster_cors_http",
    'f"{base}/pvp/_edge/ready?{ready_query}"',
    "PVP_FULL_GO_READY_KEYS",
    "pvp_full_go_ready",
    '"nativeChallengeCreate"',
    '"nativeMatchMove"',
    "pvp_release={pvp_observed}",
    "fetch_roster_rejection",
    "native_roster_rejection_ok",
    "pvp_roster_response_http",
    "pvp_roster_native_response=ok",
    "fetch_challenge_rejection",
    "challenge_transport_rejection_ok",
    "pvp_challenge_cors_http",
    "pvp_challenge_transport=ok",
    "x-chess-pvp-native",
    "fetch_text",
    'f"{base}/_deploy/committed?{ready_query}"',
    "committed == expected",
    "committed_build=",
)
for fragment in required_public_verifier_fragments:
    assert fragment in verifier, f"missing public staging CORS verifier contract: {fragment}"
assert "assert pvp_full_go_ready(full_go)" in verifier
assert "pvp_observed == expected" in verifier
assert 'broken["nativeChallengeCreate"] = False' in verifier
assert 'broken["virtualPlayersEnabled"] = False' in verifier

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
assert ".github/ops/oci-backup-storage-bootstrap-20261007.once" in infra_apply, (
    "armed one-shot backup storage marker must remain explicit"
)
assert "if: github.event_name == 'push' || inputs.scope == 'backup-storage'" in infra_apply, (
    "one-shot push must be restricted to the backup-storage reconcile"
)
assert "if: github.event_name == 'workflow_dispatch' && inputs.scope == 'full'" in infra_apply, (
    "full infrastructure apply must remain manual"
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
assert '/bin/bash "$tunnel_connector"' in deploy
assert 'public_tunnel_attest "$sha"' in deploy
assert 'tunnel_action="restarted"' in deploy

# Deploy timing markers are observational only: they expose where time is spent
# without weakening or bypassing any readiness/integrity gate.
for phase in ("checkout", "preflight", "image_pull", "recreate", "readiness", "switch", "tunnel", "drain", "total"):
    assert f"phase_done {phase}" in deploy
assert "OCI_DEPLOY_TIMINGS target=%s phases=%s tunnel=%s color=%s" in deploy
assert 'if [[ "$target" == staging ]]; then' in deploy
assert 'tunnel_action="local-only"' in deploy
assert 'CHESS_STUDIO_DEPLOY_OK target=$target repo_ref=$sha' in deploy
assert 'install -o root -g root -m 0755 "$source_launcher" "$target_launcher"' in deploy
assert 'install -o root -g root -m 0755 "$source_runtime_installer" "$target_runtime_installer"' in deploy
assert 'source_runtime_installer="$repo/scripts/oci_runtime_install.sh"' in deploy
assert '/bin/bash "$tunnel_connector" --self-test >/dev/null' in deploy
# Images may still be publishing when the deploy starts: bounded pull retry.
assert 'docker pull --quiet "$ref" >/dev/null 2>&1' in deploy
assert 'local attempts="${CHESS_STUDIO_IMAGE_PULL_ATTEMPTS:-18}"' in deploy
assert 'if ! pull_immutable_image "$pvp_target_image"; then' in deploy
assert 'candidate_pvp_service="$(pvp_service "$candidate_color")"' in deploy
# Python retirement: on in staging and production; when on, only the Go
# sidecar runs, Go proves /api/ready and /api/release, Go mints the owner
# token, nginx never names a backend_* slot and rollback stays on Go.
assert "payload.get('pythonRetired')" in deploy
assert 'go_attest "$sha" "$candidate_pvp_service"' in deploy
assert 'wget -q -O - http://127.0.0.1:8080/api/ready' in deploy
assert 'wget -q -O - http://127.0.0.1:8080/api/release' in deploy
assert '/app/api-edge mint-token' in deploy
assert 'go_owner_token "$candidate_pvp_service" PVP_BROWSER_AUTH' in deploy
assert 'go_virtual_roster_attest "$pvp_service"' in deploy
go_roster = deploy.split("go_virtual_roster_attest() {", 1)[1].split("\npvp_browser_token() {", 1)[0]
assert '-e "PVP_ATTEST_TOKEN=$token"' in go_roster
assert 'Bearer $PVP_ATTEST_TOKEN' in go_roster  # expanded inside the container
assert 'python - ' not in go_roster
assert 'exit 84' in deploy
assert "CHESS_STUDIO_PVP_NATIVE_LOBBY_READ_ENABLED" in deploy
assert "CHESS_STUDIO_PVP_NATIVE_CHALLENGE_CREATE_ENABLED" in deploy
# The browser attestation must default like compose, or an unset variable
# silently skips the native challenge-create marker check.
assert 'native_expected="${CHESS_STUDIO_PVP_NATIVE_CHALLENGE_CREATE_ENABLED:-true}"' in deploy
assert "CHESS_STUDIO_PVP_NATIVE_CHALLENGE_CREATE_ENABLED:-false" not in deploy
assert "payload.get('pythonRetired') is not True" in deploy
assert "any(value is not True for value in native.values())" in deploy
assert 'pvp_target_image="$(pvp_image_ref "$sha")"' in deploy
# nginx only ever fronts a Go slot: the candidate at cutover and commit, the
# previous slot on rollback. No render names a Python upstream or an edge mode.
assert 'render_edge "$candidate_color" "${previous_sha:-}"' in deploy
assert 'render_edge "$candidate_color" "$sha"' in deploy
assert 'render_edge "$previous_color" "${previous_sha:-}"' in deploy
assert "--pvp-mode" not in deploy and "--api-mode" not in deploy
assert "wait_pvp_browser_attest api_edge_attest" in deploy
assert 'pull_immutable_image "$pvp_target_image"' in deploy
assert 'wait_pvp_edge_attest "$port" "$previous_sha"' in deploy
assert '--committed-sha "$committed_sha"' in deploy
assert 'failed to publish committed OCI generation marker' in deploy
assert 'remove_service "$(pvp_service "$previous_color")"' in deploy
assert 'CHESS_STUDIO_DEPLOY_OK target=$target repo_ref=$sha color=$candidate_color backend=go' in deploy
assert 'pvp_edge_attest()' in deploy
assert 'local expected_release="${2:-$sha}"' in deploy
assert 'pvp_edge_attest "$target_port" "$expected_release"' in deploy
assert 'pvp_virtual_roster_attest()' in deploy
assert 'pvp_browser_token()' in deploy
assert 'pvp_authenticated_browser_attest()' in deploy
for virtual_rival in ("sparringmeister", "otto_falk", "marta_stein", "viktor_kraus"):
    assert virtual_rival in deploy, f"missing virtual roster deploy attestation rival: {virtual_rival}"
virtual_roster_attest = deploy.split("pvp_virtual_roster_attest() {", 1)[1].split(
    "\npvp_edge_attest() {", 1
)[0]
assert 'for username in (sparring, *residents):' in virtual_roster_attest
assert 'for username in residents:' in virtual_roster_attest
assert '!= "resident"' in virtual_roster_attest
assert 'sparring: "sparring"' not in virtual_roster_attest
browser_token = deploy.split("pvp_browser_token() {", 1)[1].split(
    "\npvp_authenticated_browser_attest() {", 1
)[0]
assert 'go_owner_token "$candidate_pvp_service" PVP_BROWSER_AUTH' in browser_token
assert 'mint-token' in deploy and 'PVP_BROWSER_TOKEN=' in deploy
authenticated_browser_attest = deploy.split("pvp_authenticated_browser_attest() {", 1)[1].split(
    "\npvp_edge_attest() {", 1
)[0]
for fragment in (
    'token_output="$(pvp_browser_token)"',
    '[[ "$line" == PVP_BROWSER_TOKEN=* ]]',
    'token_line="${line#PVP_BROWSER_TOKEN=}"',
    'multiple token sentinels',
    'did not receive one framed JWT',
    'endpoint="$api_base/pvp/lobby"',
    'endpoint="$api_base/pvp/lobby/pulse"',
    'expected_native="lobby-read"',
    'expected_native="lobby-pulse"',
    '-H "Origin: $cors_origin"',
    "-H 'Access-Control-Request-Method: GET'",
    "-H 'Access-Control-Request-Headers: authorization,x-request-id,x-client-release,x-presence-session'",
    '[[ "$preflight_status" != "204" ]]',
    'authenticated preflight must expose exactly one canonical ACAO',
    'authenticated preflight does not allow GET',
    'for required in ("authorization", "x-request-id", "x-client-release", "x-presence-session")',
    'authenticated preflight did not traverse Go edge',
    'authenticated preflight hit the wrong native route',
    '-H "Authorization: Bearer $token"',
    '[[ "$status" != "200" ]]',
    'origins != [expected_origin.strip().lower()]',
    'parsed.get("x-chess-pvp-edge", [])',
    'parsed.get("x-chess-pvp-native", [])',
    'parsed.get("x-request-id", [])',
    'payload.get("roster")',
    'payload.get("source") != "go"',
    '"revision" not in payload',
    'payload.get("pollAfterMs")',
):
    assert fragment in authenticated_browser_attest, (
        f"missing authenticated browser deploy attestation contract: {fragment}"
    )
assert "payload.get('release')" in deploy
assert "expected_release" in deploy
assert '"http://127.0.0.1:${target_port}/api/pvp/_edge/ready"' in deploy
assert "X-Chess-Pvp-Edge:" in deploy
assert 'wait_pvp_edge_attest()' in deploy
assert 'CHESS_STUDIO_PVP_EDGE_ATTEST_ATTEMPTS:-20' in deploy
assert 'wait_pvp_browser_attest()' in deploy
assert 'CHESS_STUDIO_PVP_BROWSER_ATTEST_ATTEMPTS:-12' in deploy
assert 'if "$attest_fn" "$endpoint" "${@:3}"; then' in deploy
# Native games writes: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/games/deploy-attest/move" POST; then' in deploy
assert 'exit 60' in deploy
assert 'games_native_attest "http://127.0.0.1:${port}/api/games/deploy-attest/hint"; then' in deploy
assert 'exit 61' in deploy
# Native position analysis: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/analyze" POST; then' in deploy
assert 'exit 62' in deploy
assert 'games_native_attest "http://127.0.0.1:${port}/api/analyze-move" POST; then' in deploy
assert 'exit 63' in deploy
# Native system routes: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/status" GET X-Chess-System-Native; then' in deploy
assert 'X-Chess-System-Native; then' in deploy.split('exit 65', 1)[0]
# Native profile: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/profile" GET X-Chess-Profile-Native; then' in deploy
assert 'exit 67' in deploy
# Native session routes: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/auth/me" GET X-Chess-Session-Native; then' in deploy
assert 'exit 68' in deploy
# Native login: staging first, attested by Go's 422 for an empty body.
assert 'games_native_attest "http://127.0.0.1:${port}/api/auth/login" POST X-Chess-Auth-Native 422; then' in deploy
assert 'local expected_status="${4:-401}"' in deploy
assert 'exit 71' in deploy
# Native account routes: staging first, attested through Go after the cutover.
assert 'games_native_attest "http://127.0.0.1:${port}/api/auth/password" PUT X-Chess-Auth-Native; then' in deploy
assert 'exit 72' in deploy
# Native recovery: staging first, attested by Go's 422 for an empty body.
assert 'games_native_attest "http://127.0.0.1:${port}/api/auth/reset-password" POST X-Chess-Auth-Native 422; then' in deploy
assert 'exit 73' in deploy
# Native feedback: staging first, attested by Go's 401 for an anonymous list.
assert 'games_native_attest "http://127.0.0.1:${port}/api/feedback/mine" GET X-Chess-Feedback-Native 401; then' in deploy
assert 'exit 74' in deploy
# Native Matthias read side: staging first, attested by Go's 401 for an anonymous briefing.
assert 'games_native_attest "http://127.0.0.1:${port}/api/matthias/briefing" GET X-Chess-Matthias-Native 401; then' in deploy
assert 'exit 76' in deploy
# Native narrative: staging first, attested by Go's 401 for an anonymous admin AI read.
assert 'games_native_attest "http://127.0.0.1:${port}/api/admin/ai-metrics" GET X-Chess-Narrative-Native 401; then' in deploy
assert 'exit 77' in deploy
# Native Pawn Slug: staging first, attested by Go's 401 for an anonymous stage.
assert 'games_native_attest "http://127.0.0.1:${port}/api/pawn-slug/stages/pawn-slug-v1" GET X-Chess-PawnSlug-Native 401; then' in deploy
assert 'exit 78' in deploy
# Native Chronicles: staging first, attested by Go's 401 for an anonymous area.
assert 'games_native_attest "http://127.0.0.1:${port}/api/chronicles/maps/ash-vault" GET X-Chess-Chronicles-Native 401; then' in deploy
assert 'exit 79' in deploy
# Native Chronicles runs: staging first, attested by Go's 401 for an anonymous run read.
assert 'games_native_attest "http://127.0.0.1:${port}/api/chronicles/runs/attest" GET X-Chess-Chronicles-Native 401; then' in deploy
assert 'exit 80' in deploy
# Native Admin feedback: staging first, attested by Go's 401 for an anonymous summary.
assert 'games_native_attest "http://127.0.0.1:${port}/api/admin/feedback/summary" GET X-Chess-Admin-Native 401; then' in deploy
assert 'exit 81' in deploy
# Native Admin user tools: staging first, attested by Go's 401 for an anonymous user list.
assert 'games_native_attest "http://127.0.0.1:${port}/api/admin/users" GET X-Chess-Admin-Native 401; then' in deploy
assert 'exit 82' in deploy
# Native Admin observability panel: staging first, attested by Go's 401 for an anonymous panel.
assert 'games_native_attest "http://127.0.0.1:${port}/api/admin/observability" GET X-Chess-Admin-Native 401; then' in deploy
assert 'exit 83' in deploy
assert 'sleep 0.25' in deploy
assert 'if ! wait_pvp_edge_attest "$port"; then' in deploy
assert 'if ! wait_pvp_browser_attest pvp_browser_cors_attest "http://127.0.0.1:${port}/api/pvp/roster"; then' in deploy
assert 'if ! wait_pvp_browser_attest pvp_lobby_read_attest "http://127.0.0.1:${port}/api/pvp/lobby"; then' in deploy
assert 'if ! wait_pvp_browser_attest pvp_challenge_browser_attest "http://127.0.0.1:${port}/api/pvp/challenges"; then' in deploy
roster_attest = deploy.split("pvp_browser_cors_attest() {", 1)[1].split(
    "\npvp_lobby_read_attest() {", 1
)[0]
lobby_attest = deploy.split("pvp_lobby_read_attest() {", 1)[1].split(
    "\npvp_challenge_browser_attest() {", 1
)[0]
challenge_attest = deploy.split("pvp_challenge_browser_attest() {", 1)[1].split(
    "\nwait_pvp_edge_attest() {", 1
)[0]
assert '[[ "$status" != "204" ]]' in roster_attest
assert '[[ "$status" != "200" && "$status" != "204" ]]' not in roster_attest
assert '[[ "$status" != "401" ]]' in lobby_attest
assert 'lobby-read' in lobby_attest
assert 'deliberately-invalid' in lobby_attest
assert '[[ "$status" != "200" && "$status" != "204" ]]' in challenge_attest
assert 'if ! pvp_browser_cors_attest "${public_api_url}/pvp/roster"; then' in deploy
assert 'if ! pvp_lobby_read_attest "${public_api_url}/pvp/lobby"; then' in deploy
assert 'if ! pvp_challenge_browser_attest "${public_api_url}/pvp/challenges"; then' in deploy
public_authenticated = deploy.find(
    'if ! pvp_authenticated_browser_attest "$public_api_url" "$target"; then'
)
commit_marker = deploy.rfind('record_successful_backend "$sha"')
assert 0 <= public_authenticated < commit_marker, (
    "authenticated public lobby/pulse browser attestation must pass before the generation is committed"
)
assert 'compose "$sha" logs --no-color --tail=40 "$candidate_pvp_service" edge' in deploy
assert 'render_edge "$candidate_color"' in deploy
assert 'reload_edge' in deploy
assert 'write_active_color "$candidate_color"' in deploy
assert 'sleep "${CHESS_STUDIO_BLUE_GREEN_DRAIN_SECONDS:-50}"' in deploy
assert 'remove_service "$(pvp_service "$previous_color")"' in deploy
assert 'compose "$sha" up -d --no-build edge' in deploy
assert 'edge:' in compose
assert 'backend_' not in compose and 'chess-studio-backend' not in compose  # no Python service
assert compose.count('GO_PYTHON_RETIRED: "true"') == 2
assert 'pvp_blue:' in compose and 'pvp_green:' in compose
assert 'ghcr.io/evilsysadmin/chess-studio-pvp:oci-${CHESS_STUDIO_BLUE_SHA' in compose
assert 'ghcr.io/evilsysadmin/chess-studio-pvp:oci-${CHESS_STUDIO_GREEN_SHA' in compose
assert 'x-pvp-common: &pvp-common' in compose
assert 'env_file:' in compose.split('x-pvp-common: &pvp-common', 1)[1].split('services:', 1)[0]
assert '${CHESS_STUDIO_ENV_FILE:-/etc/chess-studio/backend.env}' in compose.split('x-pvp-common: &pvp-common', 1)[1].split('services:', 1)[0]
assert compose.count('CORS_ORIGINS: "${CHESS_STUDIO_CORS_ORIGINS:-https://staging.chess-studio.shadowops.dpdns.org}"') == 2
assert '127.0.0.1:${CHESS_STUDIO_PVP' not in compose
assert 'CHESS_STUDIO_BLUE_PORT' not in compose and 'CHESS_STUDIO_GREEN_PORT' not in compose
assert '127.0.0.1:${CHESS_STUDIO_BACKEND_PORT:-4000}:8080' in compose
assert 'nginx:1.27.5-alpine' in compose
edge_renderer = (ROOT / "scripts" / "oci_blue_green_edge.py").read_text(encoding="utf-8")
assert 'location = /api/pvp/_edge/ready' in edge_renderer
assert 'location = /api/_deploy/committed' in edge_renderer
assert 'return 503 "uncommitted' in edge_renderer
assert 'parser.add_argument("--committed-sha", default="")' in edge_renderer
assert 'location = /api/pvp' in edge_renderer
assert 'location ^~ /api/pvp/' in edge_renderer
assert 'upstream = f"pvp_{color}:8080"' in edge_renderer
assert 'backend_upstream' not in edge_renderer
assert 'proxy_set_header Upgrade $http_upgrade;' in edge_renderer
assert 'proxy_set_header Connection $chess_connection_upgrade;' in edge_renderer
assert '--pvp-mode' not in edge_renderer and '--api-mode' not in edge_renderer
assert "OCI_DEPLOY_PHASE name=%s duration_ms=%s" not in deploy

# Agent diagnostics are aggregate-only and observational. Never emit raw agent
# log lines into Actions, and never let diagnostics block an otherwise healthy deploy.
assert "agent_diag_summary()" in deploy
assert "OCI_AGENT_DIAG version=%s active=%s restarts=%s" in deploy
assert "tail -n 2000" in deploy
assert "poll_errors" in deploy and "backoff" in deploy and "transport_errors" in deploy
assert "agent_diag_summary ||" in deploy
assert 'cat "$log"' not in deploy.split("agent_diag_summary()", 1)[1].split("total_started_ms=", 1)[0]
assert 'alloy_validate_log="$(mktemp /tmp/chess-studio-alloy-validate.XXXXXX)"' in deploy
assert 'tail -n 40' in deploy
assert '[redacted]' in deploy
assert 'rm -f "$alloy_validate_log"' in deploy

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
# recreate only the inactive blue/green slot so a newly installed runtime is
# consumed without dropping the active listener.
assert "require flock" in deploy
assert 'flock -w 120 8' not in deploy
assert 'for ((attempt=1; attempt<=24; attempt++))' in deploy
assert 'flock -w 5 8' in deploy
assert 'supersede_if_stale()' in deploy
assert deploy.count('supersede_if_stale') >= 3
assert '[[ "$status" == 42 ]] && exit 0' in deploy
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
assert 'scripts/staging_generation.py watch-committed --sha "$DEPLOY_SHA"' in staging_deploy
assert "f\"{url('STAGING_API_URL')}/_deploy/committed?probe={attempt}\"" in staging_generation
assert "body.strip().lower() == sha" in staging_generation
assert "OCI_DEPLOY_WATCH_IMAGE_PENDING" in deploy_watcher
assert '["docker", "manifest", "inspect", ref]' in deploy_watcher
assert 'return image_available(go_image_ref(candidate))' in deploy_watcher
assert 'git -C "$repo" ls-remote --exit-code origin refs/heads/main' in deploy
assert '["sudo", "--non-interactive", DEPLOY_WRAPPER, candidate]' in deploy_watcher
assert "ENABLE_MARKER.is_symlink()" in deploy_watcher
assert "import oci" not in deploy_watcher
assert "User=ocarun" in deploy_watcher_unit
# Oracle Cloud Agent owns the ocarun account but does not guarantee a same-name
# group. Let systemd use the account's real primary group; an explicit missing
# Group=ocarun fails with status=216/GROUP and creates a restart storm.
assert "Group=ocarun" not in deploy_watcher_unit
assert "systemctl disable --now chess-studio-deploy-watcher.service" in deploy
assert "PrivateTmp=true" in deploy_watcher_unit
assert "ListenStream" not in deploy_watcher_unit

from oci_production_tunnel import self_test as production_tunnel_self_test
from oci_vault_sync import self_test as vault_sync_self_test

vault_sync_self_test()
production_tunnel_self_test()
print("OCI staging CORS + runtime deployment contract: OK")
# Go-only runtime (Python retired 2026-10-10): one Go slot per color, attested
# inside its container, every native route attested through the edge, rollback
# back to the previous Go slot, and no trace of the Python runtime or flags.
for retired in ("api_edge_mode", "go_native_", "python_retired", "backend_legacy", "slot_service",
                "candidate_port", "chess-studio-backend:", "image_available_for_rollback", "python - "):
    assert retired not in deploy, f"Python-era deploy remnant: {retired}"
assert 'compose "$sha" up -d --no-build --force-recreate "$candidate_pvp_service"' in deploy
assert 'if go_attest "$sha" "$candidate_pvp_service" && pvp_attest "$candidate_pvp_service"; then' in deploy
assert 'active_backend_service="$candidate_pvp_service"' in deploy
assert 'if ! pvp_virtual_roster_attest "$candidate_pvp_service" "$target"; then' in deploy
assert 'if ! pvp_authenticated_browser_attest "http://127.0.0.1:${port}/api" "$target"; then' in deploy
assert 'if ! wait_pvp_browser_attest cors_attest "$port"; then' in deploy
assert 'if ! wait_pvp_browser_attest api_edge_attest "http://127.0.0.1:${port}/api/release"; then' in deploy
for route_attest in (
    '"http://127.0.0.1:${port}/api/games"; then',
    '"http://127.0.0.1:${port}/api/auth/login" POST X-Chess-Auth-Native 422; then',
    '"http://127.0.0.1:${port}/api/admin/observability" GET X-Chess-Admin-Native 401; then',
):
    assert f'if ! wait_pvp_browser_attest games_native_attest {route_attest}' in deploy, route_attest
for exit_code in range(58, 85):
    if exit_code in (64, 66, 69, 70, 75):  # unrelated/unused codes
        continue
    assert f"  exit {exit_code}\n" in deploy, f"missing post-cutover attestation exit {exit_code}"
assert deploy.rfind('record_successful_backend "$sha"') < deploy.rfind('render_edge "$candidate_color" "$sha"')
assert 'CHESS_STUDIO_ROLLBACK_OK repo_ref=${previous_sha:-unknown} color=$previous_color pvp=$rollback_mode' in deploy
rollback_body = deploy.split("rollback() {", 1)[1].split("\n}\n", 1)[0]
assert 'render_edge "$previous_color" "${previous_sha:-}"' in rollback_body
assert 'wait_pvp_edge_attest "$port" "$previous_sha"' in rollback_body
assert "backend_" not in rollback_body
python_rollback = (ROOT / "infra" / "oci" / "runtime" / "docker-compose.python-rollback.yml.bak").read_text(encoding="utf-8")
assert python_rollback.startswith("# ROLLBACK ONLY")
assert "6a558ff5c62716efa217cd3a3228439ba0365026" in python_rollback
assert "backend_blue:" in python_rollback and "backend_legacy:" in python_rollback
print("OCI Go-only runtime contract: OK")
