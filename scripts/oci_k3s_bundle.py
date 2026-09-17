#!/usr/bin/env python3
"""Build a pinned, deterministic, network-independent K3s ARM64 bootstrap bundle."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import re
import shutil
import tarfile
import tempfile
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "infra" / "oci" / "k3s" / "versions.env"
INSTALLER_PATH = ROOT / "infra" / "oci" / "k3s" / "install-k3s-airgap.sh"
EXPECTED_KEYS = {
    "K3S_VERSION",
    "K3S_ARM64_SHA256",
    "K3S_ARM64_SIZE",
    "K3S_AIRGAP_ARM64_SHA256",
    "K3S_AIRGAP_ARM64_SIZE",
}
VERSION_RE = re.compile(r"^v\d+\.\d+\.\d+\+k3s\d+$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
RELEASE_BASE = "https://github.com/k3s-io/k3s/releases/download"


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def load_config(path: Path = CONFIG_PATH) -> dict[str, str]:
    values: dict[str, str] = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SystemExit(f"{path}:{number}: expected KEY=value")
        key, value = line.split("=", 1)
        if key not in EXPECTED_KEYS:
            raise SystemExit(f"{path}:{number}: unsupported key {key!r}")
        if key in values:
            raise SystemExit(f"{path}:{number}: duplicate key {key!r}")
        if not value or value != value.strip():
            raise SystemExit(f"{path}:{number}: empty or padded value for {key}")
        values[key] = value
    missing = EXPECTED_KEYS - values.keys()
    if missing:
        raise SystemExit(f"{path}: missing keys: {', '.join(sorted(missing))}")
    validate_config(values)
    return values


def validate_config(values: dict[str, str]) -> None:
    version = values["K3S_VERSION"]
    if not VERSION_RE.fullmatch(version):
        raise SystemExit(f"invalid pinned K3s version: {version!r}")
    for key in ("K3S_ARM64_SHA256", "K3S_AIRGAP_ARM64_SHA256"):
        if not SHA_RE.fullmatch(values[key]):
            raise SystemExit(f"invalid SHA-256 for {key}")
    for key in ("K3S_ARM64_SIZE", "K3S_AIRGAP_ARM64_SIZE"):
        try:
            size = int(values[key])
        except ValueError as exc:
            raise SystemExit(f"invalid byte size for {key}") from exc
        if size <= 0:
            raise SystemExit(f"byte size must be positive for {key}")


def release_url(version: str, asset: str) -> str:
    encoded_tag = urllib.parse.quote(version, safe="v0123456789.")
    return f"{RELEASE_BASE}/{encoded_tag}/{asset}"


def download(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "chess-studio-k3s-bundle/1"})
    target.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(request, timeout=90) as response, target.open("wb") as handle:
        shutil.copyfileobj(response, handle, length=1024 * 1024)


def verify_asset(path: Path, *, expected_sha: str, expected_size: int) -> None:
    actual_size = path.stat().st_size
    if actual_size != expected_size:
        raise SystemExit(
            f"{path.name}: size mismatch: expected {expected_size}, got {actual_size}"
        )
    actual_sha = sha256_file(path)
    if actual_sha != expected_sha:
        raise SystemExit(
            f"{path.name}: sha256 mismatch: expected {expected_sha}, got {actual_sha}"
        )


def _installer_bytes() -> bytes:
    data = INSTALLER_PATH.read_bytes()
    text = data.decode("utf-8")
    forbidden = ("curl ", "wget ", "http://", "https://", "systemctl", "k3s server", "k3s agent")
    found = [marker for marker in forbidden if marker in text]
    if found:
        raise SystemExit(
            "K3s bundle installer must remain networkless and must not initialize the cluster: "
            + ", ".join(found)
        )
    return data


def manifest_for(values: dict[str, str], installer: bytes) -> dict[str, object]:
    version = values["K3S_VERSION"]
    return {
        "schema": 1,
        "architecture": "arm64",
        "k3s_version": version,
        "components": [
            {
                "path": "bin/k3s",
                "source": release_url(version, "k3s-arm64"),
                "sha256": values["K3S_ARM64_SHA256"],
                "size": int(values["K3S_ARM64_SIZE"]),
                "mode": "0755",
            },
            {
                "path": "images/k3s-airgap-images-arm64.tar.zst",
                "source": release_url(version, "k3s-airgap-images-arm64.tar.zst"),
                "sha256": values["K3S_AIRGAP_ARM64_SHA256"],
                "size": int(values["K3S_AIRGAP_ARM64_SIZE"]),
                "mode": "0644",
            },
            {
                "path": "bootstrap/install-k3s-airgap.sh",
                "source": "repository:infra/oci/k3s/install-k3s-airgap.sh",
                "sha256": sha256_bytes(installer),
                "size": len(installer),
                "mode": "0755",
            },
        ],
    }


def write_manifest(path: Path, payload: dict[str, object]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True, separators=(",", ": ")) + "\n",
        encoding="utf-8",
    )


def deterministic_archive(layout: Path, output: Path) -> None:
    files = sorted(path for path in layout.rglob("*") if path.is_file())
    directories: set[str] = set()
    for path in files:
        relative = path.relative_to(layout)
        for parent in relative.parents:
            if str(parent) != ".":
                directories.add(parent.as_posix())

    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("wb") as raw:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as zipped:
            with tarfile.open(fileobj=zipped, mode="w", format=tarfile.USTAR_FORMAT) as archive:
                for name in sorted(directories):
                    info = tarfile.TarInfo(name=f"{name}/")
                    info.type = tarfile.DIRTYPE
                    info.mode = 0o755
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mtime = 0
                    archive.addfile(info)
                for path in files:
                    relative = path.relative_to(layout).as_posix()
                    data = path.read_bytes()
                    info = tarfile.TarInfo(name=relative)
                    info.size = len(data)
                    info.mode = 0o755 if relative in {"bin/k3s", "bootstrap/install-k3s-airgap.sh"} else 0o644
                    info.uid = info.gid = 0
                    info.uname = info.gname = ""
                    info.mtime = 0
                    archive.addfile(info, io.BytesIO(data))


def verify_archive(path: Path, manifest: dict[str, object]) -> None:
    expected = {
        "bin/k3s",
        "images/k3s-airgap-images-arm64.tar.zst",
        "bootstrap/install-k3s-airgap.sh",
        "manifest.json",
    }
    with tarfile.open(path, "r:gz") as archive:
        members = {member.name: member for member in archive.getmembers() if member.isfile()}
        if set(members) != expected:
            raise SystemExit(f"unexpected K3s bundle layout: {sorted(members)}")
        embedded = json.load(archive.extractfile(members["manifest.json"]))  # type: ignore[arg-type]
        if embedded != manifest:
            raise SystemExit("embedded K3s manifest differs from build manifest")
        for component in manifest["components"]:  # type: ignore[index]
            component = dict(component)
            member = members[str(component["path"])]
            stream = archive.extractfile(member)
            if stream is None:
                raise SystemExit(f"could not read {member.name} from bundle")
            data = stream.read()
            if len(data) != int(component["size"]):
                raise SystemExit(f"embedded size mismatch for {member.name}")
            if sha256_bytes(data) != component["sha256"]:
                raise SystemExit(f"embedded sha256 mismatch for {member.name}")


def build(output_dir: Path, values: dict[str, str] | None = None) -> Path:
    values = values or load_config()
    installer = _installer_bytes()
    version = values["K3S_VERSION"]
    with tempfile.TemporaryDirectory(prefix="chess-studio-k3s-") as tmp:
        tmp_path = Path(tmp)
        layout = tmp_path / "bundle"
        binary = layout / "bin" / "k3s"
        images = layout / "images" / "k3s-airgap-images-arm64.tar.zst"
        installer_target = layout / "bootstrap" / "install-k3s-airgap.sh"

        download(release_url(version, "k3s-arm64"), binary)
        verify_asset(
            binary,
            expected_sha=values["K3S_ARM64_SHA256"],
            expected_size=int(values["K3S_ARM64_SIZE"]),
        )
        download(release_url(version, "k3s-airgap-images-arm64.tar.zst"), images)
        verify_asset(
            images,
            expected_sha=values["K3S_AIRGAP_ARM64_SHA256"],
            expected_size=int(values["K3S_AIRGAP_ARM64_SIZE"]),
        )

        installer_target.parent.mkdir(parents=True, exist_ok=True)
        installer_target.write_bytes(installer)
        manifest = manifest_for(values, installer)
        write_manifest(layout / "manifest.json", manifest)

        safe_version = version.replace("+", "-")
        output = output_dir / f"k3s-airgap-arm64-{safe_version}.tar.gz"
        deterministic_archive(layout, output)
        verify_archive(output, manifest)
    print(f"K3s airgap bundle OK · {output.name} · sha256={sha256_file(output)}")
    return output


def self_test() -> None:
    values = load_config()
    assert release_url(values["K3S_VERSION"], "k3s-arm64").endswith(
        "/v1.36.4%2Bk3s1/k3s-arm64"
    )
    installer = _installer_bytes()
    manifest = manifest_for(values, installer)
    assert manifest["architecture"] == "arm64"
    assert len(manifest["components"]) == 3  # type: ignore[arg-type]

    with tempfile.TemporaryDirectory(prefix="chess-studio-k3s-selftest-") as tmp:
        root = Path(tmp)
        layout = root / "bundle"
        (layout / "bin").mkdir(parents=True)
        (layout / "images").mkdir(parents=True)
        (layout / "bootstrap").mkdir(parents=True)
        (layout / "bin" / "k3s").write_bytes(b"fake-k3s")
        (layout / "images" / "k3s-airgap-images-arm64.tar.zst").write_bytes(b"fake-images")
        (layout / "bootstrap" / "install-k3s-airgap.sh").write_bytes(installer)
        fake_manifest = {
            "schema": 1,
            "architecture": "arm64",
            "k3s_version": "v0.0.0+k3s0",
            "components": [
                {
                    "path": "bin/k3s",
                    "sha256": sha256_bytes(b"fake-k3s"),
                    "size": len(b"fake-k3s"),
                },
                {
                    "path": "images/k3s-airgap-images-arm64.tar.zst",
                    "sha256": sha256_bytes(b"fake-images"),
                    "size": len(b"fake-images"),
                },
                {
                    "path": "bootstrap/install-k3s-airgap.sh",
                    "sha256": sha256_bytes(installer),
                    "size": len(installer),
                },
            ],
        }
        write_manifest(layout / "manifest.json", fake_manifest)
        first = root / "one.tar.gz"
        second = root / "two.tar.gz"
        deterministic_archive(layout, first)
        deterministic_archive(layout, second)
        assert first.read_bytes() == second.read_bytes(), "archive must be byte-reproducible"
        verify_archive(first, fake_manifest)
    print("OCI K3s bundle self-test: OK")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--output-dir", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.output_dir is None:
        parser.error("--output-dir is required unless --self-test is used")
    build(args.output_dir)


if __name__ == "__main__":
    main()
