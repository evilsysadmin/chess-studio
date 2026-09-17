#!/usr/bin/env python3
"""No-dependency contracts for K3s readiness, lifecycle privilege and asset fast-path."""
import ast
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/oci-readiness.yml").read_text(encoding="utf-8")
service = (ROOT / ".github/workflows/oci-staging-service.yml").read_text(encoding="utf-8")
probe = (ROOT / "scripts/oci_k3s_bundle_probe.py").read_text(encoding="utf-8")
client = (ROOT / "scripts/oci_k3s_control.py").read_text(encoding="utf-8")
root_control = (ROOT / "scripts/oci_k3s_control_root.py").read_text(encoding="utf-8")
provision = (ROOT / "scripts/oci_k3s_capability_provision.sh").read_text(encoding="utf-8")
sudoers = (ROOT / "infra/oci/runtime/ocarun.sudoers").read_text(encoding="utf-8")
config = (ROOT / "infra/oci/k3s/config.yaml").read_bytes()
unit = (ROOT / "infra/oci/k3s/k3s.service").read_bytes()
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

# Lifecycle privilege is intentionally split: the OCI-side client can request
# only two literal operations, while the root-owned wrapper performs systemd
# work after proving byte-exact assets/config/unit and resource headroom.
ast.parse(client)
ast.parse(root_control)
config_sha = hashlib.sha256(config).hexdigest()
unit_sha = hashlib.sha256(unit).hexdigest()
assert f'CONFIG_SHA256 = "{config_sha}"' in root_control
assert f'UNIT_SHA256 = "{unit_sha}"' in root_control
assert "CHESS_STUDIO_REPO" not in root_control and "/opt/chess-studio/repo" not in root_control, (
    "privileged K3s lifecycle control must not execute repository content at invocation time"
)
assert 'OPERATIONS = ("start", "rollback")' in client
assert 'WRAPPER = "/usr/local/sbin/chess-studio-k3s-control"' in client
assert "sudo --non-interactive" in client and "systemctl" not in client
assert 'sys.argv[1] not in {"start", "rollback", "self-test"}' in root_control
assert 'MIN_START_MEM_AVAILABLE = 4 * 1024**3' in root_control
assert 'MIN_READY_MEM_AVAILABLE = 3 * 1024**3' in root_control
assert 'MIN_START_DISK_FREE = 8 * 1024**3' in root_control
assert 'MIN_READY_DISK_FREE = 6 * 1024**3' in root_control
assert 'READY_TIMEOUT_SECONDS = 300' in root_control
assert '"coredns", "metrics-server"' in root_control
start_source = root_control.split("\ndef start()", 1)[1].split("\ndef self_test()", 1)[0]
assert start_source.index("node_name = _wait_ready()") < start_source.index('_systemctl("enable", "k3s.service"'), (
    "K3s must not be enabled for reboot persistence until first bootstrap is Ready"
)
assert 'rollback("start-failed")' in start_source
assert "OCI_K3S_START_OK" in root_control and "OCI_K3S_ROLLBACK_OK" in root_control

assert "python3 -S \"$controller\" self-test" in provision
assert 'control_target=/usr/local/sbin/chess-studio-k3s-control' in provision
assert 'install -o root -g root -m 0755 "$controller" "$control_target"' in provision
assert (
    "CHESS_STUDIO_K3S_CONTROL = /usr/local/sbin/chess-studio-k3s-control start, "
    "/usr/local/sbin/chess-studio-k3s-control rollback"
) in sudoers
assert "CHESS_STUDIO_K3S_CONTROL *" not in sudoers
assert "CHESS_STUDIO_K3S_ASSETS, CHESS_STUDIO_K3S_CONTROL" in sudoers

# A successful canonical staging generation automatically ensures the base K3s
# node only while that generation is still current main. A superseded staging
# run must finish cleanly without any OCI mutation. Every other service-control
# operation remains explicit workflow_dispatch-only.
assert "workflow_run:" in service
assert "workflows: [Staging · deploy]" in service
assert "types: [completed]" in service and "branches: [main]" in service
assert "github.event.workflow_run.conclusion == 'success'" in service
assert "ref: ${{ github.event.workflow_run.head_sha || github.sha }}" in service
assert "Admit only the current main staging generation for automatic K3s ensure" in service
assert 'UPSTREAM_SHA: ${{ github.event.workflow_run.head_sha }}' in service
assert "git ls-remote origin refs/heads/main" in service
assert 'echo \'admitted=false\' >> "$GITHUB_OUTPUT"' in service
assert 'echo \'admitted=true\' >> "$GITHUB_OUTPUT"' in service
assert "steps.auto_admission.outputs.admitted == 'true'" in service
assert "group: oci-staging-mutations" in service
assert "Start or ensure guarded single-node K3s" in service
assert "python3 scripts/oci_k3s_control.py start" in service
assert "python3 scripts/oci_k3s_control.py rollback" in service
assert "Prove Docker staging survived K3s lifecycle change" in service
assert 'EXPECTED_SHA: ${{ github.event.workflow_run.head_sha || inputs.repo_ref || github.sha }}' in service
assert '--sha "$EXPECTED_SHA"' in service

manual_only_fragments = (
    "inputs.operation == 'mongo-target-diagnose'",
    "inputs.operation == 'runtime-sync'",
    "inputs.operation == 'vault-bootstrap'",
    "inputs.operation == 'vault-validate-pending'",
    "inputs.operation == 'reboot-agent'",
    "inputs.operation == 'backend-diagnose'",
    "inputs.operation == 'mongo-network-diagnose'",
    "inputs.operation == 'reserved-egress'",
    "inputs.operation == 'k3s-rollback'",
    "inputs.operation == 'deploy' || inputs.operation == 'bringup'",
)
for fragment in manual_only_fragments:
    matching = [line.strip() for line in service.splitlines() if fragment in line and line.lstrip().startswith("if:")]
    assert matching, f"missing manual-only service condition: {fragment}"
    assert all("github.event_name == 'workflow_dispatch'" in line for line in matching), (
        f"workflow_run must never authorize manual service operation: {fragment}"
    )

print("OCI K3s readiness + guarded lifecycle + auto-ensure + fast-path contract: OK")
