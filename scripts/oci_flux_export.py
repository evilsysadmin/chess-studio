#!/usr/bin/env python3
"""Checksum-verified, no-cluster Flux manifest export contract."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSIONS = ROOT / "infra/oci/gitops/flux/versions.env"
SUCCESS_MARKER = "OCI_FLUX_EXPORT_OK"
SKIP_MARKER = "OCI_FLUX_EXPORT_SKIPPED"
FORBIDDEN_CONTROLLERS = (
    "helm-controller",
    "notification-controller",
    "image-reflector-controller",
    "image-automation-controller",
    "source-watcher",
)


def read_env(path: Path = VERSIONS) -> dict[str, str]:
    result: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep or not key or not value:
            raise SystemExit(f"invalid Flux versions entry: {raw!r}")
        result[key] = value
    return result


def is_flux_seam_path(path: str) -> bool:
    normalized = path.strip().replace("\\", "/")
    return normalized.startswith("infra/oci/gitops/flux/") or normalized.startswith("scripts/oci_flux_")


def _have_commit(root: Path, sha: str) -> bool:
    return subprocess.run(
        ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def pr_changed_paths(root: Path = ROOT) -> list[str]:
    event_path = Path(os.environ["GITHUB_EVENT_PATH"])
    event = json.loads(event_path.read_text(encoding="utf-8"))
    base_sha = event["pull_request"]["base"]["sha"]
    merge_sha = os.environ["GITHUB_SHA"]
    if not _have_commit(root, base_sha):
        subprocess.run(
            ["git", "fetch", "--no-tags", "--depth=1", "origin", base_sha],
            cwd=root,
            check=True,
        )
    completed = subprocess.run(
        ["git", "diff", "--name-only", base_sha, merge_sha],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    )
    return [line.strip() for line in completed.stdout.splitlines() if line.strip()]


def required_in_ci(root: Path = ROOT) -> bool:
    override = os.environ.get("OCI_FLUX_EXPORT_REQUIRED", "").lower()
    if override in {"1", "true", "yes"}:
        return True
    if override in {"0", "false", "no"}:
        return False
    if os.environ.get("GITHUB_ACTIONS") != "true" or os.environ.get("GITHUB_EVENT_NAME") != "pull_request":
        return False
    try:
        paths = pr_changed_paths(root)
    except (KeyError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"Flux export scope unreadable; failing closed into export validation: {exc}")
        return True
    required = any(is_flux_seam_path(path) for path in paths)
    print(f"OCI Flux export scope: required={'true' if required else 'false'}")
    return required


def asset_for_machine(machine: str, env: dict[str, str]) -> tuple[str, str, str]:
    normalized = machine.lower()
    if normalized in {"x86_64", "amd64"}:
        arch = "amd64"
        checksum_key = "FLUX_LINUX_AMD64_SHA256"
    elif normalized in {"aarch64", "arm64"}:
        arch = "arm64"
        checksum_key = "FLUX_LINUX_ARM64_SHA256"
    else:
        raise SystemExit(f"unsupported Flux CLI architecture: {machine}")

    version = env["FLUX_VERSION"]
    bare_version = version.removeprefix("v")
    filename = f"flux_{bare_version}_linux_{arch}.tar.gz"
    url = f"https://github.com/fluxcd/flux2/releases/download/{version}/{filename}"
    return filename, url, env[checksum_key]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def fetch_flux_cli(directory: Path, env: dict[str, str]) -> Path:
    filename, url, expected = asset_for_machine(platform.machine(), env)
    archive = directory / filename
    with urllib.request.urlopen(url, timeout=60) as response, archive.open("wb") as handle:
        shutil.copyfileobj(response, handle)

    actual = sha256_file(archive)
    if actual != expected:
        raise SystemExit(f"Flux archive checksum mismatch: expected {expected}, got {actual}")

    with tarfile.open(archive, "r:gz") as bundle:
        members = [member for member in bundle.getmembers() if member.isfile() and Path(member.name).name == "flux"]
        if len(members) != 1:
            raise SystemExit(f"Flux archive expected one CLI binary, found {len(members)}")
        source = bundle.extractfile(members[0])
        if source is None:
            raise SystemExit("Flux archive CLI member is unreadable")
        target = directory / "flux"
        with target.open("wb") as handle:
            shutil.copyfileobj(source, handle)
    target.chmod(0o755)
    return target


def export_command(binary: Path, env: dict[str, str]) -> list[str]:
    return [
        str(binary),
        "install",
        "--export",
        f"--namespace={env['FLUX_NAMESPACE']}",
        f"--components={env['FLUX_COMPONENTS']}",
        "--network-policy=true",
        "--cluster-domain=cluster.local",
    ]


def validate_manifest(data: bytes, env: dict[str, str]) -> None:
    try:
        manifest = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise SystemExit(f"Flux export is not UTF-8: {exc}") from exc

    if len(data) < 10_000:
        raise SystemExit(f"Flux export unexpectedly small: {len(data)} bytes")
    namespace = env["FLUX_NAMESPACE"]
    if "kind: Namespace" not in manifest or f"name: {namespace}" not in manifest:
        raise SystemExit("Flux export lost the target namespace")
    deployment_count = manifest.count("kind: Deployment")
    if deployment_count != 2:
        raise SystemExit(f"Flux export expected exactly two Deployments, found {deployment_count}")
    for controller in env["FLUX_COMPONENTS"].split(","):
        if f"name: {controller}" not in manifest:
            raise SystemExit(f"Flux export missing controller: {controller}")
    deployment_names: list[str] = []
    lines = manifest.splitlines()
    for index, line in enumerate(lines):
        if line.strip() != "kind: Deployment":
            continue
        for candidate in lines[index + 1:index + 12]:
            if candidate.strip().startswith("name: "):
                deployment_names.append(candidate.split(":", 1)[1].strip())
                break
    expected_deployments = env["FLUX_COMPONENTS"].split(",")
    if sorted(deployment_names) != sorted(expected_deployments):
        raise SystemExit(
            f"Flux export deployment set drifted: expected {expected_deployments}, got {deployment_names}"
        )
    if "kind: Secret" in manifest:
        raise SystemExit("Flux export unexpectedly contains a Secret")
    if "source.toolkit.fluxcd.io" not in manifest:
        raise SystemExit("Flux export missing source toolkit CRDs")
    if "kustomize.toolkit.fluxcd.io" not in manifest:
        raise SystemExit("Flux export missing kustomize toolkit CRDs")


def render_once(binary: Path, env: dict[str, str], missing_kubeconfig: Path) -> bytes:
    process_env = os.environ.copy()
    process_env["KUBECONFIG"] = str(missing_kubeconfig)
    completed = subprocess.run(
        export_command(binary, env),
        cwd=ROOT,
        env=process_env,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout


def self_test() -> None:
    env = read_env()
    filename, url, checksum = asset_for_machine("x86_64", env)
    assert filename == "flux_2.9.5_linux_amd64.tar.gz"
    assert url.endswith("/v2.9.5/flux_2.9.5_linux_amd64.tar.gz")
    assert checksum == env["FLUX_LINUX_AMD64_SHA256"]
    assert asset_for_machine("arm64", env)[2] == env["FLUX_LINUX_ARM64_SHA256"]
    assert is_flux_seam_path("infra/oci/gitops/flux/versions.env")
    assert is_flux_seam_path("scripts/oci_flux_export.py")
    assert not is_flux_seam_path("infra/oci/k3s/versions.env")

    command = export_command(Path("/tmp/flux"), env)
    assert command[1:3] == ["install", "--export"]
    assert f"--components={env['FLUX_COMPONENTS']}" in command
    assert f"--namespace={env['FLUX_NAMESPACE']}" in command
    assert "--network-policy=true" in command

    sample = (
        "kind: Namespace\nmetadata:\n  name: flux-system\n---\n"
        "apiVersion: source.toolkit.fluxcd.io/v1\nkind: GitRepository\n---\n"
        "apiVersion: kustomize.toolkit.fluxcd.io/v1\nkind: Kustomization\n---\n"
        "kind: Deployment\nmetadata:\n  name: source-controller\n" + ("# pad\n" * 1000) + "---\n"
        "kind: Deployment\nmetadata:\n  name: kustomize-controller\n" + ("# pad\n" * 1000)
    ).encode("utf-8")
    validate_manifest(sample, env)
    for bad in (
        sample + b"\nkind: Secret\n",
        sample + b"\nkind: Deployment\nmetadata:\n  name: helm-controller\n",
        sample.replace(b"kind: Deployment", b"kind: Service", 1),
    ):
        try:
            validate_manifest(bad, env)
        except SystemExit:
            pass
        else:
            raise AssertionError("invalid Flux export sample must fail closed")
    print("OCI Flux export self-test: OK")


def run_export(output: Path | None) -> None:
    env = read_env()
    with tempfile.TemporaryDirectory(prefix="chess-studio-flux-export-") as tmp:
        directory = Path(tmp)
        binary = fetch_flux_cli(directory, env)
        missing_kubeconfig = directory / "intentionally-missing-kubeconfig"
        first = render_once(binary, env, missing_kubeconfig)
        second = render_once(binary, env, missing_kubeconfig)
        if first != second:
            raise SystemExit("Flux export is not byte-reproducible across consecutive runs")
        validate_manifest(first, env)
        if output:
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(first)
        digest = hashlib.sha256(first).hexdigest()
        print(
            f"{SUCCESS_MARKER} version={env['FLUX_VERSION']} components={env['FLUX_COMPONENTS']} "
            f"bytes={len(first)} sha256={digest}"
        )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--ci-if-required", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    if args.ci_if_required and not required_in_ci():
        print(SKIP_MARKER)
        return
    run_export(args.output)


if __name__ == "__main__":
    main()
