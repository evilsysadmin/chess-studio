#!/usr/bin/env python3
"""No-dependency contracts for K3s readiness, lifecycle privilege and asset fast-path."""
import ast
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
workflow = (ROOT / ".github/workflows/oci-readiness.yml").read_text(encoding="utf-8")
lab = (ROOT / ".github/workflows/oci-staging-lab.yml").read_text(encoding="utf-8")
service = (ROOT / ".github/workflows/oci-staging-service.yml").read_text(encoding="utf-8")
makefile = (ROOT / "Makefile").read_text(encoding="utf-8")
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
backend_dockerfile = (ROOT / "backend-python/Dockerfile").read_text(encoding="utf-8")
install_source = probe.split("\ndef install_command", 1)[1].split("\ndef _run", 1)[0]

assert "'infra/oci/k3s/**'" not in workflow, "K3s HOLD must not trigger canonical OCI readiness"
assert "'scripts/oci_k3s_*'" not in workflow, "K3s HOLD scripts must not trigger canonical OCI readiness"
assert "'infra/oci/k3s/**'" in lab, "K3s infra changes must stay validated by the lab workflow"
assert "'scripts/oci_k3s_*'" in lab, "K3s script changes must stay validated by the lab workflow"
assert "if: github.event_name == 'pull_request'" in lab
assert "python3 scripts/oci_k3s_readiness_contract.py" in lab
assert "github.event_name == 'workflow_dispatch' && !startsWith(inputs.operation, 'k3s-')" in lab
assert "github.event_name == 'workflow_dispatch' && startsWith(inputs.operation, 'k3s-')" in lab
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
assert "root_capability_sha256" in staging2_client
assert "staging2 remote capability stale" in staging2_client
assert "capability_sha256=" in staging2_root
assert "sudo --non-interactive" in staging2_client and "kubectl" not in staging2_client
assert "CHESS_STUDIO_REPO" not in staging2_root and "/opt/chess-studio/repo" not in staging2_root
assert 'LOCAL_PORT = 4100' in staging2_root
assert 'NAMESPACE = "chess-studio-staging2"' in staging2_root
assert "port-forward" in staging2_root and "127.0.0.1" in staging2_root
assert "OCI_K3S_STAGING2_DEPLOY_OK" in staging2_root
assert "OCI_K3S_STAGING2_STATUS_OK" in staging2_root
assert "OCI_K3S_STAGING2_ROLLBACK_OK" in staging2_root
assert "_pinned_digest_from_image_ref" in staging2_root
assert "staging2 rendered image must be a canonical sha256 digest reference" in staging2_root
template_text = staging2_template.decode("utf-8")
for required in (
    "type: ClusterIP",
    "strategy:\n    type: Recreate",
    "runAsNonRoot: true",
    "runAsUser: 10001",
    "runAsGroup: 10001",
    "path: /api/health",
    "path: /api/ready",
):
    assert required in template_text, required
for forbidden in ("type: NodePort", "type: LoadBalancer", "hostNetwork:", "hostPort:"):
    assert forbidden not in template_text, forbidden

# Kubernetes runAsNonRoot validates the OCI image-config USER before container
# start. Keep it numeric and aligned with the unprivileged account baked into
# the backend image so staging2 cannot fail with a non-numeric-user rejection.
assert "addgroup -S -g 10001 chess" in backend_dockerfile
assert "adduser -S -D -H -h /app -u 10001 -G chess chess" in backend_dockerfile
assert "\nUSER 10001:10001\n" in backend_dockerfile
assert "\nUSER chess\n" not in backend_dockerfile

root_self_test_command = (
    "python3 -S scripts/oci_k3s_staging2_root.py self-test "
    "infra/oci/gitops/staging2/backend.yaml.tmpl"
)
assert root_self_test_command not in workflow
assert root_self_test_command in lab
assert root_self_test_command in makefile
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

# K3s/Flux remains reproducible experiment tooling, but HOLD means the normal
# OCI service front-door and Compose release path cannot expose or invoke it.
assert "workflow_dispatch:" in service
assert "workflow_run:" not in service
assert "ref: ${{ github.sha }}" in service
for forbidden in (
    "k3s-start",
    "k3s-status",
    "k3s-rollback",
    "k3s-staging2-deploy",
    "k3s-staging2-status",
    "k3s-staging2-rollback",
    "oci_k3s_bundle_publish.py",
    "oci_k3s_bundle_probe.py",
    "oci_k3s_control.py",
    "oci_k3s_status.py",
    "oci_k3s_staging2.py",
):
    assert forbidden not in service, f"K3s HOLD leaked into canonical OCI service control: {forbidden}"

print("OCI K3s readiness: lab tooling intact; canonical Compose service path stays K3s-free")
