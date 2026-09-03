#!/usr/bin/env python3
"""Fail closed if manual staging preview can enter the production chain."""
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

    require(preview, "name: Staging · preview", "preview name", errors)
    require(preview, "workflow_dispatch:", "preview manual-only trigger", errors)
    require(preview, "ORCHESTRATOR_REF: ${{ github.ref }}", "preview orchestrator provenance", errors)
    require(preview, "refs/heads/main", "preview orchestrator main-only guard", errors)
    require(preview, "PAGES_PROJECT: chess-studio-staging", "preview staging Pages project", errors)
    require(preview, "STAGING_URL: https://staging.chess-studio.shadowops.dpdns.org", "preview canonical staging URL", errors)
    require(preview, "path: preview-source", "preview source isolated checkout", errors)
    require(preview, "El ref resuelve al SHA actual de main", "preview source main SHA refusal", errors)
    require(preview, "production_branch != 'main'", "preview verifies Pages production branch", errors)
    require(preview, "--branch main", "preview writes canonical staging frontend", errors)
    require(preview, "Staging no sirve el SHA de preview solicitado", "preview live build identity gate", errors)
    require(preview, "No acreditado:", "preview non-accreditation summary", errors)
    require(preview, "group: chess-studio-staging-deploy", "preview staging write mutex", errors)
    require(staging_deploy, "group: chess-studio-staging-deploy", "canonical staging write mutex", errors)

    # Preview is deliberately frontend-only: no Render mutation and no AI deploy.
    for forbidden in (
        "workflow_run:",
        "pull_request:",
        "\npush:",
        "RENDER_API_KEY",
        "render_staging_bootstrap.py",
        "deploy_staging_ai_worker.py",
    ):
        if forbidden in preview:
            errors.append(f"preview contiene trigger/mutación prohibida: {forbidden!r}")

    # Production remains provenance-bound to the canonical AI staging workflow.
    require(promote, "workflows:\n      - Staging · AI Worker", "production source workflow", errors)
    require(promote, "branches:\n      - main", "production main-only source", errors)
    if "Staging · preview" in promote:
        errors.append("production-promote escucha Staging · preview")

    # AI staging also remains downstream of canonical Staging · deploy, not preview.
    require(staging_ai, "workflows:\n      - Staging · deploy", "staging AI canonical source", errors)
    require(staging_ai, "UPSTREAM_EVENT", "staging AI upstream provenance guard", errors)
    if "Staging · preview" in staging_ai:
        errors.append("staging AI escucha Staging · preview")

    if errors:
        print("staging-preview-contract FAIL", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("staging-preview-contract OK · manual frontend preview is serialized on staging and cannot accredit production")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
