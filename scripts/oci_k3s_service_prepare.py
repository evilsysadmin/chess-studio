#!/usr/bin/env python3
"""Prepare the pinned single-node K3s service without arming or starting it.

The normal root deployment path may run this repeatedly. Before the explicit
K3s-start phase it installs byte-exact config/unit files and proves the service
is disabled + inactive. After a later start phase has armed or enabled K3s, it
becomes verification-only so ordinary Chess Studio deploys cannot silently
rewrite, disable, or stop the cluster.
"""
from __future__ import annotations

import hashlib
import os
import subprocess
import sys
import tempfile
from pathlib import Path

K3S_VERSION = "v1.36.4+k3s1"
BUNDLE_SHA256 = "db0972ea4c9439e238e777f26d579ae29865f22f05f70c9a01989cc772611256"
K3S_BINARY_SHA256 = "c920706346d5ad4e5cd3c7bf1bb09ce71ebe07fec829e513e40f1caf98aed8bb"
K3S_IMAGES_SHA256 = "9d3c4c2197bcf857ca17633aa393bad683cc982ddd408620f93036a3cca953b5"

ASSET_MARKER = Path("/var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY")
START_APPROVAL = Path("/var/lib/chess-studio/K3S_START_APPROVED")
K3S_BINARY = Path("/usr/local/bin/k3s")
K3S_IMAGES = Path("/var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst")
CONFIG_TARGET = Path("/etc/rancher/k3s/config.yaml")
UNIT_TARGET = Path("/etc/systemd/system/k3s.service")


def _repo() -> Path:
    return Path(os.environ.get("CHESS_STUDIO_REPO", "/opt/chess-studio/repo"))


def _sources() -> tuple[Path, Path]:
    root = _repo()
    return root / "infra/oci/k3s/config.yaml", root / "infra/oci/k3s/k3s.service"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require_regular(path: Path, label: str) -> None:
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f"{label} must be a regular non-symlink file: {path}")


def _verify_assets() -> None:
    _require_regular(ASSET_MARKER, "K3s asset marker")
    marker = ASSET_MARKER.read_text(encoding="utf-8").strip()
    expected = f"K3S_AIRGAP_ASSETS_READY version={K3S_VERSION} bundle_sha256={BUNDLE_SHA256}"
    if marker != expected:
        raise SystemExit("K3s asset marker does not match the pinned service contract")
    _require_regular(K3S_BINARY, "K3s binary")
    _require_regular(K3S_IMAGES, "K3s air-gap images")
    if _sha256(K3S_BINARY) != K3S_BINARY_SHA256:
        raise SystemExit("K3s binary digest does not match the pinned service contract")
    if _sha256(K3S_IMAGES) != K3S_IMAGES_SHA256:
        raise SystemExit("K3s air-gap image digest does not match the pinned service contract")


def _systemctl_state(args: list[str]) -> tuple[int, str]:
    completed = subprocess.run(
        ["systemctl", *args],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return completed.returncode, completed.stdout.strip()


def _active() -> bool:
    return _systemctl_state(["is-active", "--quiet", "k3s.service"])[0] == 0


def _enabled_state() -> str:
    _, output = _systemctl_state(["is-enabled", "k3s.service"])
    return output or "not-found"


def _assert_source(path: Path, label: str) -> bytes:
    _require_regular(path, label)
    data = path.read_bytes()
    if not data or b"\x00" in data:
        raise SystemExit(f"invalid {label}")
    return data


def _assert_target_exact(target: Path, expected: bytes, label: str) -> None:
    _require_regular(target, label)
    if target.read_bytes() != expected:
        raise SystemExit(f"armed/active K3s {label} differs from repository contract")


def _refuse_unexpected_target(target: Path, expected: bytes, label: str) -> None:
    if not target.exists() and not target.is_symlink():
        return
    _require_regular(target, label)
    if target.read_bytes() != expected:
        raise SystemExit(f"refusing to overwrite unexpected existing K3s {label}")


def _atomic_write(target: Path, data: bytes, mode: int) -> None:
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(fd, "wb", closefd=True) as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(tmp_name, mode)
        os.chown(tmp_name, 0, 0)
        os.replace(tmp_name, target)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def _verify_contract_text(config: bytes, unit: bytes) -> None:
    config_text = config.decode("utf-8")
    unit_text = unit.decode("utf-8")
    for required in ('write-kubeconfig-mode: "0600"', "  - traefik", "  - servicelb"):
        if required not in config_text:
            raise SystemExit(f"K3s config missing required contract: {required}")
    for required in (
        "Type=notify",
        "ExecStartPre=/usr/bin/test -f /var/lib/chess-studio/K3S_START_APPROVED",
        "ExecStart=/usr/local/bin/k3s server",
        "KillMode=process",
        "Delegate=yes",
        "Restart=always",
        "WantedBy=multi-user.target",
    ):
        if required not in unit_text:
            raise SystemExit(f"K3s unit missing required contract: {required}")
    for forbidden in ("cluster-init", "systemctl start", "systemctl enable"):
        if forbidden in unit_text:
            raise SystemExit(f"K3s unit contains forbidden bootstrap behavior: {forbidden}")


def prepare() -> None:
    if os.geteuid() != 0:
        raise SystemExit("K3s service preparation requires root")
    if not Path("/run/systemd/system").is_dir():
        raise SystemExit("K3s service preparation requires systemd")
    _verify_assets()
    config_source, unit_source = _sources()
    config = _assert_source(config_source, "K3s config source")
    unit = _assert_source(unit_source, "K3s unit source")
    _verify_contract_text(config, unit)

    active = _active()
    enabled = _enabled_state()
    approved = START_APPROVAL.exists() or START_APPROVAL.is_symlink()
    armed = active or approved or enabled in {"enabled", "enabled-runtime", "linked", "linked-runtime"}

    if armed:
        if approved:
            _require_regular(START_APPROVAL, "K3s start approval marker")
        elif active or enabled.startswith("enabled") or enabled.startswith("linked"):
            raise SystemExit("K3s is active/enabled without the explicit start approval marker")
        _assert_target_exact(CONFIG_TARGET, config, "config")
        _assert_target_exact(UNIT_TARGET, unit, "unit")
        print(
            f"OCI_K3S_SERVICE_ARMED_UNCHANGED version={K3S_VERSION} "
            f"active={'true' if active else 'false'} enabled={enabled}"
        )
        return

    _refuse_unexpected_target(CONFIG_TARGET, config, "config")
    _refuse_unexpected_target(UNIT_TARGET, unit, "unit")
    _atomic_write(CONFIG_TARGET, config, 0o600)
    _atomic_write(UNIT_TARGET, unit, 0o644)
    subprocess.run(["systemctl", "daemon-reload"], check=True)

    if _active():
        raise SystemExit("K3s became active during inert service preparation")
    enabled_after = _enabled_state()
    if enabled_after not in {"disabled", "not-found"}:
        raise SystemExit(f"K3s service must remain disabled after preparation: {enabled_after}")
    if START_APPROVAL.exists() or START_APPROVAL.is_symlink():
        raise SystemExit("K3s start approval marker must not exist during service preparation")
    wants = Path("/etc/systemd/system/multi-user.target.wants/k3s.service")
    if wants.exists() or wants.is_symlink():
        raise SystemExit("K3s service unexpectedly has a multi-user enablement link")
    print(
        f"OCI_K3S_SERVICE_PREPARED version={K3S_VERSION} active=false "
        f"enabled={enabled_after} traefik=disabled servicelb=disabled"
    )


def self_test() -> None:
    config_source, unit_source = _sources()
    config = _assert_source(config_source, "K3s config source")
    unit = _assert_source(unit_source, "K3s unit source")
    _verify_contract_text(config, unit)
    assert START_APPROVAL == Path("/var/lib/chess-studio/K3S_START_APPROVED")
    assert CONFIG_TARGET == Path("/etc/rancher/k3s/config.yaml")
    assert UNIT_TARGET == Path("/etc/systemd/system/k3s.service")
    source = Path(__file__).read_text(encoding="utf-8")
    assert '["systemctl", "daemon-reload"]' in source
    assert '["systemctl", "start"' not in source
    assert '["systemctl", "enable"' not in source
    print("OCI K3s inert service prepare self-test: OK")


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "self-test":
        self_test()
        return
    if len(sys.argv) != 1:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} [self-test]")
    prepare()


if __name__ == "__main__":
    main()
