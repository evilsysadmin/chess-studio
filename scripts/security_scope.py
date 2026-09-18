#!/usr/bin/env python3
"""Classify whether the expensive Trivy/Docker security path is required.

This preserves the existing Quality workflow contract: the security job may be
scheduled by the broader quality scope, while this narrower classifier decides
whether the expensive filesystem/image/compose checks must actually execute.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path


SECURITY_PATTERN = re.compile(
    r"(^|/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|\.dockerignore)$"
    r"|^compose\.ya?ml$"
    # package-lock.json is the dependency closure scanned by npm/Trivy. A
    # package.json-only script/metadata edit does not justify rebuilding and
    # scanning Docker images; dependency edits without a matching lock update
    # are rejected by npm ci before they can merge.
    r"|^frontend/package-lock\.json$"
    r"|^backend-python/requirements[^/]*\.txt$"
    r"|^Makefile$"
    r"|^\.trivy(ignore|\.ya?ml)?$"
    r"|^scripts/(npm_audit_gate\.py|pip_audit_report\.py|compose_smoke\.py|security[^/]*|trivy_[^/]*|install_trivy\.sh)$"
    r"|^\.github/workflows/cicd\.yml$"
    r"|^\.github/actions/cache-python-venv/action\.yml$"
    r"|^deploy/"
    r"|^render\.ya?ml$"
)
IAC_PATTERN = re.compile(
    r"^infra/(?:oci|cloudflare|terraform)/.*\.(?:tf|tfvars|hcl)$"
    r"|^infra/oci/runtime/backend\.staging\.env$"
)


def normalize_files(lines: list[str]) -> list[str]:
    return [line.strip() for line in lines if line.strip()]


def requires_heavy_security(files: list[str]) -> bool:
    return any(SECURITY_PATTERN.search(path) is not None for path in normalize_files(files))


def requires_iac_security(files: list[str]) -> bool:
    return any(IAC_PATTERN.search(path) is not None for path in normalize_files(files))


def output_lines(run_security: bool, run_iac_security: bool = False) -> list[str]:
    return [
        f"run_security={'true' if run_security else 'false'}",
        f"run_iac_security={'true' if run_iac_security else 'false'}",
    ]


def write_output(lines: list[str], github_output: str | None) -> None:
    text = "\n".join(lines) + "\n"
    if github_output:
        with Path(github_output).open("a", encoding="utf-8") as handle:
            handle.write(text)
    else:
        sys.stdout.write(text)


def self_test() -> None:
    positive = (
        "Dockerfile",
        "backend-python/Dockerfile.dev",
        "docker-compose.yml",
        "ops/docker-compose.prod.yaml",
        ".dockerignore",
        "frontend/.dockerignore",
        "compose.yml",
        "compose.yaml",
        "frontend/package-lock.json",
        "backend-python/requirements.txt",
        "backend-python/requirements-dev.txt",
        "Makefile",
        ".trivyignore",
        ".trivy.yml",
        ".trivy.yaml",
        "scripts/npm_audit_gate.py",
        "scripts/pip_audit_report.py",
        "scripts/compose_smoke.py",
        "scripts/security_images.py",
        "scripts/trivy_gate.py",
        "scripts/install_trivy.sh",
        ".github/workflows/cicd.yml",
        ".github/actions/cache-python-venv/action.yml",
        "deploy/render.sh",
        "render.yml",
        "render.yaml",
    )
    for path in positive:
        assert requires_heavy_security([path]), f"debía activar security pesado: {path}"

    iac_positive = (
        "infra/oci/staging/main.tf",
        "infra/oci/staging/terraform.tfvars",
        "infra/oci/staging/tests/contracts.tftest.hcl",
        "infra/cloudflare/main.tf",
        "infra/terraform/main.tf",
        "infra/oci/runtime/backend.staging.env",
    )
    for path in iac_positive:
        assert requires_iac_security([path]), f"debía activar Trivy IaC: {path}"

    negative = (
        "README.md",
        "frontend/src/App.jsx",
        "frontend/package.json",
        "scripts/quality_provenance.py",
        "scripts/browser_quality_scope.py",
        ".github/workflows/workflow-debt.yml",
        "backend-python/app/main.py",
        "docs/security-notes.md",
        "frontend/package-lock.json.bak",
        "backend-python/requirements.md",
        "infra/oci/staging/main.tf",
        "infra/cloudflare/main.tf",
        "infra/terraform/main.tf",
        "infrared/example.txt",
        "deployment-notes.md",
        "render.json",
    )
    for path in negative:
        assert not requires_heavy_security([path]), f"no debía activar security pesado: {path}"

    assert requires_heavy_security(["README.md", "deploy/service.yaml"])
    assert not requires_heavy_security(["README.md", "infra/oci/staging/main.tf"])
    assert requires_iac_security(["README.md", "infra/oci/staging/main.tf"])
    assert not requires_heavy_security([])
    assert not requires_iac_security([])
    assert normalize_files(["", "  README.md  ", "\n"]) == ["README.md"]
    assert output_lines(True, True) == ["run_security=true", "run_iac_security=true"]
    assert output_lines(False, True) == ["run_security=false", "run_iac_security=true"]
    assert output_lines(False, False) == ["run_security=false", "run_iac_security=false"]
    print("security-scope self-test OK · IaC runs Trivy without forcing Docker/Compose")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="force the expensive security path")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--github-output", default=os.environ.get("GITHUB_OUTPUT"))
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0

    files = [] if args.all else sys.stdin.read().splitlines()
    run_security = True if args.all else requires_heavy_security(files)
    run_iac_security = True if args.all else requires_iac_security(files)
    write_output(output_lines(run_security, run_iac_security), args.github_output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
