#!/usr/bin/env python3
"""Always-on, network-free contracts for workflow/release helper debt."""
from __future__ import annotations

from pathlib import Path

from main_lineage_guard import self_test as main_lineage_self_test
from production_promotion_supersede import self_test as promotion_supersede_self_test
from staging_release_identity import self_test as staging_release_identity_self_test
from workflow_debt_gate import budget_errors, budget_rows, inventory_drift, self_test as workflow_debt_self_test

ROOT = Path(__file__).resolve().parents[1]


def validate_workflow_static_contracts(root: Path = ROOT) -> None:
    """Run only workflow contracts that would otherwise have no always-on owner."""
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

    print(
        'workflow-static-contracts OK · lineage + promotion + staging identity + workflow inventory/ratchets'
    )


if __name__ == '__main__':
    validate_workflow_static_contracts()
