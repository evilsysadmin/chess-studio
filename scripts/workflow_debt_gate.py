#!/usr/bin/env python3
"""Keep GitHub workflow ownership and size debt under one fail-closed gate."""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Budget:
    path: str
    max_bytes: int


INVENTORY = {
    'app-visual-artifact.yml': 'visual-artifact',
    'blender-setup-smoke.yml': 'art-generation-infra',
    'billing-cost-export.yml': 'observability',
    'branch-housekeeping.yml': 'housekeeping',
    'chronicles-party-blender-art.yml': 'art-generation',
    'cicd.yml': 'quality-required',
    'cloudflare-prometheus-exporter.yml': 'observability',
    'coverage.yml': 'quality-scheduled',
    'e2e-full.yml': 'quality-scheduled',
    'grafana-dashboards.yml': 'observability',
    'home-matthias-blender-art.yml': 'art-generation',
    'home-blender-v2-preview.yml': 'art-generation',
    'home-blender-v2-runtime.yml': 'art-generation',
    'home-r2-assets.yml': 'infra-assets',
    'main-admission.yml': 'delivery-admission',
    'oci-readiness.yml': 'infra-readiness',
    'oci-staging-deploy.yml': 'infra-staging-delivery',
    'oci-staging-lab.yml': 'infra-staging-lifecycle',
    'oci-staging-service.yml': 'infra-staging-service-control',
    'oci-staging-tunnel.yml': 'infra-staging-edge',
    'oci-vault-cutover-once.yml': 'infra-staging-migration',
    'pawn-slug-enemy-blender-art.yml': 'art-generation',
    'pawn-slug-godot-web.yml': 'game-runtime-delivery',
    'pawn-slug-godot-strict-atlas.yml': 'art-generation',
    'pawn-slug-godot-strict-v9.yml': 'art-generation',
    'pawn-slug-godot-strict-v10.yml': 'art-generation',
    'pawn-slug-godot-strict-v11.yml': 'art-generation',
    'pawn-slug-godot-strict-v12.yml': 'art-generation',
    'pawn-slug-godot-strict-v13.yml': 'art-generation',
    'pawn-slug-godot-strict-v14.yml': 'art-generation',
    'pawn-slug-matthias-sprite-smoke.yml': 'visual-staging-evidence',
    'pawn-slug-pow-blender-art.yml': 'art-generation',
    'production-promote.yml': 'delivery-production',
    'production-rollback.yml': 'delivery-rollback',
    'production-target-smoke.yml': 'delivery-observability',
    'r2-assets-infra.yml': 'infra-assets',
    'render-production-guardrail.yml': 'delivery-guardrail',
    'staging-ai-worker.yml': 'delivery-accreditation',
    'staging-deploy.yml': 'delivery-staging',
    'staging-pawn-slug-visual.yml': 'visual-staging-evidence',
    'staging-preview.yml': 'delivery-preview',
    'synthetic-health.yml': 'observability',
    'war-room-blender-art.yml': 'art-generation',
}

BUDGETS = (
    Budget('.github/workflows/production-promote.yml', 34516),
    Budget('.github/workflows/cicd.yml', 19454),
    Budget('.github/workflows/staging-deploy.yml', 25880),
    Budget('.github/workflows/staging-ai-worker.yml', 7227),
    Budget('.github/workflows/cloudflare-prometheus-exporter.yml', 5964),
    Budget('.github/workflows/oci-readiness.yml', 2840),
    Budget('.github/workflows/app-visual-artifact.yml', 1108),
    Budget('.github/workflows/branch-housekeeping.yml', 652),
)


def workflow_names(root: Path) -> set[str]:
    directory = root / '.github' / 'workflows'
    if not directory.is_dir():
        raise FileNotFoundError('missing workflow directory: .github/workflows')
    return {path.name for path in directory.glob('*.yml') if path.is_file()}


def inventory_drift(root: Path, inventory: dict[str, str] = INVENTORY) -> tuple[list[str], list[str]]:
    actual = workflow_names(root)
    expected = set(inventory)
    return sorted(actual - expected), sorted(expected - actual)


def budget_rows(root: Path, budgets: tuple[Budget, ...] = BUDGETS) -> list[tuple[Budget, int]]:
    rows: list[tuple[Budget, int]] = []
    for budget in budgets:
        target = root / budget.path
        if not target.is_file():
            raise FileNotFoundError(f'missing workflow: {budget.path}')
        rows.append((budget, target.stat().st_size))
    return rows


def budget_errors(rows: list[tuple[Budget, int]]) -> list[str]:
    return [
        f'{budget.path}: {size} bytes exceeds ratchet {budget.max_bytes} by {size - budget.max_bytes}'
        for budget, size in rows
        if size > budget.max_bytes
    ]


def render(inventory: dict[str, str], rows: list[tuple[Budget, int]]) -> str:
    lines = [
        '### Workflow ownership inventory',
        '',
        '| Workflow | Domain |',
        '| --- | --- |',
    ]
    for name, domain in sorted(inventory.items()):
        lines.append(f'| `{name}` | `{domain}` |')

    lines.extend([
        '',
        '### Workflow debt ratchet',
        '',
        '| Workflow | Bytes | Budget | Delta |',
        '| --- | ---: | ---: | ---: |',
    ])
    for budget, size in rows:
        lines.append(f'| `{budget.path}` | {size} | {budget.max_bytes} | {size - budget.max_bytes:+d} |')
    return '\n'.join(lines) + '\n'


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        workflow_dir = root / '.github' / 'workflows'
        workflow_dir.mkdir(parents=True)
        (workflow_dir / 'a.yml').write_bytes(b'123')
        (workflow_dir / 'b.yml').write_bytes(b'123456')

        inventory = {'a.yml': 'quality', 'b.yml': 'delivery'}
        budgets = (
            Budget('.github/workflows/a.yml', 3),
            Budget('.github/workflows/b.yml', 5),
        )
        assert inventory_drift(root, inventory) == ([], [])
        rows = budget_rows(root, budgets)
        assert rows[0][1] == 3 and rows[1][1] == 6
        assert budget_errors(rows) == [
            '.github/workflows/b.yml: 6 bytes exceeds ratchet 5 by 1'
        ]
        report = render(inventory, rows)
        assert '`a.yml` | `quality`' in report
        assert '| 6 | 5 | +1 |' in report

        (workflow_dir / 'rogue.yml').write_text('name: rogue\n', encoding='utf-8')
        assert inventory_drift(root, inventory) == (['rogue.yml'], [])
        (workflow_dir / 'rogue.yml').unlink()
        (workflow_dir / 'b.yml').unlink()
        assert inventory_drift(root, inventory) == ([], ['b.yml'])

        try:
            budget_rows(root, (Budget('.github/workflows/missing.yml', 1),))
        except FileNotFoundError as exc:
            assert 'missing workflow' in str(exc)
        else:
            raise AssertionError('missing budgeted workflows must fail closed')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.', help='repository root')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        print('workflow debt self-test: OK')
        return 0

    root = Path(args.root).resolve()
    try:
        unknown, missing = inventory_drift(root)
        rows = budget_rows(root)
    except FileNotFoundError as exc:
        print(f'::error::{exc}', file=sys.stderr)
        return 2

    report = render(INVENTORY, rows)
    print(report, end='')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as fh:
            fh.write(report)

    errors: list[str] = []
    if unknown:
        errors.append(
            'Unowned workflows: ' + ', '.join(unknown) +
            '. Add each workflow to INVENTORY with an explicit domain before merging.'
        )
    if missing:
        errors.append(
            'Stale workflow inventory entries: ' + ', '.join(missing) +
            '. Remove inventory entries when workflows are retired.'
        )
    errors.extend(budget_errors(rows))

    for error in errors:
        print(f'::error::{error}', file=sys.stderr)
    if errors:
        if any('exceeds ratchet' in error for error in errors):
            print(
                'Reduce the workflow or deliberately lower a ratchet after an extraction; '
                'do not raise it to make CI green.',
                file=sys.stderr,
            )
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
