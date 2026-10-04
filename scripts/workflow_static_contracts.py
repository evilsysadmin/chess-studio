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




def validate_resend_bootstrap_topology(root: Path = ROOT) -> None:
    """Keep the Resend one-shot behind staging so OCI mutations cannot cancel each other."""
    workflow = (root / ".github" / "workflows" / "oci-resend-bootstrap.yml").read_text(encoding="utf-8")
    required = (
        "workflows:\n      - Deploy to staging",
        "types:\n      - completed",
        "workflow_dispatch:",
        "name: Detect Resend bootstrap request",
        "git diff --name-only",
        "infra/oci/runtime/resend-bootstrap-v1.txt",
        "needs: trigger",
        "group: oci-staging-mutations",
        "api-staging.chess-studio.shadowops.dpdns.org/api/release",
        "python3 scripts/oci_vault_sync.py sync-current",
        'python3 scripts/oci_release_deploy.py deploy --repo-ref "$staging_sha"',
    )
    missing = [token for token in required if token not in workflow]
    if missing:
        raise SystemExit("Resend bootstrap topology incompleta: " + ", ".join(missing))
    if "\n  push:" in workflow:
        raise SystemExit("Resend bootstrap no debe competir con staging desde push directo")
    print("Resend bootstrap post-staging topology: OK")

def validate_workflow_static_contracts(root: Path = ROOT) -> None:
    """Run always-on static contracts; OCI integration stays conditional on the CI PR surface."""
    main_lineage_self_test()
    promotion_supersede_self_test()
    staging_release_identity_self_test()
    workflow_debt_self_test()
    validate_main_admission_fallback(root)
    validate_staging_frontend_build_single_source(root)
    validate_cloudflare_auth_rate_limit(root)
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
