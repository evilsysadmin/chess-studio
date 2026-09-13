#!/usr/bin/env python3
"""Fail CI when GitHub workflows drift outside the explicit ownership inventory."""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path


INVENTORY = {
    'app-visual-artifact.yml': 'visual-artifact',
    'branch-housekeeping.yml': 'housekeeping',
    'chesscom-visual-artifact.yml': 'visual-artifact',
    'cicd.yml': 'quality-required',
    'cloudflare-prometheus-exporter.yml': 'observability',
    'codeql.yml': 'security-signal',
    'coverage.yml': 'quality-scheduled',
    'e2e-full.yml': 'quality-scheduled',
    'grafana-dashboards.yml': 'observability',
    'main-admission.yml': 'delivery-admission',
    'oci-readiness.yml': 'infra-readiness',
    'offline-pending-move-reconnect.yml': 'targeted-network-regression',
    'production-promote.yml': 'delivery-production',
    'production-rollback.yml': 'delivery-rollback',
    'render-production-guardrail.yml': 'delivery-guardrail',
    'staging-ai-worker.yml': 'delivery-accreditation',
    'staging-bootstrap.yml': 'delivery-escape-hatch',
    'staging-deploy.yml': 'delivery-staging',
    'staging-preview.yml': 'delivery-preview',
    'synthetic-health.yml': 'observability',
    'war-room-runtime-marathon.yml': 'soak-regression',
    'workflow-debt.yml': 'quality-meta',
}


def discover(root: Path) -> set[str]:
    directory = root / '.github' / 'workflows'
    if not directory.is_dir():
        raise FileNotFoundError('missing workflow directory: .github/workflows')
    return {path.name for path in directory.glob('*.yml') if path.is_file()}


def inspect(root: Path, inventory: dict[str, str] = INVENTORY) -> tuple[list[str], list[str]]:
    actual = discover(root)
    expected = set(inventory)
    return sorted(actual - expected), sorted(expected - actual)


def render(inventory: dict[str, str] = INVENTORY) -> str:
    lines = [
        '### Workflow ownership inventory',
        '',
        '| Workflow | Domain |',
        '| --- | --- |',
    ]
    for name, domain in sorted(inventory.items()):
        lines.append(f'| `{name}` | `{domain}` |')
    return '\n'.join(lines) + '\n'


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        workflow_dir = root / '.github' / 'workflows'
        workflow_dir.mkdir(parents=True)
        (workflow_dir / 'a.yml').write_text('name: a\n', encoding='utf-8')
        (workflow_dir / 'b.yml').write_text('name: b\n', encoding='utf-8')
        inventory = {'a.yml': 'quality', 'b.yml': 'delivery'}
        assert inspect(root, inventory) == ([], [])

        (workflow_dir / 'rogue.yml').write_text('name: rogue\n', encoding='utf-8')
        assert inspect(root, inventory) == (['rogue.yml'], [])
        (workflow_dir / 'rogue.yml').unlink()
        (workflow_dir / 'b.yml').unlink()
        assert inspect(root, inventory) == ([], ['b.yml'])

        report = render(inventory)
        assert '`a.yml` | `quality`' in report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.', help='repository root')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        print('workflow inventory self-test: OK')
        return 0

    root = Path(args.root).resolve()
    try:
        unknown, missing = inspect(root)
    except FileNotFoundError as exc:
        print(f'::error::{exc}', file=sys.stderr)
        return 2

    report = render()
    print(report, end='')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as fh:
            fh.write(report)

    if unknown:
        print(
            '::error::Unowned workflows: ' + ', '.join(unknown) +
            '. Add each workflow to INVENTORY with an explicit domain before merging.',
            file=sys.stderr,
        )
    if missing:
        print(
            '::error::Stale workflow inventory entries: ' + ', '.join(missing) +
            '. Remove inventory entries when workflows are retired.',
            file=sys.stderr,
        )
    return 1 if unknown or missing else 0


if __name__ == '__main__':
    raise SystemExit(main())
