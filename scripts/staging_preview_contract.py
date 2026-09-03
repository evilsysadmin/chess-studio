#!/usr/bin/env python3
"""Fail closed if manual staging preview/restore can enter production."""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
PREVIEW = ROOT / ".github/workflows/staging-preview.yml"
STAGING_DEPLOY = ROOT / ".github/workflows/staging-deploy.yml"
STAGING_AI = ROOT / ".github/workflows/staging-ai-worker.yml"
PROMOTE = ROOT / ".github/workflows/production-promote.yml"


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def main() -> int:
    errors: list[str] = []
    for path in (PREVIEW, STAGING_DEPLOY, STAGING_AI, PROMOTE):
        if not path.exists():
            errors.append(f"falta {path.relative_to(ROOT)}")
    if errors:
        for error in errors:
            print(f"staging-preview-contract FAIL · {error}", file=sys.stderr)
        return 1

    preview = PREVIEW.read_text(encoding="utf-8")
    staging_deploy = STAGING_DEPLOY.read_text(encoding="utf-8")
    staging_ai = STAGING_AI.read_text(encoding="utf-8")
    promote = PROMOTE.read_text(encoding="utf-8")

    require(preview, "name: Staging · preview", "workflow name", errors)
    require(preview, "workflow_dispatch:", "manual-only trigger", errors)
    require(preview, "- preview\n          - restore-main", "preview/restore mode allowlist", errors)
    require(preview, "TARGET_REF: ${{ inputs.mode == 'restore-main' && 'main' || inputs.ref }}", "target ref selection", errors)
    require(preview, "ORCHESTRATOR_REF: ${{ github.ref }}", "orchestrator provenance", errors)
    require(preview, "refs/heads/main", "orchestrator main-only guard", errors)
    require(preview, "PAGES_PROJECT: chess-studio-staging", "staging Pages project", errors)
    require(preview, "STAGING_URL: https://staging.chess-studio.shadowops.dpdns.org", "canonical staging URL", errors)
    require(preview, "path: preview-source", "isolated target checkout", errors)
    require(preview, "main no es un preview; usa el modo restore-main", "preview main refusal", errors)
    require(preview, "restore-main resolvió", "restore exact-main guard", errors)
    require(preview, "production_branch != 'main'", "Pages production branch verification", errors)
    require(preview, "--branch main", "canonical staging frontend deployment", errors)
    require(preview, "Staging no sirve el SHA solicitado", "live build identity gate", errors)
    require(preview, "No acreditado:", "non-accreditation summary", errors)
    require(preview, "group: chess-studio-staging-deploy", "staging write mutex", errors)
    require(staging_deploy, "group: chess-studio-staging-deploy", "canonical staging write mutex", errors)

    # This workflow is deliberately frontend-only: no Render mutation or AI deploy.
    for forbidden in (
        "workflow_run:",
        "pull_request:",
        "\npush:",
        "RENDER_API_KEY",
        "render_staging_bootstrap.py",
        "deploy_staging_ai_worker.py",
    ):
        if forbidden in preview:
            errors.append(f"preview/restore contiene trigger o mutación prohibida: {forbidden!r}")

    # Production remains provenance-bound to the canonical AI staging workflow.
    require(promote, "workflows:\n      - Staging · AI Worker", "production source workflow", errors)
    require(promote, "branches:\n      - main", "production main-only source", errors)
    if "Staging · preview" in promote:
        errors.append("production-promote escucha Staging · preview")

    # AI staging remains downstream of canonical Staging · deploy, never this workflow.
    require(staging_ai, "workflows:\n      - Staging · deploy", "staging AI canonical source", errors)
    require(staging_ai, "UPSTREAM_EVENT", "staging AI upstream provenance guard", errors)
    if "Staging · preview" in staging_ai:
        errors.append("staging AI escucha Staging · preview")

    if errors:
        print("staging-preview-contract FAIL", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("staging-preview-contract OK · preview and restore are frontend-only, serialized, and cannot accredit production")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
