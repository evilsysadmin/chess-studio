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
status_client = (ROOT / "scripts/oci_k3s_status.py").read_text(encoding="utf-8")
status_root = (ROOT / "scripts/oci_k3s_status_root.py").read_text(encoding="utf-8")
staging2_client = (ROOT / "scripts/oci_k3s_staging2.py").read_text(encoding="utf-8")
staging2_root = (ROOT / "scripts/oci_k3s_staging2_root.py").read_text(encoding="utf-8")
staging2_template = (ROOT / "infra/oci/gitops/staging2/backend.yaml.tmpl").read_bytes()
provision = (ROOT / "scripts/oci_k3s_capability_provision.sh").read_text(encoding="utf-8")
sudoers = (ROOT / "infra/oci/runtime/ocarun.sudoers").read_text(encoding="utf-8")
config = (ROOT / "infra/oci/k3s/config.yaml").read_bytes()
unit = (ROOT / "infra/oci/k3s/k3s.service").read_bytes()
install_source = probe.split("\ndef install_command", 1)[1].split("\ndef _run", 1)[0]

assert workflow.count("'infra/oci/k3s/**'") >= 1, "K3s infra must participate in PR readiness"
assert workflow.count("'scripts/oci_k3s_*'") >= 1, "K3s scripts must participate in PR readiness"
assert "\n  push:\n" not in workflow, "OCI readiness must remain validation-only on repository events"
assert "\n  publish-k3s:\n" not in workflow, "K3s publication must not live in the readiness workflow"

assert "fast_path=true" in install_source and "fast_path=false" in install_source
assert install_source.index("fast_path=true") < install_source.index("InstancePrincipalsSecurityTokenSigner")
assert "K3s service unexpectedly exists" not in install_source, (
    "asset reconciliation must remain compatible with the separately prepared inert K3s service"
)
assert "sudo --non-interactive" in install_source, "slow path must retain the narrow root installer"

# Lifecycle privilege remains mutation-only and narrow: the OCI-side client can
# request only two literal operations, while the root-owned wrapper performs
# systemd work after proving byte-exact assets/config/unit and resource headroom.
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

# Status is intentionally a separate root-owned capability. It has no operation
# argument, reports health/resources, and must never acquire lifecycle or file
# mutation primitives merely because it runs as root.
ast.parse(status_client)
ast.parse(status_root)
assert 'WRAPPER = "/usr/local/sbin/chess-studio-k3s-status"' in status_client
assert 'SUCCESS_MARKER = "OCI_K3S_STATUS_OK"' in status_client
assert "sudo --non-interactive" in status_client and "systemctl" not in status_client
assert "CHESS_STUDIO_REPO" not in status_root and "/opt/chess-studio/repo" not in status_root
assert "OCI_K3S_STATUS_OK" in status_root
for forbidden in (
    '"start"',
    '"stop"',
    '"restart"',
    '"enable"',
    '"disable"',
    ".mkdir(",
    ".unlink(",
    ".write_text(",
    "os.replace(",
):
    assert forbidden not in status_root, f"read-only K3s status probe contains mutation primitive: {forbidden}"
assert '"is-active"' in status_root and '"is-enabled"' in status_root
assert '"get", "nodes"' in status_root
assert '"get", "pods", "-A"' in status_root
assert '"coredns", "metrics-server"' in status_root
assert "mem_available_mib=" in status_root and "disk_free_mib=" in status_root and "load1=" in status_root

# staging2 is a shadow workload capability only: ClusterIP + temporary loopback
# port-forward, exact immutable SHA, local runtime Secret, and no public service.
ast.parse(staging2_client)
ast.parse(staging2_root)
template_sha = hashlib.sha256(staging2_template).hexdigest()
assert f'TEMPLATE_SHA256 = "{template_sha}"' in staging2_root
assert 'OPERATIONS = ("deploy", "status", "rollback")' in staging2_client
assert 'WRAPPER = "/usr/local/sbin/chess-studio-k3s-staging2"' in staging2_client
assert "sudo --non-interactive" in staging2_client and "kubectl" not in staging2_client
assert "CHESS_STUDIO_REPO" not in staging2_root and "/opt/chess-studio/repo" not in staging2_root
assert 'LOCAL_PORT = 4100' in staging2_root
assert 'NAMESPACE = "chess-studio-staging2"' in staging2_root
assert "port-forward" in staging2_root and "127.0.0.1" in staging2_root
assert "OCI_K3S_STAGING2_DEPLOY_OK" in staging2_root
assert "OCI_K3S_STAGING2_STATUS_OK" in staging2_root
assert "OCI_K3S_STAGING2_ROLLBACK_OK" in staging2_root
template_text = staging2_template.decode("utf-8")
for required in ("type: ClusterIP", "strategy:\n    type: Recreate", "runAsNonRoot: true", "path: /api/health", "path: /api/ready"):
    assert required in template_text, required
for forbidden in ("type: NodePort", "type: LoadBalancer", "hostNetwork:", "hostPort:"):
    assert forbidden not in template_text, forbidden

assert "python3 -S \"$controller\" self-test" in provision
assert "python3 -S \"$status_probe\" self-test" in provision
assert 'python3 -S "$staging2_controller" self-test "$staging2_template"' in provision
assert 'control_target=/usr/local/sbin/chess-studio-k3s-control' in provision
assert 'status_target=/usr/local/sbin/chess-studio-k3s-status' in provision
assert 'staging2_target=/usr/local/sbin/chess-studio-k3s-staging2' in provision
assert 'staging2_template_target=/etc/chess-studio/staging2-backend.yaml.tmpl' in provision
assert 'install -o root -g root -m 0755 "$controller" "$control_target"' in provision
assert 'install -o root -g root -m 0755 "$status_probe" "$status_target"' in provision
assert "OCI_K3S_STATUS_CAPABILITY_READY" in provision
assert "OCI_K3S_STAGING2_CAPABILITY_READY" in provision
assert (
    "CHESS_STUDIO_K3S_CONTROL = /usr/local/sbin/chess-studio-k3s-control start, "
    "/usr/local/sbin/chess-studio-k3s-control rollback"
) in sudoers
assert "CHESS_STUDIO_K3S_CONTROL *" not in sudoers
assert "CHESS_STUDIO_K3S_STATUS = /usr/local/sbin/chess-studio-k3s-status" in sudoers
assert "CHESS_STUDIO_K3S_STATUS *" not in sudoers
assert "CHESS_STUDIO_K3S_STAGING2 = /usr/local/sbin/chess-studio-k3s-staging2 deploy *" in sudoers
assert "/usr/local/sbin/chess-studio-k3s-staging2 status" in sudoers
assert "/usr/local/sbin/chess-studio-k3s-staging2 rollback" in sudoers
assert "CHESS_STUDIO_K3S_CONTROL, CHESS_STUDIO_K3S_STATUS, CHESS_STUDIO_K3S_STAGING2" in sudoers

# K3s lifecycle is an explicit experimental control-plane operation, not a side
# effect of a successful application release. The explicit start owns its own
# idempotent bundle reconcile/install prerequisites under the mutation mutex.
assert "workflow_dispatch:" in service
assert "workflow_run:" not in service
assert "workflows: [Deploy to staging]" not in service
assert "github.event.workflow_run" not in service
assert "auto_admission" not in service
assert "git ls-remote origin refs/heads/main" not in service
assert "ref: ${{ github.sha }}" in service
assert "'oci-staging-mutations'" in service
publish_command = "python3 scripts/oci_k3s_bundle_publish.py reconcile"
install_command = "python3 scripts/oci_k3s_bundle_probe.py install"
start_command = "python3 scripts/oci_k3s_control.py start"
assert "Reconcile K3s bootstrap assets before explicit start" in service
assert publish_command in service and install_command in service and start_command in service
assert service.index(publish_command) < service.index(install_command) < service.index(start_command), (
    "explicit K3s start must reconcile and install exact assets before lifecycle start"
)
assert "Start or ensure guarded single-node K3s" in service
assert "python3 scripts/oci_k3s_control.py rollback" in service
assert "Read K3s status and resource snapshot" in service
assert "python3 scripts/oci_k3s_status.py" in service
assert "inputs.operation == 'k3s-status'" in service
assert "Prove Docker staging survived K3s lifecycle change" in service
assert 'EXPECTED_SHA: ${{ inputs.repo_ref || github.sha }}' in service
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
    "inputs.operation == 'k3s-start'",
    "inputs.operation == 'k3s-status'",
    "inputs.operation == 'k3s-rollback'",
    "inputs.operation == 'deploy' || inputs.operation == 'bringup'",
)
for fragment in manual_only_fragments:
    matching = [line.strip() for line in service.splitlines() if fragment in line and line.lstrip().startswith("if:")]
    assert matching, f"missing manual-only service condition: {fragment}"
    assert all("github.event_name == 'workflow_dispatch'" in line for line in matching), (
        f"non-dispatch events must never authorize manual service operation: {fragment}"
    )

print("OCI K3s readiness + explicit asset reconcile + guarded manual lifecycle + read-only status contract: OK")
