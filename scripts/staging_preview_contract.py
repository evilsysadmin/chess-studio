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
    # backend, Pages and Worker advance in parallel. Existing browser runners then
    # prove the same N/N/N runtime contract before Chromium starts.
    for needle, label in (
        ("Backend + frontend + AI staging generation", "canonical generation job"),
        ("Supersede stale staging commit", "single stale guard before mutation"),
        ("actions: write", "stale supersede cancellation permission"),
        ("GH_TOKEN: ${{ github.token }}", "stale supersede token wiring"),
        ("/actions/runs/$GITHUB_RUN_ID/cancel", "stale supersede self-cancel endpoint"),
        ("::notice title=Staging superseded", "stale supersede non-error diagnostic"),
        ("while :; do", "stale supersede fail-closed wait"),
        ("Reconcile Render staging configuration", "backend-specific Render reconcile"),
        ("Deploy exact backend commit to Render staging", "generation backend deploy"),
        ("Deploy tested frontend to Cloudflare Pages", "generation frontend deploy"),
        ("Deploy exact staging Worker and synchronize shared secret", "generation Worker deploy"),
        ("run: python3 scripts/deploy_staging_ai_worker.py", "generation Worker self-resolving helper"),
        ("Verify staging generation parity before browser smoke", "generation parity gate"),
        ("actual = {", "generation parity runtime identities"),
        ("'worker': str(ai.get('build')", "generation Worker SHA parity"),
        ("Live browser smoke against deployed staging", "generation live smoke"),
    ):
        require(staging_deploy, needle, label, errors)

    # Topology contract: prepare is admission only. Backend, Pages and Worker are
    # sibling lanes after admission. Render reconcile stays inside backend before
    # the exact deploy. There is no standalone parity job: the smoke matrix waits
    # for all three deploy lanes and proves N/N/N before restoring browser runtime.
    job_markers = {
        "prepare": "\n  prepare:\n",
        "backend": "\n  backend:\n",
        "frontend": "\n  frontend:\n",
        "worker": "\n  worker:\n",
        "smoke": "\n  smoke:\n",
        "summary": "\n  summary:\n",
    }
    job_positions = {name: staging_deploy.find(marker) for name, marker in job_markers.items()}
    if any(position < 0 for position in job_positions.values()):
        missing = sorted(name for name, position in job_positions.items() if position < 0)
        errors.append(f"staging generation: faltan jobs para auditar topología paralela: {missing}")
    else:
        ordered = ["prepare", "backend", "frontend", "worker", "smoke", "summary"]
        blocks = {}
        for index, name in enumerate(ordered[:-1]):
            blocks[name] = staging_deploy[job_positions[name]:job_positions[ordered[index + 1]]]
        blocks["summary"] = staging_deploy[job_positions["summary"]:]

        if "render_staging_bootstrap.py" in blocks["prepare"]:
            errors.append("staging generation: prepare volvió a ejecutar Render reconcile y serializa Pages/Worker")
        if "\n  render_reconcile:\n" in staging_deploy:
            errors.append("staging generation: Render reconcile volvió a un job separado y añade otro runner antes del deploy")
        if "\n  parity:\n" in staging_deploy:
            errors.append("staging generation: parity volvió a un job separado y añade otra cola de runner antes del smoke")

        require(blocks["backend"], "needs: prepare", "backend arranca tras admission", errors)
        require(blocks["backend"], "render_staging_bootstrap.py", "backend conserva bootstrap idempotente", errors)
        require(blocks["backend"], "render_service_id: ${{ steps.render_bootstrap.outputs.service_id }}", "backend exporta service id para smoke", errors)
        reconcile_step = blocks["backend"].find("Reconcile Render staging configuration")
        deploy_step = blocks["backend"].find("Deploy exact backend commit to Render staging")
        if min(reconcile_step, deploy_step) >= 0 and not reconcile_step < deploy_step:
            errors.append("staging generation: Render reconcile debe ocurrir antes del exact deploy dentro del mismo backend job")

        require(blocks["frontend"], "needs: prepare", "Pages arranca tras admission", errors)
        require(blocks["worker"], "needs: prepare", "Worker arranca tras admission", errors)
        if "render_reconcile" in blocks["frontend"]:
            errors.append("staging generation: Pages volvió a depender de Render reconcile")
        if "render_reconcile" in blocks["worker"]:
            errors.append("staging generation: Worker volvió a depender de Render reconcile")
        if "--service-id" in blocks["worker"]:
            errors.append("staging generation: Worker volvió a depender del service_id producido por Render reconcile")

        require(
            blocks["smoke"],
            "needs: [prepare, backend, frontend, worker]",
            "smoke espera las tres ramas de deploy",
            errors,
        )
        require(
            blocks["smoke"],
            "RENDER_SERVICE_ID: ${{ needs.backend.outputs.render_service_id }}",
            "smoke consume service id del backend",
            errors,
        )
        require(
            blocks["summary"],
            "needs: [prepare, backend, frontend, worker, smoke]",
            "summary espera deploy lanes + browser smoke",
            errors,
        )

        parity_in_smoke = blocks["smoke"].find("Verify staging generation parity before browser smoke")
        browser_restore = blocks["smoke"].find("Restore staging browser runtime")
        browser_test = blocks["smoke"].find("Live browser smoke against deployed staging")
        if min(parity_in_smoke, browser_restore, browser_test) >= 0 and not (
            parity_in_smoke < browser_restore < browser_test
        ):
            errors.append("staging generation: N/N/N debe cerrarse antes de restaurar Chromium y ejecutar el smoke")

    stale_step = staging_deploy.find("Supersede stale staging commit")
    render_step = staging_deploy.find("Reconcile Render staging configuration")
    frontend_step = staging_deploy.find("Deploy tested frontend to Cloudflare Pages")
    backend_step = staging_deploy.find("Deploy exact backend commit to Render staging")
    worker_step = staging_deploy.find("Deploy exact staging Worker and synchronize shared secret")
    parity_step = staging_deploy.find("Verify staging generation parity before browser smoke")
    browser_restore_step = staging_deploy.find("Restore staging browser runtime")
    smoke_step = staging_deploy.find("Live browser smoke against deployed staging")
    mutations = [render_step, frontend_step, backend_step, worker_step]
    if stale_step >= 0 and all(step >= 0 for step in mutations) and not all(stale_step < step for step in mutations):
        errors.append("staging generation: stale supersede guard no está antes de todas las mutaciones")
    if min(parity_step, browser_restore_step, smoke_step) >= 0 and not (
        parity_step < browser_restore_step < smoke_step
    ):
        errors.append("staging generation: parity/browser-restore/smoke no están en orden fail-closed")

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
    # the deploy helper must wait for both the Render contract and the Custom
    # Domain runtime identity. A generic 200 health response is insufficient.
    require(staging_wrangler, 'main = "worker/staging.js"', "staging Worker wrapper entrypoint", errors)
    require(staging_worker_wrapper, "BUILD_SHA", "staging Worker runtime build field", errors)
    require(staging_worker_wrapper, "./index.js", "staging Worker delegates shared runtime", errors)
    require(staging_worker_deploy, 'secret", "put", "BUILD_SHA"', "staging Worker generation binding", errors)
    require(staging_worker_deploy, "required_deploy_sha()", "staging Worker full SHA validation", errors)
    require(staging_worker_deploy, "def wait_for_render_contract", "staging Worker parallel Render race guard", errors)
    require(staging_worker_deploy, "service_id, secret = wait_for_render_contract(service_id)", "staging Worker waits for valid Render contract", errors)
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

    print("staging-preview-contract OK · preview isolated; admission first; deploy lanes parallel; smoke-integrated N/N/N")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
