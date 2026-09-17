#!/usr/bin/env python3
"""Fail closed if staging preview/deploy topology can violate release isolation."""
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
STAGING_RELEASE_IDENTITY = ROOT / "scripts/staging_release_identity.py"
OCI_RUN_COMMAND = ROOT / "scripts/oci_run_command.py"
OCI_RELEASE_DEPLOY = ROOT / "scripts/oci_release_deploy.py"
OCI_RUNTIME_BUNDLE = ROOT / "scripts/oci_runtime_bundle.py"

STAGING_WRITE_MUTEX = "concurrency:\n  group: chess-studio-staging-deploy\n  cancel-in-progress: false"
OCI_MUTATION_MUTEX = "concurrency:\n      group: oci-staging-mutations\n      cancel-in-progress: false"


def require(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle not in text:
        errors.append(f"{label}: falta {needle!r}")


def forbid(text: str, needle: str, label: str, errors: list[str]) -> None:
    if needle in text:
        errors.append(f"{label}: conserva {needle!r}")


def split_jobs(workflow: str, names: tuple[str, ...], errors: list[str]) -> dict[str, str]:
    markers = {name: f"\n  {name}:\n" for name in names}
    positions = {name: workflow.find(marker) for name, marker in markers.items()}
    missing = sorted(name for name, position in positions.items() if position < 0)
    if missing:
        errors.append(f"staging generation: faltan jobs para auditar topología: {missing}")
        return {}

    blocks: dict[str, str] = {}
    for index, name in enumerate(names):
        start = positions[name]
        end = positions[names[index + 1]] if index + 1 < len(names) else len(workflow)
        blocks[name] = workflow[start:end]
    return blocks


def main() -> int:
    errors: list[str] = []
    paths = (
        PREVIEW,
        STAGING_DEPLOY,
        STAGING_AI,
        PROMOTE,
        STAGING_WRANGLER,
        STAGING_WORKER_WRAPPER,
        STAGING_WORKER_DEPLOY,
        STAGING_RELEASE_IDENTITY,
        OCI_RUN_COMMAND,
        OCI_RELEASE_DEPLOY,
        OCI_RUNTIME_BUNDLE,
    )
    for path in paths:
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
    staging_release_identity = STAGING_RELEASE_IDENTITY.read_text(encoding="utf-8")
    oci_run_command = OCI_RUN_COMMAND.read_text(encoding="utf-8")
    oci_release_deploy = OCI_RELEASE_DEPLOY.read_text(encoding="utf-8")
    oci_runtime_bundle = OCI_RUNTIME_BUNDLE.read_text(encoding="utf-8")

    # Preview remains manual and frontend-only.
    for needle, label in (
        ("name: Staging · preview", "workflow name"),
        ("workflow_dispatch:", "manual-only trigger"),
        ("- preview\n          - restore-main", "preview/restore mode allowlist"),
        ("TARGET_REF: ${{ inputs.mode == 'restore-main' && 'main' || inputs.ref }}", "target ref selection"),
        ("ORCHESTRATOR_REF: ${{ github.ref }}", "orchestrator provenance"),
        ("refs/heads/main", "orchestrator main-only guard"),
        ("PAGES_PROJECT: chess-studio-staging", "staging Pages project"),
        ("STAGING_URL: https://staging.chess-studio.shadowops.dpdns.org", "canonical staging URL"),
        ("path: preview-source", "isolated target checkout"),
        ("main no es un preview; usa el modo restore-main", "preview main refusal"),
        ("restore-main resolvió", "restore exact-main guard"),
        ("production_branch != 'main'", "Pages production branch verification"),
        ("--branch main", "canonical staging frontend deployment"),
        ("Staging no sirve el SHA solicitado", "live build identity gate"),
        ("No acreditado:", "non-accreditation summary"),
        (STAGING_WRITE_MUTEX, "preview staging write mutex"),
    ):
        require(preview, needle, label, errors)
    for needle in (
        "workflow_run:",
        "pull_request:",
        "\npush:",
        "RENDER_API_KEY",
        "render_staging_bootstrap.py",
        "deploy_staging_ai_worker.py",
    ):
        forbid(preview, needle, "preview/restore contiene trigger o mutación prohibida", errors)

    # Canonical staging admits one immutable main generation before any mutation.
    for needle, label in (
        (STAGING_WRITE_MUTEX, "canonical staging write mutex"),
        ("name: Prepare coherent staging generation", "canonical generation prepare job"),
        ("Supersede stale staging commit", "single stale guard before mutation"),
        ("permissions:\n  contents: read", "read-only workflow permissions"),
        ("admitted: ${{ steps.admission.outputs.admitted }}", "admission output"),
        ("git ls-remote origin refs/heads/main", "main head admission probe"),
        ("admitted=false", "superseded clean exit"),
        ("admitted=true", "admitted generation state"),
        ("::notice title=Staging superseded", "stale supersede non-error diagnostic"),
        ("Deploy exact backend commit to OCI staging", "generation OCI backend deploy"),
        ('python3 scripts/oci_release_deploy.py deploy --repo-ref "$DEPLOY_SHA"', "OCI release-only deploy owns transport readiness"),
        ("Deploy tested frontend to Cloudflare Pages", "generation frontend deploy"),
        ("Deploy exact staging Worker generation", "generation Worker deploy"),
        ("run: python3 scripts/deploy_staging_ai_worker.py", "generation Worker helper"),
        ("Verify staging generation parity before browser smoke", "generation parity gate"),
        ("'worker': str(ai.get('build')", "generation Worker SHA parity"),
        ("Load ephemeral staging invite code from OCI runtime", "smoke invite source"),
        ("Generate isolated staging smoke credentials", "smoke random credentials"),
        ("Live browser smoke against deployed staging", "generation live smoke"),
    ):
        require(staging_deploy, needle, label, errors)

    # Render production remains valid elsewhere, but the canonical staging release
    # must not need Render availability, identities or API credentials at all.
    for needle in (
        "RENDER_API_KEY",
        "RENDER_SERVICE_ID",
        "render_staging_bootstrap.py",
        "Resolve legacy Render service id read-only",
        "render_service_id:",
        "actions: write",
        "GH_TOKEN:",
        "/actions/runs/$GITHUB_RUN_ID/cancel",
        "while :; do",
        "Wait for OCI infrastructure mutations to quiesce",
        "actions/workflows/oci-staging-deploy.yml/runs",
        "Wait for OCI Run Command registration",
        "for attempt in $(seq 1 60)",
        "grep -Fq 'Plugin Compute Instance Run Command not present for instance'",
        "Legacy contract marker",
        "Legacy contract phrase",
    ):
        forbid(staging_deploy, needle, "staging generation conserva dependencia/orchestration legado prohibido", errors)
    forbid(
        staging_deploy,
        'python3 scripts/oci_run_command.py deploy --repo-ref "$DEPLOY_SHA"',
        "canonical staging usa el deploy legacy que rematerializa runtime",
        errors,
    )

    # Transport owns the bounded registration wait; the release-only helper opts
    # into it while orchestration itself never polls Run Command registration.
    for needle, label in (
        ("PLUGIN_REGISTRATION_TIMEOUT_SECONDS = 300", "Run Command bounded registration wait"),
        ("PLUGIN_REGISTRATION_RETRY_SECONDS = 5", "Run Command registration retry cadence"),
        ("def plugin_registration_is_pending", "Run Command missing-plugin classifier"),
        ("wait_for_registration: bool = False", "Run Command opt-in readiness wait"),
    ):
        require(oci_run_command, needle, label, errors)
    for needle, label in (
        ("def release_command", "release-only command builder"),
        ("diagnose_plugin(oci, config, wait_for_registration=True)", "release deploy enables bounded readiness wait"),
        ("sudo --non-interactive", "release deploy privileged stable wrapper call"),
    ):
        require(oci_release_deploy, needle, label, errors)
    for needle in (
        "ObjectStorageClient",
        "InstancePrincipalsSecurityTokenSigner",
        "chess-studio-install-runtime",
        "backend.env",
        "COMMIT_SHA=",
        "pip install",
    ):
        forbid(oci_release_deploy, needle, "release helper contiene acoplamiento de runtime prohibido", errors)

    # The private runtime reader is intentionally tiny and allowlisted.
    for needle, label in (
        ('RUNNER_READABLE_KEYS = frozenset({"CHESS_AI_SHARED_SECRET", "INVITE_CODE"})', "runtime reader allowlist"),
        ("Runtime bucket must remain NoPublicAccess", "runtime private bucket guard"),
        ("Runtime bucket versioning must remain Disabled", "runtime non-versioned secret guard"),
        ("MAX_RUNTIME_BYTES = 65536", "runtime size bound"),
        ("def read_private_runtime_value", "runtime single-value reader"),
    ):
        require(oci_runtime_bundle, needle, label, errors)

    names = ("prepare", "backend", "frontend", "worker", "smoke", "summary")
    blocks = split_jobs(staging_deploy, names, errors)
    if blocks:
        forbid(staging_deploy, "\n  render_reconcile:\n", "staging generation: Render reconcile volvió a job separado", errors)
        forbid(staging_deploy, "\n  parity:\n", "staging generation: parity volvió a job separado", errors)

        for name in ("backend", "frontend", "worker", "smoke", "summary"):
            require(
                blocks[name],
                "if: needs.prepare.outputs.admitted == 'true'",
                f"{name} respeta admission",
                errors,
            )

        require(blocks["backend"], "needs: prepare", "backend arranca tras admission", errors)
        require(blocks["backend"], OCI_MUTATION_MUTEX, "backend comparte mutex OCI con Terraform", errors)
        require(
            blocks["backend"],
            "python3 -S scripts/oci_release_deploy.py --self-test",
            "backend valida helper release-only",
            errors,
        )
        for needle in (
            "RENDER_API_KEY",
            "render_staging_bootstrap",
            "render_service_id",
            "oci_runtime_config.py",
            "chess-studio-install-runtime",
            "ObjectStorageClient",
            "oci_run_command.py deploy",
        ):
            forbid(blocks["backend"], needle, "backend release no materializa runtime ni depende de Render", errors)

        require(blocks["frontend"], "needs: prepare", "Pages arranca tras admission", errors)
        require(blocks["worker"], "needs: prepare", "Worker arranca tras admission", errors)
        for needle in ("RENDER_API_KEY", "--service-id", "render_reconcile"):
            forbid(blocks["worker"], needle, "Worker no depende de Render", errors)

        require(
            blocks["smoke"],
            "needs: [prepare, backend, frontend, worker]",
            "smoke espera las tres ramas de deploy",
            errors,
        )
        for needle, label in (
            ("OCI_TENANCY_OCID: ${{ secrets.OCI_TENANCY_OCID }}", "smoke OCI tenancy credential"),
            ("uses: ./.github/actions/setup-oci-sdk", "smoke OCI SDK toolchain"),
            ("from oci_runtime_bundle import read_private_runtime_value", "smoke private runtime reader"),
            ("read_private_runtime_value(oci, 'INVITE_CODE')", "smoke invite allowlisted read"),
            ("secrets.token_hex(8)", "smoke random username entropy"),
            ("secrets.token_urlsafe(32)", "smoke random password entropy"),
        ):
            require(blocks["smoke"], needle, label, errors)
        for needle in ("RENDER_API_KEY", "RENDER_SERVICE_ID", "render_staging_bootstrap"):
            forbid(blocks["smoke"], needle, "smoke no depende de Render", errors)

        require(
            blocks["summary"],
            "needs: [prepare, backend, frontend, worker, smoke]",
            "summary espera deploy lanes + browser smoke",
            errors,
        )

        parity = blocks["smoke"].find("Verify staging generation parity before browser smoke")
        browser_restore = blocks["smoke"].find("Restore staging browser runtime")
        browser_test = blocks["smoke"].find("Live browser smoke against deployed staging")
        if min(parity, browser_restore, browser_test) >= 0 and not parity < browser_restore < browser_test:
            errors.append("staging generation: N/N/N debe cerrarse antes de restaurar Chromium y ejecutar smoke")

        if parity >= 0 and browser_test > parity:
            parity_block = blocks["smoke"][parity:browser_test]
            for needle, label in (
                ("parity_ok=false", "generation parity retry state"),
                ("for attempt in {1..60}; do", "generation parity bounded polling"),
                ("Staging generation aún no converge:", "generation parity skew diagnostics"),
                ("Generation parity no convergió a N/N/N tras 5 minutos", "generation parity bounded timeout"),
            ):
                require(parity_block, needle, label, errors)

    stale_step = staging_deploy.find("Supersede stale staging commit")
    backend_step = staging_deploy.find("Deploy exact backend commit to OCI staging")
    frontend_step = staging_deploy.find("Deploy tested frontend to Cloudflare Pages")
    worker_step = staging_deploy.find("run: python3 scripts/deploy_staging_ai_worker.py")
    if stale_step >= 0 and all(step >= 0 for step in (backend_step, frontend_step, worker_step)):
        if not all(stale_step < step for step in (backend_step, frontend_step, worker_step)):
            errors.append("staging generation: stale supersede guard no está antes de todas las ramas operativas")
    if "::error::CI aprobó" in staging_deploy:
        errors.append("staging generation: un SHA superseded vuelve a clasificarse como error")

    # Worker releases preserve the long-lived shared secret. Code deploy validates
    # that it exists, binds BUILD_SHA in the same deploy and waits for exact SHA.
    for needle, label in (
        ('main = "worker/staging.js"', "staging Worker wrapper entrypoint"),
        ('required = ["CHESS_AI_SHARED_SECRET"]', "staging Worker required persistent secret"),
    ):
        require(staging_wrangler, needle, label, errors)
    require(staging_worker_wrapper, "BUILD_SHA", "staging Worker runtime build field", errors)
    require(staging_worker_wrapper, "./index.js", "staging Worker delegates shared runtime", errors)
    require(staging_worker_deploy, "required_deploy_sha()", "staging Worker full SHA validation", errors)
    require(
        staging_worker_deploy,
        'wrangler(["deploy", "--var", f"BUILD_SHA:{deploy_sha}"])',
        "staging Worker code+generation single deploy",
        errors,
    )
    require(staging_worker_deploy, "def wait_for_runtime_build", "staging Worker propagation wait", errors)
    require(staging_worker_deploy, "wait_for_runtime_build(deploy_sha)", "staging Worker runtime identity gate", errors)
    require(staging_worker_deploy, "last_build == deploy_sha", "staging Worker exact runtime SHA convergence", errors)
    for needle in ("render_staging_bootstrap", "RENDER_API_KEY", "wait_for_render_contract"):
        forbid(staging_worker_deploy, needle, "staging Worker conserva dependencia Render prohibida", errors)
    forbid(
        staging_worker_deploy,
        'wrangler(["secret", "put", "CHESS_AI_SHARED_SECRET"]',
        "staging Worker no debe rotar secreto en cada release",
        errors,
    )

    # Production remains a daily release train over immutable staging accreditation.
    for needle, label in (
        ("schedule:", "production daily schedule"),
        ("- cron: '0 6,7 * * *'", "production CET/CEST UTC pair"),
        ("Release train · 08:00 Europe/Madrid", "production Madrid release window"),
        ("workflow_dispatch:", "production manual hotfix path"),
        ("La promoción manual sólo puede salir de main", "production manual main-only guard"),
        ("Resolve latest immutable staging accreditation", "production accreditation selector"),
        ("staging-promotion-accreditation", "production immutable staging proof"),
        (
            "actions/workflows/staging-ai-worker.yml/runs?event=workflow_run&status=success&branch=main&per_page=100",
            "production automatic staging source",
        ),
        ("Snapshot: `fijo al arrancar; no persigue acreditaciones posteriores`", "production fixed release snapshot"),
    ):
        require(promote, needle, label, errors)
    forbid(promote, "Staging · preview", "production-promote escucha preview", errors)

    # Staging AI is read-only accreditation downstream of canonical staging deploy.
    for needle, label in (
        ("workflows:\n      - Staging · deploy", "staging AI canonical source"),
        ("UPSTREAM_EVENT", "staging AI upstream provenance guard"),
        ("Accredit coherent staging generation", "staging AI read-only accreditation"),
        ("Verify staging backend still serves approved SHA", "staging AI backend attestation"),
        ("Verify staging frontend still serves approved SHA", "staging AI frontend attestation"),
        ("Verify staging AI health and build identity", "staging AI runtime Worker attestation"),
        ("scripts/staging_release_identity.py", "staging AI shared identity helper"),
        ("--kind backend", "staging AI backend exact identity path"),
        ("--kind frontend", "staging AI frontend exact identity path"),
        ("--kind ai", "staging AI Worker exact identity path"),
    ):
        require(staging_ai, needle, label, errors)
    require(staging_release_identity, 'payload.get("build")', "staging exact SHA helper build check", errors)
    require(staging_release_identity, "validate_health_payload", "staging AI shared health contract", errors)
    forbid(staging_ai, "deploy_staging_ai_worker.py", "staging AI accreditation vuelve a desplegar Worker", errors)
    forbid(staging_ai, "Refuse stale staging Worker commit", "staging AI contiene stale guard tardío", errors)
    forbid(staging_ai, "Staging · preview", "staging AI escucha preview", errors)

    if errors:
        print("staging-preview-contract FAIL", file=sys.stderr)
        for error in errors:
            print(f" - {error}", file=sys.stderr)
        return 1

    print(
        "staging-preview-contract OK · preview isolated; queued admission; native OCI mutex; "
        "Render-free canonical release; release/runtime decoupled; persistent Worker secret; smoke-integrated N/N/N"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
