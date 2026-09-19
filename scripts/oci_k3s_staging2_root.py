#!/usr/bin/env python3
"""Root-only shadow backend deployment for OCI K3s staging2.

The wrapper consumes only an installed, hash-pinned manifest template and the
root-owned runtime env file. It never executes repository content at invocation
and never exposes a NodePort/LoadBalancer. Local accreditation uses a temporary
127.0.0.1 port-forward which is always torn down.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

K3S = Path("/usr/local/bin/k3s")
TEMPLATE = Path("/etc/chess-studio/staging2-backend.yaml.tmpl")
TEMPLATE_SHA256 = "5a286332bcab79433ad46425f94125ce7f91f0c96e043aac2af5fbab412d9f21"
RUNTIME_ENV = Path("/etc/chess-studio/backend.env")
STATE = Path("/var/lib/chess-studio/staging2-deployed.sha")
NAMESPACE = "chess-studio-staging2"
DEPLOYMENT = "backend"
SERVICE = "backend"
SECRET = "backend-runtime"
LOCAL_PORT = 4100
ORIGIN = "https://staging2.chess-studio.shadowops.dpdns.org"
IMAGE_PREFIX = "ghcr.io/evilsysadmin/chess-studio-backend:oci-"
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
MIN_PRE_MEM = 3500 * 1024**2
MIN_POST_MEM = 3000 * 1024**2
MIN_PRE_DISK = 30 * 1024**3
MIN_POST_DISK = 28 * 1024**3


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _regular(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"{label} must be a regular non-symlink file: {path}")


def _kubectl(*args: str, stdin: str | None = None, timeout: int = 45, check: bool = True) -> subprocess.CompletedProcess[str]:
    completed = subprocess.run(
        [str(K3S), "kubectl", *args],
        input=stdin,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )
    if check and completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "kubectl failed").strip().replace("\n", " ")[:500]
        raise SystemExit(f"staging2 kubectl failed rc={completed.returncode}: {detail}")
    return completed


def _mem_available() -> int:
    for line in Path("/proc/meminfo").read_text(encoding="utf-8").splitlines():
        if line.startswith("MemAvailable:"):
            fields = line.split()
            if len(fields) >= 2 and fields[1].isdigit():
                return int(fields[1]) * 1024
    raise SystemExit("staging2 could not read MemAvailable")


def _disk_free() -> int:
    stats = os.statvfs("/var/lib/rancher/k3s")
    return stats.f_bavail * stats.f_frsize


def _resources() -> tuple[int, int, float]:
    return _mem_available(), _disk_free(), os.getloadavg()[0]


def _resource_gate(mem_floor: int, disk_floor: int, phase: str) -> tuple[int, int, float]:
    mem, disk, load1 = _resources()
    if mem < mem_floor:
        raise SystemExit(f"staging2 {phase} memory gate failed: {mem // 1024**2}MiB < {mem_floor // 1024**2}MiB")
    if disk < disk_floor:
        raise SystemExit(f"staging2 {phase} disk gate failed: {disk // 1024**2}MiB < {disk_floor // 1024**2}MiB")
    return mem, disk, load1


def _verify_host_contract() -> None:
    if os.geteuid() != 0:
        raise SystemExit("staging2 control requires root")
    _regular(K3S, "K3s binary")
    _regular(TEMPLATE, "staging2 manifest template")
    _regular(RUNTIME_ENV, "backend runtime env")
    if _sha256(TEMPLATE) != TEMPLATE_SHA256:
        raise SystemExit("staging2 manifest template digest drifted")
    stat = RUNTIME_ENV.stat()
    if stat.st_uid != 0 or (stat.st_mode & 0o077):
        raise SystemExit("backend runtime env must remain root-owned and non-group/world-readable")
    active = subprocess.run(
        ["systemctl", "is-active", "--quiet", "k3s.service"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    if active.returncode != 0:
        raise SystemExit("K3s must be active before staging2 deployment")


def _render(sha: str) -> str:
    if not SHA_RE.fullmatch(sha):
        raise SystemExit("staging2 deploy requires an immutable 40-char lowercase SHA")
    text = TEMPLATE.read_text(encoding="utf-8")
    if text.count("__SHA__") != 3:
        raise SystemExit("staging2 manifest template placeholder count drifted")
    return text.replace("__SHA__", sha)


def _image_ref(sha: str) -> str:
    if not SHA_RE.fullmatch(sha):
        raise SystemExit("staging2 image preflight requires an immutable 40-char lowercase SHA")
    return f"{IMAGE_PREFIX}{sha}"


def _preflight_image(sha: str) -> None:
    """Ensure the exact immutable backend image is available before mutating the workload."""
    image = _image_ref(sha)
    try:
        cached = subprocess.run(
            [str(K3S), "crictl", "inspecti", image],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=15,
            check=False,
        )
    except subprocess.TimeoutExpired:
        cached = None
    if cached is not None and cached.returncode == 0:
        print(f"OCI_K3S_STAGING2_IMAGE_READY sha={sha} source=cache", flush=True)
        return

    try:
        pulled = subprocess.run(
            [str(K3S), "crictl", "pull", image],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=120,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(f"staging2 image pull timed out: sha={sha}") from exc
    if pulled.returncode != 0:
        detail = _clean_diag(pulled.stderr or pulled.stdout or "image pull failed", 400)
        raise SystemExit(
            f"staging2 image pull failed rc={pulled.returncode} sha={sha} detail={detail}"
        )
    print(f"OCI_K3S_STAGING2_IMAGE_READY sha={sha} source=registry", flush=True)


def _apply_text(text: str) -> None:
    _kubectl("apply", "-f", "-", stdin=text, timeout=60)


def _ensure_namespace_and_secret() -> None:
    namespace_yaml = _kubectl(
        "create", "namespace", NAMESPACE, "--dry-run=client", "-o", "yaml"
    ).stdout
    _apply_text(namespace_yaml)
    secret_yaml = _kubectl(
        "-n", NAMESPACE, "create", "secret", "generic", SECRET,
        f"--from-env-file={RUNTIME_ENV}", "--dry-run=client", "-o", "yaml",
    ).stdout
    _apply_text(secret_yaml)


def _deployment_payload() -> dict:
    completed = _kubectl(
        "-n", NAMESPACE, "get", "deployment", DEPLOYMENT, "-o", "json",
        check=False,
    )
    if completed.returncode != 0:
        return {}
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def _release_from_payload(payload: dict) -> str:
    annotations = (((payload.get("spec") or {}).get("template") or {}).get("metadata") or {}).get("annotations") or {}
    value = str(annotations.get("chess-studio.shadowops/release") or "")
    return value if SHA_RE.fullmatch(value) else ""


def _clean_diag(value: object, limit: int = 260) -> str:
    text = str(value or "").replace("\\r", " ").replace("\\n", " ").strip()
    return text[:limit]


def _failure_diagnostics() -> None:
    """Emit bounded workload state without pod logs or Secret contents."""
    print("OCI_K3S_STAGING2_DIAG_BEGIN", file=sys.stderr, flush=True)
    deployment = _deployment_payload()
    if deployment:
        status_payload = deployment.get("status") or {}
        print(
            "OCI_K3S_STAGING2_DIAG_DEPLOYMENT "
            f"replicas={int(status_payload.get('replicas') or 0)} "
            f"ready={int(status_payload.get('readyReplicas') or 0)} "
            f"available={int(status_payload.get('availableReplicas') or 0)} "
            f"unavailable={int(status_payload.get('unavailableReplicas') or 0)}",
            file=sys.stderr,
            flush=True,
        )
        for condition in status_payload.get("conditions") or []:
            if not isinstance(condition, dict):
                continue
            print(
                "OCI_K3S_STAGING2_DIAG_DEPLOYMENT_CONDITION "
                f"type={_clean_diag(condition.get('type'), 64)} "
                f"status={_clean_diag(condition.get('status'), 32)} "
                f"reason={_clean_diag(condition.get('reason'), 96)} "
                f"message={_clean_diag(condition.get('message'))}",
                file=sys.stderr,
                flush=True,
            )

    pods_raw = _kubectl(
        "-n", NAMESPACE, "get", "pods",
        "-l", "app.kubernetes.io/name=chess-studio-backend,chess-studio.shadowops/track=staging2",
        "-o", "json", check=False,
    )
    if pods_raw.returncode == 0:
        try:
            pods = json.loads(pods_raw.stdout).get("items") or []
        except (json.JSONDecodeError, AttributeError):
            pods = []
        for pod in pods[:4]:
            if not isinstance(pod, dict):
                continue
            metadata = pod.get("metadata") or {}
            pod_status = pod.get("status") or {}
            print(
                "OCI_K3S_STAGING2_DIAG_POD "
                f"name={_clean_diag(metadata.get('name'), 96)} "
                f"phase={_clean_diag(pod_status.get('phase'), 32)} "
                f"reason={_clean_diag(pod_status.get('reason'), 96)} "
                f"message={_clean_diag(pod_status.get('message'))}",
                file=sys.stderr,
                flush=True,
            )
            for container in pod_status.get("containerStatuses") or []:
                if not isinstance(container, dict):
                    continue
                state = container.get("state") or {}
                state_name = "unknown"
                state_payload: dict = {}
                for candidate in ("waiting", "terminated", "running"):
                    candidate_payload = state.get(candidate)
                    if isinstance(candidate_payload, dict):
                        state_name = candidate
                        state_payload = candidate_payload
                        break
                print(
                    "OCI_K3S_STAGING2_DIAG_CONTAINER "
                    f"name={_clean_diag(container.get('name'), 64)} "
                    f"ready={bool(container.get('ready'))} "
                    f"restarts={int(container.get('restartCount') or 0)} "
                    f"state={state_name} "
                    f"reason={_clean_diag(state_payload.get('reason'), 96)} "
                    f"message={_clean_diag(state_payload.get('message'))}",
                    file=sys.stderr,
                    flush=True,
                )

    events_raw = _kubectl(
        "-n", NAMESPACE, "get", "events", "--sort-by=.lastTimestamp", "-o", "json",
        check=False,
    )
    if events_raw.returncode == 0:
        try:
            events = json.loads(events_raw.stdout).get("items") or []
        except (json.JSONDecodeError, AttributeError):
            events = []
        for event in events[-8:]:
            if not isinstance(event, dict):
                continue
            involved = event.get("involvedObject") or {}
            print(
                "OCI_K3S_STAGING2_DIAG_EVENT "
                f"type={_clean_diag(event.get('type'), 32)} "
                f"reason={_clean_diag(event.get('reason'), 96)} "
                f"object={_clean_diag(involved.get('kind'), 48)}/{_clean_diag(involved.get('name'), 96)} "
                f"message={_clean_diag(event.get('message'))}",
                file=sys.stderr,
                flush=True,
            )
    print("OCI_K3S_STAGING2_DIAG_END", file=sys.stderr, flush=True)


def _rollout_wait() -> None:
    _kubectl(
        "-n", NAMESPACE, "rollout", "status", f"deployment/{DEPLOYMENT}",
        "--timeout=180s", timeout=195,
    )


def _port_free() -> bool:
    sock = socket.socket()
    try:
        sock.bind(("127.0.0.1", LOCAL_PORT))
        return True
    except OSError:
        return False
    finally:
        sock.close()


def _request_json(path: str) -> dict:
    with urllib.request.urlopen(f"http://127.0.0.1:{LOCAL_PORT}{path}", timeout=4) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload if isinstance(payload, dict) else {}


def _cors_ok() -> bool:
    request = urllib.request.Request(
        f"http://127.0.0.1:{LOCAL_PORT}/api/auth/me",
        method="OPTIONS",
        headers={
            "Origin": ORIGIN,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization,x-client-release",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as response:
            headers = response.headers
    except urllib.error.HTTPError as exc:
        headers = exc.headers
    origin = str(headers.get("access-control-allow-origin") or "").lower()
    methods = str(headers.get("access-control-allow-methods") or "").upper()
    allowed = str(headers.get("access-control-allow-headers") or "").lower()
    return ORIGIN.lower() == origin and "GET" in methods and "authorization" in allowed


def _attest(sha: str) -> None:
    if not _port_free():
        raise SystemExit(f"staging2 loopback port {LOCAL_PORT} is already in use")
    proc = subprocess.Popen(
        [
            str(K3S), "kubectl", "-n", NAMESPACE, "port-forward",
            f"service/{SERVICE}", f"{LOCAL_PORT}:4000", "--address=127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.monotonic() + 45
        last_error = ""
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                raise SystemExit(f"staging2 port-forward exited early rc={proc.returncode}")
            try:
                health = _request_json("/api/health")
                ready = _request_json("/api/ready")
                release = _request_json("/api/release")
                if (
                    health.get("ok") is True
                    and ready.get("ok") is True
                    and ready.get("storage") == "mongo"
                    and str(release.get("build") or "").lower() == sha
                    and _cors_ok()
                ):
                    return
                last_error = "health/readiness/release/CORS mismatch"
            except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
                last_error = type(exc).__name__
            time.sleep(1)
        raise SystemExit(f"staging2 local accreditation timed out: {last_error}")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)


def _write_state(sha: str) -> None:
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, tmp = tempfile.mkstemp(prefix=".staging2-deployed.", dir=STATE.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(sha + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp, 0o644)
        os.chown(tmp, 0, 0)
        os.replace(tmp, STATE)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass


def _restore(previous_sha: str) -> None:
    if previous_sha:
        _ensure_namespace_and_secret()
        _apply_text(_render(previous_sha))
        _rollout_wait()
        _attest(previous_sha)
        _write_state(previous_sha)
        print(f"OCI_K3S_STAGING2_RESTORED sha={previous_sha}", flush=True)
        return
    _kubectl("delete", "namespace", NAMESPACE, "--wait=true", "--timeout=60s", timeout=75, check=False)
    try:
        STATE.unlink()
    except FileNotFoundError:
        pass
    print("OCI_K3S_STAGING2_RESTORED absent=true", flush=True)


def deploy(sha: str) -> None:
    _verify_host_contract()
    pre_mem, pre_disk, pre_load = _resource_gate(MIN_PRE_MEM, MIN_PRE_DISK, "pre-deploy")
    previous_sha = _release_from_payload(_deployment_payload())
    _preflight_image(sha)
    try:
        _ensure_namespace_and_secret()
        _apply_text(_render(sha))
        _rollout_wait()
        _attest(sha)
        post_mem, post_disk, post_load = _resource_gate(MIN_POST_MEM, MIN_POST_DISK, "ready")
        _write_state(sha)
    except BaseException as exc:
        print(
            "OCI_K3S_STAGING2_DEPLOY_FAILED "
            f"type={type(exc).__name__} detail={_clean_diag(exc, 500)}",
            file=sys.stderr,
            flush=True,
        )
        try:
            _failure_diagnostics()
        except BaseException as diag_exc:
            print(
                f"OCI_K3S_STAGING2_DIAG_FAILED detail={_clean_diag(diag_exc, 300)}",
                file=sys.stderr,
                flush=True,
            )
        try:
            _restore(previous_sha)
        except BaseException as rollback_exc:
            print(f"OCI_K3S_STAGING2_ROLLBACK_FAILED detail={rollback_exc}", file=sys.stderr)
        raise
    print(
        "OCI_K3S_STAGING2_DEPLOY_OK "
        f"sha={sha} previous={previous_sha or 'none'} "
        f"loopback_port={LOCAL_PORT} service=ClusterIP "
        f"pre_mem_mib={pre_mem // 1024**2} post_mem_mib={post_mem // 1024**2} "
        f"pre_disk_mib={pre_disk // 1024**2} post_disk_mib={post_disk // 1024**2} "
        f"pre_load1={pre_load:.2f} post_load1={post_load:.2f}"
    )


def _status_needs_diagnostics(desired: int, available: int, sha: str) -> bool:
    return desired < 1 or available != desired or not SHA_RE.fullmatch(sha)


def status() -> None:
    _verify_host_contract()
    payload = _deployment_payload()
    mem, disk, load1 = _resources()
    if not payload:
        print(
            "OCI_K3S_STAGING2_STATUS_OK present=false "
            f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f}"
        )
        return
    spec = payload.get("spec") or {}
    stat = payload.get("status") or {}
    sha = _release_from_payload(payload) or "unknown"
    desired = int(spec.get("replicas") or 0)
    available = int(stat.get("availableReplicas") or 0)
    print(
        "OCI_K3S_STAGING2_STATUS_OK present=true "
        f"sha={sha} desired={desired} available={available} "
        f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f}"
    )
    if _status_needs_diagnostics(desired, available, sha):
        _failure_diagnostics()


def rollback() -> None:
    _verify_host_contract()
    _kubectl("delete", "namespace", NAMESPACE, "--wait=true", "--timeout=60s", timeout=75, check=False)
    try:
        STATE.unlink()
    except FileNotFoundError:
        pass
    print("OCI_K3S_STAGING2_ROLLBACK_OK present=false compose_untouched=true")


def self_test(template_path: Path) -> None:
    _regular(template_path, "staging2 self-test template")
    data = template_path.read_text(encoding="utf-8")
    assert hashlib.sha256(data.encode("utf-8")).hexdigest() == TEMPLATE_SHA256
    assert data.count("__SHA__") == 3
    for required in (
        "name: chess-studio-staging2",
        "type: ClusterIP",
        "strategy:\n    type: Recreate",
        "automountServiceAccountToken: false",
        "runAsNonRoot: true",
        "runAsUser: 10001",
        "runAsGroup: 10001",
        'drop: ["ALL"]',
        "path: /api/health",
        "path: /api/ready",
        "cpu: 600m",
        "memory: 768Mi",
        ORIGIN,
    ):
        assert required in data, required
    for forbidden in ("type: NodePort", "type: LoadBalancer", "hostNetwork:", "hostPort:"):
        assert forbidden not in data, forbidden
    assert MIN_PRE_MEM > MIN_POST_MEM
    assert MIN_PRE_DISK > MIN_POST_DISK
    assert LOCAL_PORT == 4100
    sample_sha = "0" * 40
    assert _image_ref(sample_sha) == f"{IMAGE_PREFIX}{sample_sha}"
    try:
        _image_ref("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("mutable staging2 image ref must fail closed")
    assert not _status_needs_diagnostics(1, 1, sample_sha)
    assert _status_needs_diagnostics(1, 0, "0" * 40)
    assert _status_needs_diagnostics(0, 0, "0" * 40)
    assert _status_needs_diagnostics(1, 1, "unknown")
    source = Path(__file__).read_text(encoding="utf-8")
    assert "OCI_K3S_STAGING2_DIAG_BEGIN" in source
    assert "OCI_K3S_STAGING2_DIAG_CONTAINER" in source
    assert "OCI_K3S_STAGING2_DIAG_EVENT" in source
    assert '"crictl", "inspecti"' in source
    assert '"crictl", "pull"' in source
    deploy_source = source.split("\ndef deploy(sha: str) -> None:", 1)[1].split(
        "\ndef _status_needs_diagnostics", 1
    )[0]
    assert deploy_source.index("_preflight_image(sha)") < deploy_source.index(
        "_ensure_namespace_and_secret()"
    ), "image preflight must fail before workload mutation"
    for forbidden_runtime_token in ("kubectl" + " logs", "get" + " secret"):
        assert forbidden_runtime_token not in source
    print("OCI K3s staging2 root capability self-test: OK")


def main() -> None:
    if len(sys.argv) >= 2 and sys.argv[1] == "self-test":
        if len(sys.argv) != 3:
            raise SystemExit("self-test requires manifest template path")
        self_test(Path(sys.argv[2]))
        return
    if len(sys.argv) < 2:
        raise SystemExit("usage: staging2 <deploy SHA|status|rollback|self-test TEMPLATE>")
    operation = sys.argv[1]
    if operation == "deploy" and len(sys.argv) == 3:
        deploy(sys.argv[2])
    elif operation == "status" and len(sys.argv) == 2:
        status()
    elif operation == "rollback" and len(sys.argv) == 2:
        rollback()
    else:
        raise SystemExit("unsupported staging2 operation")


if __name__ == "__main__":
    main()
