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


def run_flux_seam_contracts(root: Path = ROOT) -> None:
    """Validate the dormant Flux seam; network export runs only for matching CI PR diffs."""
    for args in (
        ["scripts/oci_flux_contract.py"],
        ["scripts/oci_flux_admission.py", "--self-test"],
        ["scripts/oci_flux_export.py", "--self-test"],
        ["scripts/oci_flux_export.py", "--ci-if-required"],
    ):
        subprocess.run([sys.executable, "-S", *args], cwd=root, check=True)
    print("OCI dormant Flux seam contracts OK")



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
        "run: make tests security-images compose-smoke",
    )
    missing = [token for token in required if token not in admit_pr]
    if missing:
        raise SystemExit(
            "main-admission exact-HEAD fallback incompleto: " + ", ".join(missing)
        )
    if admit_pr.index("id: pr_admission") > admit_pr.index("name: Full exact-HEAD quality fallback"):
        raise SystemExit("main-admission ejecuta fallback antes de intentar reutilizar Quality")
    print("main-admission exact-HEAD fallback contract: OK")



def validate_cloudflare_auth_rate_limit(root: Path = ROOT) -> None:
    """Keep the Free-tier auth burst guard tested and wired into staging delivery."""
    subprocess.run(
        [sys.executable, "-S", "scripts/cloudflare_auth_rate_limit.py", "--self-test"],
        cwd=root,
        check=True,
    )
    workflow = (root / ".github" / "workflows" / "staging-deploy.yml").read_text(encoding="utf-8")
    required = (
        "name: Validate Cloudflare auth rate-limit contract",
        "python3 -S scripts/cloudflare_auth_rate_limit.py --self-test",
        "name: Reconcile Cloudflare auth rate-limit",
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


def validate_workflow_static_contracts(root: Path = ROOT) -> None:
    """Run always-on static contracts; OCI integration stays conditional on the CI PR surface."""
    main_lineage_self_test()
    promotion_supersede_self_test()
    staging_release_identity_self_test()
    workflow_debt_self_test()
    validate_main_admission_fallback(root)
    validate_cloudflare_auth_rate_limit(root)

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

    run_flux_seam_contracts(root)
    run_oci_required_contracts(root)
    print(
        'workflow-static-contracts OK · lineage + promotion + staging identity + workflow inventory/ratchets'
    )


if __name__ == '__main__':
    validate_workflow_static_contracts()
