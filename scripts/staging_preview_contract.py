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

    # Canonical staging owns all mutations for one generation. Once the initial
    # stale guard passes, backend, frontend and Worker must finish inside the
    # same serialized workflow before the browser smoke can accredit anything.
    for needle, label in (
        ("Backend + frontend + AI staging generation", "canonical generation job"),
        ("Refuse stale staging commit", "single stale guard before mutation"),
        ("Deploy exact backend commit to Render staging", "generation backend deploy"),
        ("Deploy tested frontend to Cloudflare Pages", "generation frontend deploy"),
        ("Deploy exact staging Worker and synchronize shared secret", "generation Worker deploy"),
        ("deploy_staging_ai_worker.py --service-id", "generation Worker exact checkout helper"),
        ("Verify staging generation parity before browser smoke", "generation parity gate"),
        ("Live browser smoke against deployed staging", "generation live smoke"),
    ):
        require(staging_deploy, needle, label, errors)

    worker_step = staging_deploy.find("Deploy exact staging Worker and synchronize shared secret")
    parity_step = staging_deploy.find("Verify staging generation parity before browser smoke")
    smoke_step = staging_deploy.find("Live browser smoke against deployed staging")
    if min(worker_step, parity_step, smoke_step) >= 0 and not (worker_step < parity_step < smoke_step):
        errors.append("staging generation: Worker/parity/smoke no están en orden fail-closed")

    # Production remains provenance-bound to the canonical AI accreditation workflow.
    require(promote, "workflows:\n      - Staging · AI Worker", "production source workflow", errors)
    require(promote, "branches:\n      - main", "production main-only source", errors)
    if "Staging · preview" in promote:
        errors.append("production-promote escucha Staging · preview")

    # Staging AI remains downstream of canonical Staging · deploy, but it is now
    # read-only accreditation. A second deploy/stale guard here would reintroduce
    # the generation race we are explicitly trying to remove.
    require(staging_ai, "workflows:\n      - Staging · deploy", "staging AI canonical source", errors)
    require(staging_ai, "UPSTREAM_EVENT", "staging AI upstream provenance guard", errors)
    require(staging_ai, "Accredit coherent staging generation", "staging AI read-only accreditation", errors)
    require(staging_ai, "Verify staging backend still serves approved SHA", "staging AI backend attestation", errors)
    require(staging_ai, "Verify staging frontend still serves approved SHA", "staging AI frontend attestation", errors)
    require(staging_ai, "Verify staging AI health contract", "staging AI health attestation", errors)
    if "deploy_staging_ai_worker.py" in staging_ai:
        errors.append("staging AI accreditation vuelve a desplegar el Worker")
    if "Refuse stale staging Worker commit" in staging_ai:
        errors.append("staging AI accreditation contiene un stale guard tardío")
    if "Staging · preview" in staging_ai:
        errors.append("staging AI escucha Staging · preview")

    if errors:
        print("staging-preview-contract FAIL", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print("staging-preview-contract OK · preview is isolated; canonical staging mutates one serialized generation and AI only accredits it")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
