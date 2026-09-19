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
NAMESPACE_LABELS = {
    "app.kubernetes.io/part-of": "chess-studio",
    "chess-studio.shadowops/track": "staging2",
}
DEPLOYMENT = "backend"
SERVICE = "backend"
SECRET = "backend-runtime"
LOCAL_PORT = 4100
ORIGIN = "https://staging2.chess-studio.shadowops.dpdns.org"
IMAGE_PREFIX = "ghcr.io/evilsysadmin/chess-studio-backend:oci-"
IMAGE_REPOSITORY = IMAGE_PREFIX.split(":oci-", 1)[0]
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
IMAGE_DIGEST_RE = re.compile(rf"^{re.escape(IMAGE_REPOSITORY)}@sha256:[0-9a-f]{{64}}$")
SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
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


def _capability_sha256() -> str:
    return _sha256(Path(__file__))


def _runtime_env_sha256() -> str:
    return _sha256(RUNTIME_ENV)


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


def _render(
    sha: str,
    pinned_image: str = "",
    runtime_digest: str = "",
    template_path: Path = TEMPLATE,
) -> str:
    if not SHA_RE.fullmatch(sha):
        raise SystemExit("staging2 deploy requires an immutable 40-char lowercase SHA")
    text = template_path.read_text(encoding="utf-8")
    if text.count("__SHA__") != 3:
        raise SystemExit("staging2 manifest template placeholder count drifted")
    rendered = text.replace("__SHA__", sha)
    if not pinned_image and not runtime_digest:
        return rendered
    if not IMAGE_DIGEST_RE.fullmatch(pinned_image):
        raise SystemExit("staging2 rendered image must be a canonical sha256 digest reference")
    if not SHA256_RE.fullmatch(runtime_digest):
        raise SystemExit("staging2 rendered runtime contract must be a sha256 digest")
    release_needle = f'chess-studio.shadowops/release: "{sha}"'
    if rendered.count(release_needle) != 1:
        raise SystemExit("staging2 rendered release annotation drifted")
    rendered = rendered.replace(
        release_needle,
        release_needle
        + f'\n        chess-studio.shadowops/runtime-sha256: "{runtime_digest}"',
    )
    tagged_image = _image_ref(sha)
    needle = f"image: {tagged_image}"
    if rendered.count(needle) != 1:
        raise SystemExit("staging2 rendered manifest image reference drifted")
    return rendered.replace(needle, f"image: {pinned_image}")


def _image_ref(sha: str) -> str:
    if not SHA_RE.fullmatch(sha):
        raise SystemExit("staging2 image preflight requires an immutable 40-char lowercase SHA")
    return f"{IMAGE_PREFIX}{sha}"


def _validate_image_payload(sha: str, payload: dict) -> str:
    image = _image_ref(sha)
    status_payload = payload.get("status") or {}
    if not isinstance(status_payload, dict):
        raise SystemExit("staging2 image inspect returned invalid status payload")

    tags = status_payload.get("repoTags") or []
    if image not in tags:
        raise SystemExit(f"staging2 image inspect missing exact immutable tag: {image}")

    digests = [str(value) for value in (status_payload.get("repoDigests") or [])]
    matching_digests = [value for value in digests if IMAGE_DIGEST_RE.fullmatch(value)]
    if not matching_digests:
        raise SystemExit("staging2 image inspect missing canonical sha256 repo digest")

    info = payload.get("info") or {}
    image_spec = info.get("imageSpec") if isinstance(info, dict) else {}
    if not isinstance(image_spec, dict):
        image_spec = {}
    architecture = str(image_spec.get("architecture") or "").lower()
    os_name = str(image_spec.get("os") or "").lower()
    if architecture not in {"arm64", "aarch64"}:
        raise SystemExit(f"staging2 image architecture mismatch: {architecture or 'missing'}")
    if os_name != "linux":
        raise SystemExit(f"staging2 image OS mismatch: {os_name or 'missing'}")

    config = image_spec.get("config") or {}
    config_user = str(
        (config.get("User") if isinstance(config, dict) else "")
        or (config.get("user") if isinstance(config, dict) else "")
        or ""
    )
    uid_payload = status_payload.get("uid")
    uid_value = uid_payload.get("value") if isinstance(uid_payload, dict) else uid_payload
    if str(uid_value or "") != "10001" and config_user not in {"10001", "10001:10001"}:
        raise SystemExit(
            "staging2 image runtime user mismatch: expected numeric uid 10001"
        )

    return matching_digests[0].split("@", 1)[1]


def _preflight_image(sha: str) -> str:
    """Ensure the exact immutable backend image is available, valid and digest-pinned."""
    image = _image_ref(sha)
    source = "cache"
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
    if cached is None or cached.returncode != 0:
        source = "registry"
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

    try:
        inspected = subprocess.run(
            [str(K3S), "crictl", "inspecti", image],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired as exc:
        raise SystemExit(f"staging2 image inspect timed out: sha={sha}") from exc
    if inspected.returncode != 0:
        detail = _clean_diag(inspected.stderr or inspected.stdout or "image inspect failed", 400)
        raise SystemExit(
            f"staging2 image inspect failed rc={inspected.returncode} sha={sha} detail={detail}"
        )
    try:
        payload = json.loads(inspected.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit("staging2 image inspect returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise SystemExit("staging2 image inspect returned non-object JSON")
    digest = _validate_image_payload(sha, payload)
    pinned_image = f"{IMAGE_REPOSITORY}@{digest}"
    if not IMAGE_DIGEST_RE.fullmatch(pinned_image):
        raise SystemExit("staging2 image preflight produced invalid digest reference")
    print(
        "OCI_K3S_STAGING2_IMAGE_READY "
        f"sha={sha} source={source} digest={digest} arch=arm64 uid=10001",
        flush=True,
    )
    return pinned_image


def _apply_text(text: str) -> None:
    _kubectl("apply", "-f", "-", stdin=text, timeout=60)


def _kubectl_reports_not_found(detail: str) -> bool:
    lowered = str(detail or "").lower()
    return "notfound" in lowered or "not found" in lowered


def _namespace_payload() -> dict:
    completed = _kubectl("get", "namespace", NAMESPACE, "-o", "json", check=False, timeout=15)
    if completed.returncode == 0:
        try:
            payload = json.loads(completed.stdout)
        except json.JSONDecodeError as exc:
            raise SystemExit("staging2 namespace probe returned invalid JSON") from exc
        if not isinstance(payload, dict):
            raise SystemExit("staging2 namespace probe returned non-object JSON")
        return payload
    detail = (completed.stderr or completed.stdout or "").strip()
    if _kubectl_reports_not_found(detail):
        return {}
    raise SystemExit(
        "staging2 namespace probe failed "
        f"rc={completed.returncode} detail={_clean_diag(detail, 300)}"
    )


def _namespace_owned(payload: dict) -> bool:
    labels = ((payload.get("metadata") or {}).get("labels") or {}) if payload else {}
    return isinstance(labels, dict) and all(
        str(labels.get(key) or "") == value for key, value in NAMESPACE_LABELS.items()
    )


def _require_namespace_owned(payload: dict) -> None:
    if payload and not _namespace_owned(payload):
        raise SystemExit(
            "refusing to manage foreign staging2 namespace without canonical ownership labels"
        )


def _verify_namespace_contract_if_present() -> None:
    payload = _namespace_payload()
    if payload:
        _require_namespace_owned(payload)


def _ensure_namespace_and_secret(expected_runtime_digest: str) -> None:
    if not SHA256_RE.fullmatch(expected_runtime_digest):
        raise SystemExit("staging2 secret materialization requires runtime sha256")
    if _runtime_env_sha256() != expected_runtime_digest:
        raise SystemExit("staging2 runtime env changed before Secret materialization")
    existing = _namespace_payload()
    if existing:
        _require_namespace_owned(existing)

    namespace_json = _kubectl(
        "create", "namespace", NAMESPACE, "--dry-run=client", "-o", "json"
    ).stdout
    try:
        namespace_payload = json.loads(namespace_json)
    except json.JSONDecodeError as exc:
        raise SystemExit("staging2 namespace dry-run returned invalid JSON") from exc
    metadata = namespace_payload.setdefault("metadata", {})
    labels = metadata.setdefault("labels", {})
    labels.update(NAMESPACE_LABELS)
    _apply_text(json.dumps(namespace_payload, separators=(",", ":")))

    applied = _namespace_payload()
    _require_namespace_owned(applied)
    if not applied:
        raise SystemExit("staging2 namespace disappeared immediately after apply")

    secret_yaml = _kubectl(
        "-n", NAMESPACE, "create", "secret", "generic", SECRET,
        f"--from-env-file={RUNTIME_ENV}", "--dry-run=client", "-o", "yaml",
    ).stdout
    _apply_text(secret_yaml)
    if _runtime_env_sha256() != expected_runtime_digest:
        raise SystemExit("staging2 runtime env changed during Secret materialization")


def _namespace_present() -> bool:
    return bool(_namespace_payload())


def _delete_namespace_and_verify_absent() -> None:
    payload = _namespace_payload()
    if not payload:
        return
    _require_namespace_owned(payload)
    _kubectl(
        "delete", "namespace", NAMESPACE,
        "--ignore-not-found=true", "--wait=true", "--timeout=60s",
        timeout=75,
    )
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if not _namespace_present():
            return
        time.sleep(1)
    raise SystemExit("staging2 namespace still exists after bounded rollback")


def _deployment_payload() -> dict:
    completed = _kubectl(
        "-n", NAMESPACE, "get", "deployment", DEPLOYMENT, "-o", "json",
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        if _kubectl_reports_not_found(detail):
            return {}
        raise SystemExit(
            "staging2 deployment probe failed "
            f"rc={completed.returncode} detail={_clean_diag(detail, 300)}"
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit("staging2 deployment probe returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise SystemExit("staging2 deployment probe returned non-object JSON")
    return payload


def _service_payload() -> dict:
    completed = _kubectl(
        "-n", NAMESPACE, "get", "service", SERVICE, "-o", "json",
        check=False,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout or "").strip()
        if _kubectl_reports_not_found(detail):
            return {}
        raise SystemExit(
            "staging2 service probe failed "
            f"rc={completed.returncode} detail={_clean_diag(detail, 300)}"
        )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as exc:
        raise SystemExit("staging2 service probe returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise SystemExit("staging2 service probe returned non-object JSON")
    return payload


def _service_contract_ok(payload: dict) -> bool:
    if not payload:
        return False
    metadata = payload.get("metadata") or {}
    labels = metadata.get("labels") or {}
    required = {
        "app.kubernetes.io/name": "chess-studio-backend",
        "chess-studio.shadowops/track": "staging2",
    }
    if not all(str(labels.get(key) or "") == value for key, value in required.items()):
        return False

    spec = payload.get("spec") or {}
    if str(spec.get("type") or "") != "ClusterIP":
        return False
    cluster_ip = str(spec.get("clusterIP") or "")
    if not cluster_ip or cluster_ip.lower() == "none":
        return False
    selector = spec.get("selector") or {}
    if not all(str(selector.get(key) or "") == value for key, value in required.items()):
        return False

    ports = spec.get("ports") or []
    if len(ports) != 1 or not isinstance(ports[0], dict):
        return False
    port = ports[0]
    return (
        str(port.get("name") or "") == "http"
        and int(port.get("port") or 0) == 4000
        and str(port.get("targetPort") or "") == "http"
        and str(port.get("protocol") or "TCP") == "TCP"
    )


def _require_service_contract(payload: dict) -> None:
    if not _service_contract_ok(payload):
        raise SystemExit("staging2 live Service contract drifted")


def _release_from_payload(payload: dict) -> str:
    annotations = (((payload.get("spec") or {}).get("template") or {}).get("metadata") or {}).get("annotations") or {}
    value = str(annotations.get("chess-studio.shadowops/release") or "")
    return value if SHA_RE.fullmatch(value) else ""


def _runtime_digest_from_payload(payload: dict) -> str:
    annotations = (((payload.get("spec") or {}).get("template") or {}).get("metadata") or {}).get("annotations") or {}
    value = str(annotations.get("chess-studio.shadowops/runtime-sha256") or "")
    return value if SHA256_RE.fullmatch(value) else ""


def _deployment_rollout_state(payload: dict) -> tuple[int, int, int, int, int, int]:
    metadata = payload.get("metadata") or {}
    spec = payload.get("spec") or {}
    status_payload = payload.get("status") or {}
    return (
        int(spec.get("replicas") or 0),
        int(status_payload.get("updatedReplicas") or 0),
        int(status_payload.get("readyReplicas") or 0),
        int(status_payload.get("availableReplicas") or 0),
        int(metadata.get("generation") or 0),
        int(status_payload.get("observedGeneration") or 0),
    )


def _deployment_contract_ok(payload: dict) -> bool:
    spec = payload.get("spec") or {}
    if int(spec.get("replicas") or 0) != 1:
        return False
    if str((spec.get("strategy") or {}).get("type") or "") != "Recreate":
        return False

    selector = (spec.get("selector") or {}).get("matchLabels") or {}
    required_selector = {
        "app.kubernetes.io/name": "chess-studio-backend",
        "chess-studio.shadowops/track": "staging2",
    }
    if not all(str(selector.get(key) or "") == value for key, value in required_selector.items()):
        return False

    template = spec.get("template") or {}
    template_meta = template.get("metadata") or {}
    labels = template_meta.get("labels") or {}
    if not all(str(labels.get(key) or "") == value for key, value in required_selector.items()):
        return False

    pod_spec = template.get("spec") or {}
    if pod_spec.get("automountServiceAccountToken") is not False:
        return False
    seccomp = (pod_spec.get("securityContext") or {}).get("seccompProfile") or {}
    if str(seccomp.get("type") or "") != "RuntimeDefault":
        return False

    containers = pod_spec.get("containers") or []
    if len(containers) != 1 or not isinstance(containers[0], dict):
        return False
    container = containers[0]
    if str(container.get("name") or "") != "backend":
        return False

    security = container.get("securityContext") or {}
    if security.get("allowPrivilegeEscalation") is not False:
        return False
    if security.get("runAsNonRoot") is not True:
        return False
    if int(security.get("runAsUser") or 0) != 10001:
        return False
    if int(security.get("runAsGroup") or 0) != 10001:
        return False
    dropped = ((security.get("capabilities") or {}).get("drop") or [])
    if "ALL" not in dropped:
        return False

    resources = container.get("resources") or {}
    requests = resources.get("requests") or {}
    limits = resources.get("limits") or {}
    if str(requests.get("cpu") or "") != "100m" or str(requests.get("memory") or "") != "256Mi":
        return False
    if str(limits.get("cpu") or "") != "600m" or str(limits.get("memory") or "") != "768Mi":
        return False

    ports = container.get("ports") or []
    http_ports = [
        port for port in ports
        if isinstance(port, dict)
        and port.get("name") == "http"
        and int(port.get("containerPort") or 0) == 4000
        and str(port.get("protocol") or "TCP") == "TCP"
    ]
    return len(http_ports) == 1


def _require_deployment_contract(payload: dict) -> None:
    if not _deployment_contract_ok(payload):
        raise SystemExit("staging2 live Deployment contract drifted")


def _image_from_payload(payload: dict) -> str:
    containers = (
        ((((payload.get("spec") or {}).get("template") or {}).get("spec") or {}).get("containers"))
        or []
    )
    for container in containers:
        if isinstance(container, dict) and container.get("name") == "backend":
            return str(container.get("image") or "")
    return ""


def _pinned_digest_from_image_ref(image_ref: str) -> str:
    if not IMAGE_DIGEST_RE.fullmatch(str(image_ref or "")):
        return ""
    return str(image_ref).split("@", 1)[1]


def _clean_diag(value: object, limit: int = 260) -> str:
    text = str(value or "").replace("\\r", " ").replace("\\n", " ").strip()
    return text[:limit]


def _failure_diagnostics() -> None:
    """Emit bounded workload state without pod logs or Secret contents."""
    print("OCI_K3S_STAGING2_DIAG_BEGIN", file=sys.stderr, flush=True)
    deployment = _deployment_payload()
    if deployment:
        status_payload = deployment.get("status") or {}
        desired, updated, ready, available, generation, observed_generation = (
            _deployment_rollout_state(deployment)
        )
        print(
            "OCI_K3S_STAGING2_DIAG_DEPLOYMENT "
            f"replicas={int(status_payload.get('replicas') or 0)} "
            f"desired={desired} updated={updated} ready={ready} available={available} "
            f"generation={generation} observed_generation={observed_generation} "
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

    service = _service_payload()
    if service:
        spec = service.get("spec") or {}
        ports = spec.get("ports") or []
        port = ports[0] if ports and isinstance(ports[0], dict) else {}
        print(
            "OCI_K3S_STAGING2_DIAG_SERVICE "
            f"type={_clean_diag(spec.get('type'), 32)} "
            f"cluster_ip_present={bool(spec.get('clusterIP'))} "
            f"selector_ok={_service_contract_ok(service)} "
            f"port={int(port.get('port') or 0)} "
            f"target={_clean_diag(port.get('targetPort'), 32)}",
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


def _state_marker() -> str:
    if not STATE.exists() and not STATE.is_symlink():
        return "absent"
    _regular(STATE, "staging2 deployed state")
    stat = STATE.stat()
    if stat.st_uid != 0 or (stat.st_mode & 0o022):
        raise SystemExit("staging2 deployed state must remain root-owned and non-writable by group/world")
    value = STATE.read_text(encoding="utf-8").strip()
    return value if SHA_RE.fullmatch(value) else "invalid"


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


def _restore(previous_sha: str, previous_image_ref: str = "") -> None:
    if previous_sha:
        runtime_digest = _runtime_env_sha256()
        if _pinned_digest_from_image_ref(previous_image_ref):
            previous_image = previous_image_ref
            image_source = "deployment"
        else:
            previous_image = _preflight_image(previous_sha)
            image_source = "registry"
        _ensure_namespace_and_secret(runtime_digest)
        _apply_text(_render(previous_sha, previous_image, runtime_digest))
        _rollout_wait()
        _require_deployment_contract(_deployment_payload())
        _require_service_contract(_service_payload())
        _attest(previous_sha)
        _write_state(previous_sha)
        print(
            "OCI_K3S_STAGING2_RESTORED "
            f"sha={previous_sha} image_source={image_source}",
            flush=True,
        )
        return
    _delete_namespace_and_verify_absent()
    try:
        STATE.unlink()
    except FileNotFoundError:
        pass
    print("OCI_K3S_STAGING2_RESTORED absent=true", flush=True)


def deploy(sha: str) -> None:
    _verify_host_contract()
    _verify_namespace_contract_if_present()
    pre_mem, pre_disk, pre_load = _resource_gate(MIN_PRE_MEM, MIN_PRE_DISK, "pre-deploy")
    previous_payload = _deployment_payload()
    previous_sha = _release_from_payload(previous_payload)
    previous_image_ref = _image_from_payload(previous_payload) if previous_sha else ""
    pinned_image = _preflight_image(sha)
    runtime_digest = _runtime_env_sha256()
    try:
        _ensure_namespace_and_secret(runtime_digest)
        _apply_text(_render(sha, pinned_image, runtime_digest))
        _rollout_wait()
        _require_deployment_contract(_deployment_payload())
        _require_service_contract(_service_payload())
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
            _restore(previous_sha, previous_image_ref)
        except BaseException as rollback_exc:
            print(f"OCI_K3S_STAGING2_ROLLBACK_FAILED detail={rollback_exc}", file=sys.stderr)
        raise
    print(
        "OCI_K3S_STAGING2_DEPLOY_OK "
        f"sha={sha} previous={previous_sha or 'none'} "
        f"loopback_port={LOCAL_PORT} service=ClusterIP "
        f"pre_mem_mib={pre_mem // 1024**2} post_mem_mib={post_mem // 1024**2} "
        f"pre_disk_mib={pre_disk // 1024**2} post_disk_mib={post_disk // 1024**2} "
        f"pre_load1={pre_load:.2f} post_load1={post_load:.2f} "
        f"capability_sha256={_capability_sha256()}"
    )


def _status_needs_diagnostics(
    desired: int,
    updated: int,
    ready: int,
    available: int,
    generation: int,
    observed_generation: int,
    sha: str,
    state_sha: str,
    image_ref: str,
    runtime_digest: str,
    expected_runtime_digest: str,
) -> bool:
    return (
        desired < 1
        or updated != desired
        or ready != desired
        or available != desired
        or generation < 1
        or observed_generation != generation
        or not SHA_RE.fullmatch(sha)
        or state_sha != sha
        or not _pinned_digest_from_image_ref(image_ref)
        or not SHA256_RE.fullmatch(runtime_digest)
        or runtime_digest != expected_runtime_digest
    )


def status() -> None:
    _verify_host_contract()
    _verify_namespace_contract_if_present()
    payload = _deployment_payload()
    state_sha = _state_marker()
    mem, disk, load1 = _resources()
    if not payload:
        if state_sha != "absent":
            print(
                "OCI_K3S_STAGING2_STATUS_DEGRADED present=false "
                f"state_sha={state_sha} "
                f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f} "
                f"capability_sha256={_capability_sha256()}"
            )
            _failure_diagnostics()
            raise SystemExit("staging2 status degraded: stale state marker without Deployment")
        print(
            "OCI_K3S_STAGING2_STATUS_OK present=false "
            f"state_sha={state_sha} "
            f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f} "
            f"capability_sha256={_capability_sha256()}"
        )
        return
    spec = payload.get("spec") or {}
    stat = payload.get("status") or {}
    sha = _release_from_payload(payload) or "unknown"
    image_ref = _image_from_payload(payload)
    image_digest = _pinned_digest_from_image_ref(image_ref) or "unpinned"
    runtime_digest = _runtime_digest_from_payload(payload)
    expected_runtime_digest = _runtime_env_sha256()
    runtime_contract = "match" if runtime_digest == expected_runtime_digest else "drift"
    deployment_contract_ok = _deployment_contract_ok(payload)
    deployment_contract = "match" if deployment_contract_ok else "drift"
    service_payload = _service_payload()
    service_contract_ok = _service_contract_ok(service_payload)
    service_contract = "match" if service_contract_ok else "drift"
    desired, updated, ready, available, generation, observed_generation = (
        _deployment_rollout_state(payload)
    )
    if (not deployment_contract_ok) or (not service_contract_ok) or _status_needs_diagnostics(
        desired,
        updated,
        ready,
        available,
        generation,
        observed_generation,
        sha,
        state_sha,
        image_ref,
        runtime_digest,
        expected_runtime_digest,
    ):
        print(
            "OCI_K3S_STAGING2_STATUS_DEGRADED present=true runtime=degraded "
            f"sha={sha} state_sha={state_sha} image_digest={image_digest} "
            f"runtime_contract={runtime_contract} deployment_contract={deployment_contract} "
            f"service_contract={service_contract} "
            f"desired={desired} updated={updated} ready={ready} available={available} "
            f"generation={generation} observed_generation={observed_generation} "
            f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f} "
            f"capability_sha256={_capability_sha256()}"
        )
        _failure_diagnostics()
        raise SystemExit("staging2 status degraded: workload contract mismatch")

    try:
        _attest(sha)
    except BaseException as exc:
        print(
            "OCI_K3S_STAGING2_STATUS_RUNTIME_FAILED "
            f"sha={sha} detail={_clean_diag(exc, 400)}",
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
        raise

    print(
        "OCI_K3S_STAGING2_STATUS_OK present=true runtime=attested "
        f"sha={sha} state_sha={state_sha} image_digest={image_digest} "
        f"runtime_contract={runtime_contract} deployment_contract={deployment_contract} "
        f"service_contract={service_contract} "
        f"desired={desired} updated={updated} ready={ready} available={available} "
        f"generation={generation} observed_generation={observed_generation} "
        f"mem_available_mib={mem // 1024**2} disk_free_mib={disk // 1024**2} load1={load1:.2f} "
        f"capability_sha256={_capability_sha256()}"
    )


def rollback() -> None:
    _verify_host_contract()
    _delete_namespace_and_verify_absent()
    try:
        STATE.unlink()
    except FileNotFoundError:
        pass
    print(
        "OCI_K3S_STAGING2_ROLLBACK_OK present=false compose_untouched=true "
        f"capability_sha256={_capability_sha256()}"
    )


def self_test(template_path: Path) -> None:
    _regular(template_path, "staging2 self-test template")
    data = template_path.read_text(encoding="utf-8")
    assert hashlib.sha256(data.encode("utf-8")).hexdigest() == TEMPLATE_SHA256
    assert data.count("__SHA__") == 3
    for key, value in NAMESPACE_LABELS.items():
        assert f"{key}: {value}" in data
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
    assert re.fullmatch(r"[0-9a-f]{64}", _capability_sha256())
    sample_sha = "0" * 40
    sample_image = _image_ref(sample_sha)
    assert sample_image == f"{IMAGE_PREFIX}{sample_sha}"
    try:
        _image_ref("main")
    except SystemExit:
        pass
    else:
        raise AssertionError("mutable staging2 image ref must fail closed")

    repository = IMAGE_REPOSITORY
    sample_digest_ref = f"{repository}@sha256:{'a' * 64}"
    sample_payload = {
        "status": {
            "repoTags": [sample_image],
            "repoDigests": [sample_digest_ref],
            "uid": {"value": 10001},
            "username": "",
        },
        "info": {
            "imageSpec": {
                "architecture": "arm64",
                "os": "linux",
                "config": {"User": "10001:10001"},
            }
        },
    }
    assert _validate_image_payload(sample_sha, sample_payload) == f"sha256:{'a' * 64}"
    sample_runtime_digest = "b" * 64
    rendered = _render(
        sample_sha, sample_digest_ref, sample_runtime_digest, template_path
    )
    assert f"image: {sample_digest_ref}" in rendered
    assert f'chess-studio.shadowops/runtime-sha256: "{sample_runtime_digest}"' in rendered
    assert f"image: {sample_image}" not in rendered
    assert _pinned_digest_from_image_ref(sample_digest_ref) == f"sha256:{'a' * 64}"
    assert not _pinned_digest_from_image_ref(sample_image)
    try:
        _render(sample_sha, sample_image, sample_runtime_digest, template_path)
    except SystemExit:
        pass
    else:
        raise AssertionError("tagged image must not satisfy digest-pinned render")
    try:
        _render(sample_sha, sample_digest_ref, "short", template_path)
    except SystemExit:
        pass
    else:
        raise AssertionError("invalid runtime digest must fail closed")
    runtime_payload = {
        "spec": {
            "template": {
                "metadata": {
                    "annotations": {
                        "chess-studio.shadowops/runtime-sha256": sample_runtime_digest
                    }
                }
            }
        }
    }
    assert _runtime_digest_from_payload(runtime_payload) == sample_runtime_digest
    assert not _runtime_digest_from_payload({})
    owned_namespace = {"metadata": {"labels": dict(NAMESPACE_LABELS)}}
    foreign_namespace = {
        "metadata": {
            "labels": {
                "app.kubernetes.io/part-of": "something-else",
                "chess-studio.shadowops/track": "staging2",
            }
        }
    }
    assert _namespace_owned(owned_namespace)
    assert not _namespace_owned(foreign_namespace)
    assert not _namespace_owned({})
    assert _kubectl_reports_not_found('Error from server (NotFound): deployments.apps "backend" not found')
    assert _kubectl_reports_not_found('resource not found')
    assert not _kubectl_reports_not_found('connection refused')
    for mutation in ("tag", "digest", "arch", "user"):
        bad = json.loads(json.dumps(sample_payload))
        if mutation == "tag":
            bad["status"]["repoTags"] = ["ghcr.io/example/wrong:tag"]
        elif mutation == "digest":
            bad["status"]["repoDigests"] = []
        elif mutation == "arch":
            bad["info"]["imageSpec"]["architecture"] = "amd64"
        else:
            bad["status"]["uid"] = {"value": 0}
            bad["info"]["imageSpec"]["config"]["User"] = "0"
        try:
            _validate_image_payload(sample_sha, bad)
        except SystemExit:
            pass
        else:
            raise AssertionError(f"invalid staging2 image contract accepted: {mutation}")
    rollout_payload = {
        "metadata": {"generation": 7},
        "spec": {"replicas": 1},
        "status": {
            "updatedReplicas": 1,
            "readyReplicas": 1,
            "availableReplicas": 1,
            "observedGeneration": 7,
        },
    }
    assert _deployment_rollout_state(rollout_payload) == (1, 1, 1, 1, 7, 7)

    deployment_contract_payload = {
        "spec": {
            "replicas": 1,
            "strategy": {"type": "Recreate"},
            "selector": {
                "matchLabels": {
                    "app.kubernetes.io/name": "chess-studio-backend",
                    "chess-studio.shadowops/track": "staging2",
                }
            },
            "template": {
                "metadata": {
                    "labels": {
                        "app.kubernetes.io/name": "chess-studio-backend",
                        "chess-studio.shadowops/track": "staging2",
                    }
                },
                "spec": {
                    "automountServiceAccountToken": False,
                    "securityContext": {"seccompProfile": {"type": "RuntimeDefault"}},
                    "containers": [
                        {
                            "name": "backend",
                            "securityContext": {
                                "allowPrivilegeEscalation": False,
                                "runAsNonRoot": True,
                                "runAsUser": 10001,
                                "runAsGroup": 10001,
                                "capabilities": {"drop": ["ALL"]},
                            },
                            "resources": {
                                "requests": {"cpu": "100m", "memory": "256Mi"},
                                "limits": {"cpu": "600m", "memory": "768Mi"},
                            },
                            "ports": [
                                {
                                    "name": "http",
                                    "containerPort": 4000,
                                    "protocol": "TCP",
                                }
                            ],
                        }
                    ],
                },
            },
        }
    }
    assert _deployment_contract_ok(deployment_contract_payload)
    for mutate in ("replicas", "strategy", "uid", "privilege", "memory", "token"):
        bad_contract = json.loads(json.dumps(deployment_contract_payload))
        if mutate == "replicas":
            bad_contract["spec"]["replicas"] = 2
        elif mutate == "strategy":
            bad_contract["spec"]["strategy"]["type"] = "RollingUpdate"
        elif mutate == "uid":
            bad_contract["spec"]["template"]["spec"]["containers"][0]["securityContext"]["runAsUser"] = 0
        elif mutate == "privilege":
            bad_contract["spec"]["template"]["spec"]["containers"][0]["securityContext"]["allowPrivilegeEscalation"] = True
        elif mutate == "memory":
            bad_contract["spec"]["template"]["spec"]["containers"][0]["resources"]["limits"]["memory"] = "2Gi"
        else:
            bad_contract["spec"]["template"]["spec"]["automountServiceAccountToken"] = True
        assert not _deployment_contract_ok(bad_contract), mutate

    service_contract_payload = {
        "metadata": {
            "labels": {
                "app.kubernetes.io/name": "chess-studio-backend",
                "chess-studio.shadowops/track": "staging2",
            }
        },
        "spec": {
            "type": "ClusterIP",
            "clusterIP": "10.43.0.77",
            "selector": {
                "app.kubernetes.io/name": "chess-studio-backend",
                "chess-studio.shadowops/track": "staging2",
            },
            "ports": [
                {
                    "name": "http",
                    "port": 4000,
                    "targetPort": "http",
                    "protocol": "TCP",
                }
            ],
        },
    }
    assert _service_contract_ok(service_contract_payload)
    for mutate in ("type", "selector", "port", "target", "headless", "label"):
        bad_service = json.loads(json.dumps(service_contract_payload))
        if mutate == "type":
            bad_service["spec"]["type"] = "NodePort"
        elif mutate == "selector":
            bad_service["spec"]["selector"]["chess-studio.shadowops/track"] = "other"
        elif mutate == "port":
            bad_service["spec"]["ports"][0]["port"] = 80
        elif mutate == "target":
            bad_service["spec"]["ports"][0]["targetPort"] = "wrong"
        elif mutate == "headless":
            bad_service["spec"]["clusterIP"] = "None"
        else:
            bad_service["metadata"]["labels"]["app.kubernetes.io/name"] = "other"
        assert not _service_contract_ok(bad_service), mutate
    assert not _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, sample_sha, sample_digest_ref,
        sample_runtime_digest, sample_runtime_digest
    )
    for bad_rollout in (
        (1, 0, 1, 1, 7, 7),
        (1, 1, 0, 1, 7, 7),
        (1, 1, 1, 0, 7, 7),
        (1, 1, 1, 1, 7, 6),
        (1, 1, 1, 1, 0, 0),
        (0, 0, 0, 0, 7, 7),
    ):
        assert _status_needs_diagnostics(
            *bad_rollout, sample_sha, sample_sha, sample_digest_ref,
            sample_runtime_digest, sample_runtime_digest
        )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, "unknown", sample_sha, sample_digest_ref, sample_runtime_digest, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, "absent", sample_digest_ref, sample_runtime_digest, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, "invalid", sample_digest_ref, sample_runtime_digest, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, "1" * 40, sample_digest_ref, sample_runtime_digest, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, sample_sha, sample_image, sample_runtime_digest, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, sample_sha, sample_digest_ref,
        "c" * 64, sample_runtime_digest
    )
    assert _status_needs_diagnostics(
        1, 1, 1, 1, 7, 7, sample_sha, sample_sha, sample_digest_ref,
        "", sample_runtime_digest
    )
    source = Path(__file__).read_text(encoding="utf-8")
    assert "OCI_K3S_STAGING2_DIAG_BEGIN" in source
    assert "OCI_K3S_STAGING2_DIAG_CONTAINER" in source
    assert "OCI_K3S_STAGING2_DIAG_EVENT" in source
    assert '"crictl", "inspecti"' in source
    assert '"crictl", "pull"' in source
    assert "OCI_K3S_STAGING2_IMAGE_READY" in source
    assert "staging2 image inspect missing canonical sha256 repo digest" in source
    assert "staging2 rendered image must be a canonical sha256 digest reference" in source
    assert "image_digest=" in source
    assert "observed_generation=" in source
    assert "_deployment_rollout_state" in source
    assert '"--ignore-not-found=true"' in source
    assert "staging2 namespace still exists after bounded rollback" in source
    assert "refusing to manage foreign staging2 namespace" in source
    assert "staging2 deployment probe failed" in source
    assert "staging2 deployment probe returned invalid JSON" in source
    assert "_verify_namespace_contract_if_present()" in source
    assert "state_sha=" in source
    assert "staging2 deployed state must remain root-owned" in source
    assert "OCI_K3S_STAGING2_STATUS_RUNTIME_FAILED" in source
    assert "runtime=attested" in source
    assert "OCI_K3S_STAGING2_STATUS_DEGRADED" in source
    assert "staging2 status degraded: workload contract mismatch" in source
    assert "staging2 status degraded: stale state marker without Deployment" in source
    forbidden_degraded_ok = (
        "OCI_K3S_STAGING2_STATUS_OK present=true " + "runtime=degraded"
    )
    assert forbidden_degraded_ok not in source
    assert "runtime_contract=" in source
    assert "deployment_contract=" in source
    assert "service_contract=" in source
    assert "OCI_K3S_STAGING2_DIAG_SERVICE" in source
    assert "staging2 service probe failed" in source
    assert "staging2 live Service contract drifted" in source
    assert "staging2 live Deployment contract drifted" in source
    assert "chess-studio.shadowops/runtime-sha256" in source
    assert "staging2 runtime env changed during Secret materialization" in source
    assert "capability_sha256=" in source
    status_source = source.split("\ndef status() -> None:", 1)[1].split(
        "\ndef rollback() -> None:", 1
    )[0]
    assert "_attest(sha)" in status_source
    assert status_source.index("_status_needs_diagnostics") < status_source.index("_attest(sha)")
    restore_source = source.split("\ndef _restore(previous_sha: str, previous_image_ref: str = \"\") -> None:", 1)[1].split(
        "\ndef deploy(sha: str) -> None:", 1
    )[0]
    rollback_source = source.split("\ndef rollback() -> None:", 1)[1].split(
        "\ndef self_test", 1
    )[0]
    assert "_delete_namespace_and_verify_absent()" in restore_source
    assert 'image_source = "deployment"' in restore_source
    assert 'image_source = "registry"' in restore_source
    assert "runtime_digest = _runtime_env_sha256()" in restore_source
    assert "_ensure_namespace_and_secret(runtime_digest)" in restore_source
    assert "_require_deployment_contract(_deployment_payload())" in restore_source
    assert "_require_service_contract(_service_payload())" in restore_source
    assert restore_source.index("_pinned_digest_from_image_ref(previous_image_ref)") < restore_source.index(
        "_preflight_image(previous_sha)"
    )
    assert "_delete_namespace_and_verify_absent()" in rollback_source
    assert "check=False" not in rollback_source
    deploy_source = source.split("\ndef deploy(sha: str) -> None:", 1)[1].split(
        "\ndef _status_needs_diagnostics", 1
    )[0]
    assert deploy_source.index("previous_payload = _deployment_payload()") < deploy_source.index(
        "_preflight_image(sha)"
    )
    assert "previous_image_ref = _image_from_payload(previous_payload)" in deploy_source
    assert "runtime_digest = _runtime_env_sha256()" in deploy_source
    assert "_ensure_namespace_and_secret(runtime_digest)" in deploy_source
    assert "_render(sha, pinned_image, runtime_digest)" in deploy_source
    assert "_require_deployment_contract(_deployment_payload())" in deploy_source
    assert "_require_service_contract(_service_payload())" in deploy_source
    assert "_restore(previous_sha, previous_image_ref)" in deploy_source
    assert deploy_source.index("_preflight_image(sha)") < deploy_source.index(
        "_ensure_namespace_and_secret(runtime_digest)"
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
