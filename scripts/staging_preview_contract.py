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
STAGING_WRANGLER = ROOT / "infra/cloudflare/wrangler.staging.toml"
STAGING_WORKER_WRAPPER = ROOT / "infra/cloudflare/worker/staging.js"
STAGING_WORKER_DEPLOY = ROOT / "scripts/deploy_staging_ai_worker.py"


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def main() -> int:
    errors: list[str] = []
    for path in (
        PREVIEW,
        STAGING_DEPLOY,
        STAGING_AI,
        PROMOTE,
        STAGING_WRANGLER,
        STAGING_WORKER_WRAPPER,
        STAGING_WORKER_DEPLOY,
    ):
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
    staging_wrangler = STAGING_WRANGLER.read_text(encoding="utf-8")
    staging_worker_wrapper = STAGING_WORKER_WRAPPER.read_text(encoding="utf-8")
    staging_worker_deploy = STAGING_WORKER_DEPLOY.read_text(encoding="utf-8")

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

    # Canonical staging owns all mutations for one generation. A CI-approved SHA
    # that has already been superseded by a newer main HEAD is not an outage: the
    # stale run must cancel itself before the first mutation. Once admitted,
    # backend, frontend and Worker finish inside the same serialized workflow.
    for needle, label in (
        ("Backend + frontend + AI staging generation", "canonical generation job"),
        ("Supersede stale staging commit", "single stale guard before mutation"),
        ("actions: write", "stale supersede cancellation permission"),
        ("GH_TOKEN: ${{ github.token }}", "stale supersede token wiring"),
        ("/actions/runs/$GITHUB_RUN_ID/cancel", "stale supersede self-cancel endpoint"),
        ("::notice title=Staging superseded", "stale supersede non-error diagnostic"),
        ("while :; do", "stale supersede fail-closed wait"),
        ("Deploy exact backend commit to Render staging", "generation backend deploy"),
        ("Deploy tested frontend to Cloudflare Pages", "generation frontend deploy"),
        ("Deploy exact staging Worker and synchronize shared secret", "generation Worker deploy"),
        ("deploy_staging_ai_worker.py --service-id", "generation Worker exact checkout helper"),
        ("Verify staging generation parity before browser smoke", "generation parity gate"),
        ("actual = {", "generation parity runtime identities"),
        ("'worker': str(ai.get('build')", "generation Worker SHA parity"),
        ("Live browser smoke against deployed staging", "generation live smoke"),
    ):
        require(staging_deploy, needle, label, errors)

    stale_step = staging_deploy.find("Supersede stale staging commit")
    backend_step = staging_deploy.find("Deploy exact backend commit to Render staging")
    worker_step = staging_deploy.find("Deploy exact staging Worker and synchronize shared secret")
    parity_step = staging_deploy.find("Verify staging generation parity before browser smoke")
    smoke_step = staging_deploy.find("Live browser smoke against deployed staging")
    if min(stale_step, backend_step) >= 0 and not stale_step < backend_step:
        errors.append("staging generation: stale supersede guard no está antes de la primera mutación Render")
    if min(worker_step, parity_step, smoke_step) >= 0 and not (worker_step < parity_step < smoke_step):
        errors.append("staging generation: Worker/parity/smoke no están en orden fail-closed")

    if "::error::CI aprobó" in staging_deploy:
        errors.append("staging generation: un SHA superseded vuelve a clasificarse como error")

    if parity_step >= 0 and smoke_step > parity_step:
        parity_block = staging_deploy[parity_step:smoke_step]
        for needle, label in (
            ("parity_ok=false", "generation parity retry state"),
            ("for attempt in {1..60}; do", "generation parity bounded polling"),
            ("Staging generation aún no converge:", "generation parity skew diagnostics"),
            ("Generation parity no convergió a N/N/N tras 5 minutos", "generation parity bounded timeout"),
        ):
            require(parity_block, needle, label, errors)

    # Staging Worker must expose the exact canonical generation at runtime and
    # the deploy helper must wait for the Custom Domain to serve it. A generic
    # 200 health response is insufficient because the previous Worker version
    # can remain healthy during Cloudflare edge propagation.
    require(staging_wrangler, 'main = "worker/staging.js"', "staging Worker wrapper entrypoint", errors)
    require(staging_worker_wrapper, "BUILD_SHA", "staging Worker runtime build field", errors)
    require(staging_worker_wrapper, "./index.js", "staging Worker delegates shared runtime", errors)
    require(staging_worker_deploy, 'secret", "put", "BUILD_SHA"', "staging Worker generation binding", errors)
    require(staging_worker_deploy, "required_deploy_sha()", "staging Worker full SHA validation", errors)
    require(staging_worker_deploy, "def wait_for_runtime_build", "staging Worker propagation wait", errors)
    require(staging_worker_deploy, "wait_for_runtime_build(deploy_sha)", "staging Worker runtime identity gate", errors)
    require(staging_worker_deploy, "last_build == deploy_sha", "staging Worker exact runtime SHA convergence", errors)

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
    require(staging_ai, "Verify staging AI health and build identity", "staging AI runtime Worker attestation", errors)
    require(staging_ai, "payload.get('build')", "staging AI Worker exact SHA check", errors)
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

    print("staging-preview-contract OK · preview isolated; stale main generations self-cancel before mutation; canonical staging owns N/N/N")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
