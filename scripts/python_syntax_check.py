#!/usr/bin/env python3
"""Compile Python sources in-memory so syntax checks do not create __pycache__."""
from __future__ import annotations

from pathlib import Path
import sys

ROOTS = (Path('backend-python'), Path('scripts'))
errors: list[str] = []
checked = 0

for root in ROOTS:
    for path in sorted(root.rglob('*.py')):
        if any(part in {'.venv', 'node_modules', '__pycache__'} for part in path.parts):
            continue
        checked += 1
        try:
            source = path.read_text(encoding='utf-8')
            compile(source, str(path), 'exec', dont_inherit=True)
        except Exception as exc:  # SyntaxError plus encoding/IO errors are all gate failures.
            errors.append(f'{path}: {exc}')

if errors:
    print('python-syntax-check FAILED', file=sys.stderr)
    for error in errors:
        print(f'  {error}', file=sys.stderr)
    raise SystemExit(1)

print(f'python-syntax-check OK · {checked} archivos')
