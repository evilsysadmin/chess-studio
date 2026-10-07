#!/usr/bin/env python3
"""Always-on workflow/release contracts plus protected OCI validation for OCI PRs."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from main_lineage_guard import self_test as main_lineage_self_test
from oci_required_contracts import run_required_contracts as run_oci_required_contracts
from production_promotion_supersede import self_test as promotion_supersede_self_test
from staging_release_identity import self_test as staging_release_identity_self_test
from workflow_debt_gate import budget_errors, budget_rows, inventory_drift, self_test as workflow_debt_self_test

ROOT = Path(__file__).resolve().parents[1]


def validate_main_admission_fallback(root: Path = ROOT) -> None:
    """Keep the expensive exact-HEAD fallback wired without fossil pytest readers."""
    workflow = (root / ".github" / "workflows" / "main-admission.yml").read_text(encoding="utf-8")
    try:
        admit_pr = workflow.split("\n  admit_pr:\n", 1)[1].split("\n  admit_direct:\n", 1)[0]
    except IndexError as exc:
        raise SystemExit("main-admission perdió los jobs admit_pr/admit_direct") from exc

    required = (
        "id: pr_admission",
        "continue-on-error: true",
        "fetch-depth: 0",
        "if: steps.pr_admission.outcome == 'success'",
        "if: steps.pr_admission.outcome == 'failure'",
        "name: Full exact-HEAD quality fallback",
        "name: Cancel superseded composed-main validation",
        '"/repos/$GITHUB_REPOSITORY/actions/runs/$GITHUB_RUN_ID/cancel"',
        "steps.current_main.outputs.current == 'true'",
        # Full Quality · CI gate (--all) on the exact main SHA, in parallel.
        "python3 -S scripts/main_admission_quality_dispatch.py",
        "actions: write",
    )
    missing = [token for token in required if token not in admit_pr]
    if missing:
        raise SystemExit(
            "main-admission exact-HEAD fallback incompleto: " + ", ".join(missing)
        )
    if admit_pr.index("id: pr_admission") > admit_pr.index("name: Full exact-HEAD quality fallback"):
        raise SystemExit("main-admission ejecuta fallback antes de intentar reutilizar Quality")
    subprocess.run(
        [sys.executable, "-S", "scripts/main_admission_quality_dispatch.py", "--self-test"],
        cwd=root,
        check=True,
    )
    print("main-admission exact-HEAD fallback contract: OK")



def validate_staging_frontend_build_single_source(root: Path = ROOT) -> None:
    """Admission prebuild (fast path) and staging deploy (fallback) build the
    staging frontend through one composite action, so the two cannot drift."""
    action = root / ".github" / "actions" / "build-staging-frontend" / "action.yml"
    if not action.is_file():
        raise SystemExit("falta .github/actions/build-staging-frontend")
    workflows = {
        name: (root / ".github" / "workflows" / name).read_text(encoding="utf-8")
        for name in ("main-admission.yml", "staging-deploy.yml")
    }
    for name, text in workflows.items():
        if "uses: ./.github/actions/build-staging-frontend" not in text:
            raise SystemExit(f"{name} debe construir staging con build-staging-frontend")
        if "VITE_BUILD_SHA" in text:
            raise SystemExit(f"{name} vuelve a definir el build de staging inline (VITE_*): usa la action")
    admission = workflows["main-admission.yml"]
    for token in (
        "deploy_required: ${{ steps.deploy_scope.outputs.deploy_required }}",
        "needs: source",
        "if: needs.source.outputs.deploy_required == 'true'",
        'staging_deploy_scope.py --sha "${{ github.sha }}" --source "${{ steps.source.outputs.source }}"',
    ):
        if token not in admission:
            raise SystemExit(f"main-admission perdió el deploy-scope no-runtime: {token}")
    subprocess.run(
        [sys.executable, "-S", "scripts/staging_deploy_scope.py", "--self-test"],
        cwd=root,
        check=True,
    )
    print("staging frontend build/deploy-scope contract: OK")



def validate_main_backend_image_non_runtime_gate(root: Path = ROOT) -> None:
    """Keep non-runtime and unchanged-backend generations off unnecessary ARM work."""
    workflow = (root / ".github" / "workflows" / "main-backend-image.yml").read_text(encoding="utf-8")
    required = (
        "name: Backend · classify admitted deploy surface",
        "runs-on: ubuntu-24.04",
        'python3 -S scripts/staging_deploy_scope.py --sha "$DEPLOY_SHA" --github-output "$GITHUB_OUTPUT"',
        "deploy_required: ${{ steps.scope.outputs.deploy_required }}",
        "backend_needs_build: ${{ steps.image_scope.outputs.backend_needs_build }}",
        "pvp_needs_build: ${{ steps.image_scope.outputs.pvp_needs_build }}",
        'git diff --quiet "$parent" "$DEPLOY_SHA" -- backend-python',
        'git diff --quiet "$parent" "$DEPLOY_SHA" -- backend-go',
        "name: Backend · publish exact-SHA images",
        "needs: classify",
        "ubuntu-24.04-arm",
        "ubuntu-24.04",
        "env.BACKEND_NEEDS_BUILD == 'false'",
        "env.PVP_NEEDS_BUILD == 'false'",
        "Verify reused runtime manifests without pulling layers",
        "Enable arm64 emulation for x86 fallback builds",
        "Set up Buildx only when a build is required",
        "docker pull --platform linux/arm64",
        "packages: write",
    )
    missing = [token for token in required if token not in workflow]
    if missing:
        raise SystemExit("main-backend-image perdió el gate de coste/backend: " + ", ".join(missing))
    classify = workflow.split("\n  classify:\n", 1)[1].split("\n  publish:\n", 1)[0]
    publish = workflow.split("\n  publish:\n", 1)[1]
    if "packages: write" in classify:
        raise SystemExit("el clasificador barato de backend no debe tener permiso packages:write")
    if "runs-on: ubuntu-24.04-arm" in publish:
        raise SystemExit("publish no debe reservar ARM incondicionalmente; runner depende de cambios backend")
    if "scripts/staging_deploy_scope.py" not in classify or "backend-python" not in classify or "backend-go" not in classify:
        raise SystemExit("el clasificador x86 debe resolver deploy y cambios backend antes de elegir runner")
    print("main backend image cost gate: OK")

def validate_app_visual_product_trigger(root: Path = ROOT) -> None:
    """Only product-owned pixel changes may wake the expensive app visual lane."""
    workflow = (root / ".github" / "workflows" / "app-visual-artifact.yml").read_text(encoding="utf-8")
    forbidden = (
        "scripts/*visual*",
        ".github/actions/app-visual-pipeline/**",
    )
    leaked = [token for token in forbidden if token in workflow]
    if leaked:
        raise SystemExit("app-visual vuelve a despertar por tooling: " + ", ".join(leaked))
    for required in (
        "frontend/src/**/*.jsx",
        "frontend/src/**/*.css",
        "frontend/public/**",
        "e2e/*visual*.spec.js",
    ):
        if required not in workflow:
            raise SystemExit("app-visual perdió trigger de producto: " + required)
    for script in (
        "scripts/app_visual_scope.py",
        "scripts/app_visual_producer_scope.py",
        "scripts/app_visual_changed_files.py",
    ):
        subprocess.run([sys.executable, "-S", script, "--self-test"], cwd=root, check=True)
    print("app visual product trigger + tooling ownership: OK")


def validate_cloudflare_auth_rate_limit(root: Path = ROOT) -> None:
    """Keep the Free-tier auth burst guard tested and wired into staging delivery."""
    subprocess.run(
        [sys.executable, "-S", "scripts/cloudflare_auth_rate_limit.py", "--self-test"],
        cwd=root,
        check=True,
    )
    workflow = (root / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
    required = (
        "name: CF auth guard",
        "python3 scripts/cloudflare_auth_rate_limit.py",
        "CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
        "CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    )
    missing = [token for token in required if token not in workflow]
    if missing:
        raise SystemExit(
            "staging perdió el Cloudflare auth rate-limit: " + ", ".join(missing)
        )
    print("Cloudflare auth rate-limit staging wiring: OK")




def validate_pawn_slug_staging_visual_scope(root: Path = ROOT) -> None:
    """Keep Pawn Slug live evidence path-aware without spawning a runner for every staging."""
    subprocess.run(
        [sys.executable, "-S", "scripts/staging_deploy_prepare.py", "--self-test"],
        cwd=root,
        check=True,
    )
    deploy = (root / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
    visual = (root / ".github" / "workflows" / "staging-pawn-slug-visual.yml").read_text(encoding="utf-8")
    deploy_required = (
        "pawn_slug_visual_required:",
        "scripts/staging_deploy_prepare.py",
        "uses: ./.github/workflows/staging-pawn-slug-visual.yml",
        "deploy_sha: ${{ needs.prepare.outputs.deploy_sha }}",
    )
    visual_required = (
        "workflow_call:",
        "workflow_dispatch:",
        "deploy_sha:",
        "scripts/staging_generation.py wait",
    )
    missing = [token for token in deploy_required if token not in deploy]
    missing += [token for token in visual_required if token not in visual]
    if missing:
        raise SystemExit("Pawn Slug staging visual wiring incompleto: " + ", ".join(missing))
    if "workflow_run:" in visual or "workflows:\n      - Deploy to staging" in visual:
        raise SystemExit("Pawn Slug staging visual no debe despertar en cada staging; debe ser reusable/path-aware")
    print("Pawn Slug staging visual scope contract: OK")


def validate_resend_bootstrap_topology(root: Path = ROOT) -> None:
    """Keep Resend recovery scoped by the already-paid staging prepare runner."""
    workflow = (root / ".github" / "workflows" / "oci-resend-bootstrap.yml").read_text(encoding="utf-8")
    staging = (root / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
    required = (
        "workflow_dispatch:",
        "bootstrap_sha:",
        "group: oci-staging-mutations",
        "api-staging.chess-studio.shadowops.dpdns.org/api/release",
        "python3 scripts/oci_vault_sync.py sync-current",
        'python3 scripts/oci_release_deploy.py deploy --repo-ref "$staging_sha"',
    )
    missing = [token for token in required if token not in workflow]
    for token in (
        "resend_bootstrap_required:",
        "gh workflow run oci-resend-bootstrap.yml",
        "scripts/staging_deploy_prepare.py",
    ):
        if token not in staging:
            missing.append(token)
    if missing:
        raise SystemExit("Resend bootstrap topology incompleta: " + ", ".join(missing))
    if "workflow_run:" in workflow or "workflows:\n      - Deploy to staging" in workflow:
        raise SystemExit("Resend bootstrap no debe despertar en cada staging")
    if "\n  push:" in workflow:
        raise SystemExit("Resend bootstrap no debe competir con staging desde push directo")
    subprocess.run(
        [sys.executable, "-S", "scripts/staging_optional_scope.py", "--self-test"],
        cwd=root,
        check=True,
    )
    print("Resend bootstrap scoped dispatch topology: OK")

def validate_workflow_static_contracts(root: Path = ROOT) -> None:
    """Run always-on static contracts; OCI integration stays conditional on the CI PR surface."""
    main_lineage_self_test()
    promotion_supersede_self_test()
    staging_release_identity_self_test()
    workflow_debt_self_test()
    validate_main_admission_fallback(root)
    validate_staging_frontend_build_single_source(root)
    validate_main_backend_image_non_runtime_gate(root)
    validate_app_visual_product_trigger(root)
    validate_cloudflare_auth_rate_limit(root)
    validate_pawn_slug_staging_visual_scope(root)
    validate_resend_bootstrap_topology(root)

    unknown, missing = inventory_drift(root)
    rows = budget_rows(root)
    errors: list[str] = []
    if unknown:
        errors.append('unowned workflows: ' + ', '.join(unknown))
    if missing:
        errors.append('stale workflow inventory entries: ' + ', '.join(missing))
    errors.extend(budget_errors(rows))
    if errors:
        raise SystemExit('Workflow static contracts failed:\n- ' + '\n- '.join(errors))

    run_oci_required_contracts(root)
    print(
        'workflow-static-contracts OK · lineage + promotion + staging identity + workflow inventory/ratchets'
    )


if __name__ == '__main__':
    validate_workflow_static_contracts()
