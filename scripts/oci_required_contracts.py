#!/usr/bin/env python3
"""Make OCI Terraform/Floci validation part of the protected PR contract when OCI changes."""
from __future__ import annotations

import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TERRAFORM_VERSION = "1.16.0"
TERRAFORM_SHA256 = {
    "x86_64": "41d05b927aa174f15d1228c4eba832a323b716c68b415ef5a00179f46cc602d3",
    "aarch64": "60f86cea49a653e22a93c000f16cbfa391ce41c6f6a11d36557c35da411f684c",
}
TERRAFORM_ARCHIVE = {"x86_64": "amd64", "aarch64": "arm64"}
SECRET_RE = re.compile(
    r"MONGO_URL|JWT_SECRET|RESEND_API_KEY|OTLP.*TOKEN|cloudflare_tunnel_token|private_key\s*=",
    re.IGNORECASE,
)
OCI_WORKFLOWS = {
    ".github/workflows/oci-readiness.yml",
    ".github/workflows/oci-staging-lab.yml",
    ".github/workflows/oci-staging-deploy.yml",
    ".github/workflows/oci-staging-service.yml",
}
K3S_BUNDLE_PATHS = {
    "scripts/oci_k3s_bundle.py",
    "scripts/oci_k3s_bundle_publish.py",
    "infra/oci/k3s/README.md",
    "infra/oci/k3s/install-k3s-airgap.sh",
    "infra/oci/k3s/versions.env",
}


def is_oci_path(path: str) -> bool:
    path = path.strip().replace("\\", "/")
    return (
        path.startswith("infra/oci/")
        or path.startswith("scripts/oci_")
        or path in OCI_WORKFLOWS
    )


def is_k3s_bundle_path(path: str) -> bool:
    path = path.strip().replace("\\", "/")
    return path in K3S_BUNDLE_PATHS or path.startswith("infra/oci/k3s/")


def self_test() -> None:
    for path in (
        "infra/oci/bootstrap/main.tf",
        "infra/oci/staging/backend.tf",
        "scripts/oci_floci_smoke.sh",
        "scripts/oci_required_contracts.py",
        *sorted(OCI_WORKFLOWS),
    ):
        assert is_oci_path(path), path
    for path in sorted(K3S_BUNDLE_PATHS):
        assert is_oci_path(path), path
        assert is_k3s_bundle_path(path), path
    for path in ("frontend/src/App.jsx", "backend-python/main.py", "infra/cloudflare/main.tf"):
        assert not is_oci_path(path), path
        assert not is_k3s_bundle_path(path), path


def _have_commit(root: Path, sha: str) -> bool:
    return subprocess.run(
        ["git", "cat-file", "-e", f"{sha}^{{commit}}"],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    ).returncode == 0


def _pr_changed_paths(root: Path) -> list[str]:
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


def required_in_this_run(root: Path = ROOT) -> bool:
    override = os.environ.get("OCI_REQUIRED", "").lower()
    if override in {"1", "true", "yes"}:
        return True
    if override in {"0", "false", "no"}:
        return False
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return False

    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if event_name == "workflow_dispatch":
        return True
    if event_name != "pull_request":
        return False

    try:
        paths = _pr_changed_paths(root)
    except (KeyError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"OCI required-contract scope unreadable; failing closed into OCI validation: {exc}")
        return True
    required = any(is_oci_path(path) for path in paths)
    print(f"OCI required-contract scope: required={'true' if required else 'false'}")
    return required


def k3s_bundle_required_in_this_run(root: Path = ROOT) -> bool:
    override = os.environ.get("OCI_K3S_BUNDLE_REQUIRED", "").lower()
    if override in {"1", "true", "yes"}:
        return True
    if override in {"0", "false", "no"}:
        return False
    if os.environ.get("GITHUB_ACTIONS") != "true":
        return False

    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    if event_name == "workflow_dispatch":
        return True
    if event_name != "pull_request":
        return False
    try:
        paths = _pr_changed_paths(root)
    except (KeyError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f"K3s bundle scope unreadable; failing closed into bundle validation: {exc}")
        return True
    required = any(is_k3s_bundle_path(path) for path in paths)
    print(f"OCI K3s bundle scope: required={'true' if required else 'false'}")
    return required


def _terraform_binary(root: Path) -> Path:
    machine = platform.machine().lower()
    if machine not in TERRAFORM_ARCHIVE:
        raise SystemExit(f"Unsupported runner architecture for pinned Terraform: {machine}")

    target_dir = root / ".tools" / f"terraform-{TERRAFORM_VERSION}"
    target = target_dir / "terraform"
    if target.is_file():
        return target

    archive_arch = TERRAFORM_ARCHIVE[machine]
    filename = f"terraform_{TERRAFORM_VERSION}_linux_{archive_arch}.zip"
    url = f"https://releases.hashicorp.com/terraform/{TERRAFORM_VERSION}/{filename}"
    expected = TERRAFORM_SHA256[machine]
    target_dir.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="chess-studio-terraform-") as tmp:
        archive = Path(tmp) / filename
        with urllib.request.urlopen(url, timeout=45) as response, archive.open("wb") as handle:
            shutil.copyfileobj(response, handle)
        actual = hashlib.sha256(archive.read_bytes()).hexdigest()
        if actual != expected:
            raise SystemExit(f"Terraform archive checksum mismatch: expected {expected}, got {actual}")
        with zipfile.ZipFile(archive) as bundle:
            if "terraform" not in bundle.namelist():
                raise SystemExit("Pinned Terraform archive does not contain terraform binary")
            bundle.extract("terraform", target_dir)
    target.chmod(0o755)
    return target


def _secret_surface_guard(root: Path) -> None:
    offenders: list[str] = []
    for path in (root / "infra" / "oci").rglob("*"):
        if not path.is_file() or path.suffix not in {".tf", ".tfvars", ".tftpl"}:
            continue
        if ".terraform" in path.parts:
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        if SECRET_RE.search(text):
            offenders.append(path.relative_to(root).as_posix())
    if offenders:
        raise SystemExit("OCI secret-surface guard failed: " + ", ".join(sorted(offenders)))


def _run_k3s_bundle_contract(root: Path) -> None:
    command = [sys.executable, "-S", "scripts/oci_k3s_bundle.py"]
    subprocess.run([*command, "--self-test"], cwd=root, check=True)
    subprocess.run(
        [sys.executable, "-S", "scripts/oci_k3s_bundle_publish.py", "self-test"],
        cwd=root,
        check=True,
    )
    with tempfile.TemporaryDirectory(prefix="chess-studio-k3s-ci-") as tmp:
        subprocess.run([*command, "--output-dir", tmp], cwd=root, check=True)
        bundles = list(Path(tmp).glob("k3s-airgap-arm64-*.tar.gz"))
        if len(bundles) != 1:
            raise SystemExit(f"K3s bundle gate expected one archive, found {len(bundles)}")
        max_bytes = 300 * 1024 * 1024
        size = bundles[0].stat().st_size
        if size > max_bytes:
            raise SystemExit(
                f"K3s bundle exceeds zero-cost artifact budget: {size} > {max_bytes} bytes"
            )
        print(f"OCI K3s bundle protected gate OK · bytes={size}")


def run_required_contracts(root: Path = ROOT) -> None:
    self_test()
    if not required_in_this_run(root):
        return

    terraform = _terraform_binary(root)
    env = os.environ.copy()
    env["PATH"] = f"{terraform.parent}:{env.get('PATH', '')}"
    env["TF_IN_AUTOMATION"] = "true"
    env["TF_INPUT"] = "false"

    print(f"OCI required contracts: Terraform {TERRAFORM_VERSION} + Floci")
    subprocess.run(["bash", "scripts/oci_terraform_static.sh"], cwd=root, env=env, check=True)
    _secret_surface_guard(root)
    subprocess.run(["bash", "scripts/oci_floci_smoke.sh"], cwd=root, env=env, check=True)
    if k3s_bundle_required_in_this_run(root):
        _run_k3s_bundle_contract(root)
    print("OCI required contracts OK")


if __name__ == "__main__":
    run_required_contracts()
