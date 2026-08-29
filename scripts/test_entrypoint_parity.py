#!/usr/bin/env python3
"""Fail fast when local test entrypoints and GitHub CI drift apart."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
makefile = (ROOT / 'Makefile').read_text(encoding='utf-8')
ci = (ROOT / '.github/workflows/cicd.yml').read_text(encoding='utf-8')

dockerfile = (ROOT / 'Dockerfile.test').read_text(encoding='utf-8')
dockerignore = (ROOT / '.dockerignore').read_text(encoding='utf-8')
if 'CMD ["make", "test-all-local"]' not in dockerfile:
    raise SystemExit('Dockerfile.test debe terminar delegando en make test-all-local')
for token in ['**/node_modules', '.venv', '**/test-results', '.env.*']:
    if token not in dockerignore:
        raise SystemExit(f'.dockerignore no protege el runner reproducible: falta {token}')
if any(line.strip() in {'.github', '.github/'} for line in dockerignore.splitlines()):
    raise SystemExit('.dockerignore no puede excluir .github: el runner Docker necesita auditar el wiring real de CI')

required_make_targets = [
    'bootstrap-test:',
    'test-all-local:',
    'e2e-critical:',
    'test-frontend:',
    'test-backend-smoke:',
    'test-backend-integration:',
    'static-preflight:',
]
for target in required_make_targets:
    if target not in makefile:
        raise SystemExit(f'Makefile perdió el entrypoint reproducible: {target}')

local_block = re.search(r'^test-all-local:(.*?)(?=\n[^\t# ].*?:|\Z)', makefile, re.M | re.S)
if not local_block:
    raise SystemExit('No se pudo inspeccionar test-all-local')
local = local_block.group(0)
for family in ['static-preflight', 'test-frontend', 'test-backend-smoke', 'test-backend-integration', 'backend-check', 'e2e-critical']:
    if family not in local:
        raise SystemExit(f'test-all-local no incluye la familia crítica: {family}')

for command in ['make static-preflight', 'make test-frontend', 'make test-backend-smoke', 'make test-backend-integration', 'make backend-check', 'make e2e-critical']:
    if command not in ci:
        raise SystemExit(f'CI se ha desalineado del entrypoint local: falta `{command}`')

if 'CRITICAL_E2E_GREP :=' not in makefile:
    raise SystemExit('El grep E2E crítico debe vivir en Makefile como contrato único')
if '--grep "login → menú' in ci:
    raise SystemExit('CI volvió a duplicar el grep E2E en YAML; usa `make e2e-critical`')

print('Test entrypoint parity OK: local y CI comparten Make targets críticos.')
