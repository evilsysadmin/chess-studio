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
    """Validate the dormant Flux seam without touching the cluster or OCI host."""
    subprocess.run(
        [sys.executable, "-S", "scripts/oci_flux_contract.py"],
        cwd=root,
        check=True,
    )
    subprocess.run(
        [sys.executable, "-S", "scripts/oci_flux_admission.py", "--self-test"],
        cwd=root,
        check=True,
    )
    print("OCI dormant Flux seam contracts OK")


def validate_workflow_static_contracts(root: Path = ROOT) -> None:
    """Run always-on static contracts; OCI integration stays conditional on the CI PR surface."""
    main_lineage_self_test()
    promotion_supersede_self_test()
    staging_release_identity_self_test()
    workflow_debt_self_test()

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
