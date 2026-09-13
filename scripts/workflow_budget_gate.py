#!/usr/bin/env python3
"""Fail CI when large GitHub workflows grow past their ratcheted baseline.

This intentionally uses byte budgets rather than YAML semantics. The goal is not to
judge whether a workflow is 'good' by size; it is to stop known orchestration
hotspots from silently growing while they are being decomposed.
"""

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


BUDGETS = (
    Budget('.github/workflows/production-promote.yml', 35727),
    Budget('.github/workflows/cicd.yml', 22564),
    Budget('.github/workflows/staging-deploy.yml', 25880),
    Budget('.github/workflows/staging-ai-worker.yml', 8000),
    Budget('.github/workflows/cloudflare-prometheus-exporter.yml', 5964),
    Budget('.github/workflows/oci-readiness.yml', 2840),
    Budget('.github/workflows/app-visual-artifact.yml', 2123),
    Budget('.github/workflows/chesscom-visual-artifact.yml', 1490),
    Budget('.github/workflows/war-room-runtime-marathon.yml', 2464),
    Budget('.github/workflows/branch-housekeeping.yml', 652),
)


def inspect(root: Path, budgets: tuple[Budget, ...] = BUDGETS) -> list[tuple[Budget, int]]:
    rows: list[tuple[Budget, int]] = []
    for budget in budgets:
        target = root / budget.path
        if not target.is_file():
            raise FileNotFoundError(f'missing workflow: {budget.path}')
        rows.append((budget, target.stat().st_size))
    return rows


def render(rows: list[tuple[Budget, int]]) -> str:
    lines = [
        '### Workflow debt ratchet',
        '',
        '| Workflow | Bytes | Budget | Delta |',
        '| --- | ---: | ---: | ---: |',
    ]
    for budget, size in rows:
        lines.append(f'| `{budget.path}` | {size} | {budget.max_bytes} | {size - budget.max_bytes:+d} |')
    return '\n'.join(lines) + '\n'


def check(rows: list[tuple[Budget, int]]) -> list[str]:
    return [
        f'{budget.path}: {size} bytes exceeds ratchet {budget.max_bytes} by {size - budget.max_bytes}'
        for budget, size in rows
        if size > budget.max_bytes
    ]


def self_test() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        budgets = (
            Budget('a.yml', 3),
            Budget('b.yml', 5),
        )
        (root / 'a.yml').write_bytes(b'123')
        (root / 'b.yml').write_bytes(b'123456')
        rows = inspect(root, budgets)
        assert rows[0][1] == 3
        assert rows[1][1] == 6
        errors = check(rows)
        assert errors == ['b.yml: 6 bytes exceeds ratchet 5 by 1']
        report = render(rows)
        assert '`a.yml`' in report and '| 6 | 5 | +1 |' in report

        try:
            inspect(root, (Budget('missing.yml', 1),))
        except FileNotFoundError as exc:
            assert 'missing workflow' in str(exc)
        else:
            raise AssertionError('missing workflows must fail closed')


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='.', help='repository root')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args(argv)

    if args.self_test:
        self_test()
        print('workflow budget self-test: OK')
        return 0

    root = Path(args.root).resolve()
    try:
        rows = inspect(root)
    except FileNotFoundError as exc:
        print(f'::error::{exc}', file=sys.stderr)
        return 2

    report = render(rows)
    print(report, end='')
    summary = os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        with Path(summary).open('a', encoding='utf-8') as fh:
            fh.write(report)

    errors = check(rows)
    if errors:
        for error in errors:
            print(f'::error::{error}', file=sys.stderr)
        print('Reduce the workflow or deliberately lower a ratchet after an extraction; do not raise it to make CI green.', file=sys.stderr)
        return 1

    return 0


if __name__ == '__main__':
    raise SystemExit(main())
