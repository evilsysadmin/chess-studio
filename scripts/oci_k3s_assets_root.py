#!/usr/bin/env python3
"""Install the pinned K3s air-gap assets without starting Kubernetes.

This script is copied to a root-owned host path and exposed to `ocarun` through
one exact sudoers command. It accepts only the fixed /tmp staging path, pins the
outer bundle digest/size, revalidates embedded component digests, and never
creates or starts a K3s service.
"""
from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
import tarfile
import tempfile
from pathlib import Path, PurePosixPath

BUNDLE_PATH = Path("/tmp/chess-studio-k3s-bundle.tar.gz")
EXPECTED_BUNDLE_SHA256 = "db0972ea4c9439e238e777f26d579ae29865f22f05f70c9a01989cc772611256"
EXPECTED_BUNDLE_SIZE = 240779539
EXPECTED_VERSION = "v1.36.4+k3s1"
EXPECTED_COMPONENTS = {
    "bin/k3s": (71368866, "c920706346d5ad4e5cd3c7bf1bb09ce71ebe07fec829e513e40f1caf98aed8bb"),
    "images/k3s-airgap-images-arm64.tar.zst": (175402374, "9d3c4c2197bcf857ca17633aa393bad683cc982ddd408620f93036a3cca953b5"),
}
EXPECTED_FILES = {
    "bin/k3s",
    "images/k3s-airgap-images-arm64.tar.zst",
    "bootstrap/install-k3s-airgap.sh",
    "manifest.json",
}
K3S_BINARY = Path("/usr/local/bin/k3s")
K3S_IMAGES = Path("/var/lib/rancher/k3s/agent/images/k3s-airgap-images-arm64.tar.zst")
MARKER = Path("/var/lib/chess-studio/K3S_AIRGAP_ASSETS_READY")


def _sha256_fd(fd: int) -> str:
    digest = hashlib.sha256()
    os.lseek(fd, 0, os.SEEK_SET)
    while True:
        chunk = os.read(fd, 1024 * 1024)
        if not chunk:
            break
        digest.update(chunk)
    os.lseek(fd, 0, os.SEEK_SET)
    return digest.hexdigest()


def _safe_member_name(name: str) -> bool:
    path = PurePosixPath(name)
    return bool(name) and not path.is_absolute() and ".." not in path.parts


def _validate_archive(archive: tarfile.TarFile) -> dict[str, object]:
    members = archive.getmembers()
    for member in members:
        if not _safe_member_name(member.name):
            raise SystemExit(f"unsafe K3s archive member: {member.name!r}")
        if not (member.isfile() or member.isdir()):
            raise SystemExit(f"unsupported K3s archive member type: {member.name!r}")
    files = {member.name: member for member in members if member.isfile()}
    if set(files) != EXPECTED_FILES:
        raise SystemExit(f"unexpected K3s bundle layout: {sorted(files)}")

    manifest_stream = archive.extractfile(files["manifest.json"])
    if manifest_stream is None:
        raise SystemExit("embedded K3s manifest missing")
    manifest = json.load(manifest_stream)
    if manifest.get("schema") != 1 or manifest.get("architecture") != "arm64":
        raise SystemExit("invalid embedded K3s manifest contract")
    if manifest.get("k3s_version") != EXPECTED_VERSION:
        raise SystemExit("unexpected embedded K3s version")

    declared = {
        str(row.get("path")): (int(row.get("size", 0)), str(row.get("sha256", "")))
        for row in manifest.get("components", [])
        if isinstance(row, dict)
    }
    for name, expected in EXPECTED_COMPONENTS.items():
        if declared.get(name) != expected:
            raise SystemExit(f"embedded K3s component contract mismatch: {name}")
    return manifest


def _copy_member(archive: tarfile.TarFile, member: tarfile.TarInfo, target: Path, mode: int) -> None:
    expected_size, expected_sha = EXPECTED_COMPONENTS[member.name]
    stream = archive.extractfile(member)
    if stream is None:
        raise SystemExit(f"could not read K3s bundle member: {member.name}")
    target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    fd, tmp_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    digest = hashlib.sha256()
    total = 0
    try:
        with os.fdopen(fd, "wb", closefd=True) as out:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
                digest.update(chunk)
                total += len(chunk)
            out.flush()
            os.fsync(out.fileno())
        if total != expected_size or digest.hexdigest() != expected_sha:
            raise SystemExit(f"K3s component digest mismatch: {member.name}")
        os.chmod(tmp_name, mode)
        os.chown(tmp_name, 0, 0)
        os.replace(tmp_name, target)
    finally:
        try:
            os.unlink(tmp_name)
        except FileNotFoundError:
            pass


def install_assets(path: Path = BUNDLE_PATH) -> None:
    if os.geteuid() != 0:
        raise SystemExit("K3s asset installer must run as root")
    if path != BUNDLE_PATH:
        raise SystemExit("unexpected K3s bundle staging path")
    try:
        sudo_uid = int(os.environ.get("SUDO_UID", "-1"))
    except ValueError as exc:
        raise SystemExit("invalid SUDO_UID") from exc
    if sudo_uid <= 0:
        raise SystemExit("K3s asset installer requires a non-root sudo caller")

    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != sudo_uid:
            raise SystemExit("K3s staged bundle must be a regular file owned by sudo caller")
        if info.st_size != EXPECTED_BUNDLE_SIZE:
            raise SystemExit("K3s staged bundle size mismatch")
        if _sha256_fd(fd) != EXPECTED_BUNDLE_SHA256:
            raise SystemExit("K3s staged bundle SHA-256 mismatch")

        with os.fdopen(os.dup(fd), "rb") as handle, tarfile.open(fileobj=handle, mode="r:gz") as archive:
            manifest = _validate_archive(archive)
            members = {member.name: member for member in archive.getmembers() if member.isfile()}
            _copy_member(archive, members["bin/k3s"], K3S_BINARY, 0o755)
            _copy_member(
                archive,
                members["images/k3s-airgap-images-arm64.tar.zst"],
                K3S_IMAGES,
                0o644,
            )
    finally:
        os.close(fd)

    MARKER.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    marker = (
        f"K3S_AIRGAP_ASSETS_READY version={manifest['k3s_version']} "
        f"bundle_sha256={EXPECTED_BUNDLE_SHA256}\n"
    )
    tmp = MARKER.with_name(f".{MARKER.name}.tmp")
    tmp.write_text(marker, encoding="utf-8")
    os.chmod(tmp, 0o644)
    os.chown(tmp, 0, 0)
    os.replace(tmp, MARKER)
    print(marker.strip())


def self_test() -> None:
    assert BUNDLE_PATH == Path("/tmp/chess-studio-k3s-bundle.tar.gz")
    assert len(EXPECTED_BUNDLE_SHA256) == 64
    assert EXPECTED_BUNDLE_SIZE < 300 * 1024 * 1024
    assert EXPECTED_VERSION.startswith("v1.36.4+")
    assert set(EXPECTED_COMPONENTS) <= EXPECTED_FILES
    assert _safe_member_name("bin/k3s")
    assert not _safe_member_name("../k3s")
    assert not _safe_member_name("/bin/k3s")
    print("OCI K3s root asset capability self-test: OK")


def main() -> None:
    if len(sys.argv) == 2 and sys.argv[1] == "self-test":
        self_test()
        return
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} {BUNDLE_PATH}")
    install_assets(Path(sys.argv[1]))


if __name__ == "__main__":
    main()
