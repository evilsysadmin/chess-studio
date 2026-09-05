#!/usr/bin/env python3
"""Fail fast when local test entrypoints and GitHub CI drift apart."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
makefile = (ROOT / 'Makefile').read_text(encoding='utf-8')
ci = (ROOT / '.github/workflows/cicd.yml').read_text(encoding='utf-8')


def playwright_test_titles(relative_path: str) -> list[str]:
    source = (ROOT / 'e2e' / relative_path).read_text(encoding='utf-8')
    titles = [
        match.group(2)
        for match in re.finditer(r"\btest\s*\(\s*(['\"])(.*?)\1\s*,", source, re.S)
    ]
    if not titles:
        raise SystemExit(f'No se pudieron extraer tests Playwright de e2e/{relative_path}')
    return titles


def assert_lane_pattern_targets_real_test(spec_name: str, item: str) -> None:
    try:
        matcher = re.compile(item)
    except re.error as exc:
        raise SystemExit(f'Grep crítico inválido para {spec_name}: {item!r}: {exc}') from exc

    matches = [title for title in playwright_test_titles(spec_name) if matcher.search(title)]
    if not matches:
        raise SystemExit(
            f'Grep crítico fantasma en {spec_name}: {item!r} no coincide con ningún test real del spec ejecutado'
        )
    if len(matches) > 1:
        raise SystemExit(
            f'Grep crítico ambiguo en {spec_name}: {item!r} coincide con {len(matches)} tests: {matches}'
        )


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
for family in ['static-preflight', 'test-frontend', 'test-backend-smoke', 'test-backend-integration', 'backend-check', 'e2e']:
    if family not in local:
        raise SystemExit(f'test-all-local no incluye la familia crítica: {family}')

tests_block = re.search(r'^tests:(.*?)(?=\n[^\t# ].*?:|\Z)', makefile, re.M | re.S)
if not tests_block or 'e2e' not in tests_block.group(0):
    raise SystemExit('make tests debe incluir la suite Playwright completa mediante el target e2e')

for command in ['make static-preflight', 'make test-frontend', 'make test-backend-smoke', 'make test-backend-integration', 'make backend-check', 'make security-be']:
    if command not in ci:
        raise SystemExit(f'CI se ha desalineado del entrypoint local: falta `{command}`')

canonical_match = re.search(r'^CRITICAL_E2E_GREP\s*:=\s*(.+)$', makefile, re.M)
if not canonical_match:
    raise SystemExit('El grep E2E crítico debe vivir en Makefile como contrato único')
canonical_critical = {item.strip() for item in canonical_match.group(1).split('|') if item.strip()}
if not canonical_critical:
    raise SystemExit('CRITICAL_E2E_GREP no puede estar vacío')

# El modo normal delega el gate crítico entero en Make. El modo shardado es una
# excepción deliberada: reparte el mismo contrato entre runners aislados, pero
# esta auditoría exige que la unión de sus --grep sea EXACTAMENTE el contrato
# canónico del Makefile. Además cada patrón debe resolver a un único test real
# dentro del spec que ejecuta esa lane: cero matches sería cobertura fantasma y
# más de uno haría el coste/contrato ambiguo.
sharded_playwright = 'e2e_lanes:' in ci
if sharded_playwright:
    for marker in ['- regression', '- smoke', 'Tests · Playwright · ${{ matrix.lane }}', 'mobile-final-interactions.spec.js']:
        if marker not in ci:
            raise SystemExit(f'CI shardado incompleto: falta `{marker}`')

    lane_commands = re.findall(
        r'playwright test\s+([A-Za-z0-9_.-]+\.spec\.js)[\s\\]+--grep\s+"([^"]+)"',
        ci,
    )
    if len(lane_commands) != 2:
        raise SystemExit(
            f'CI shardado debe declarar exactamente dos comandos spec+grep críticos; encontrados: {len(lane_commands)}'
        )

    lane_patterns = [pattern for _, pattern in lane_commands]
    sharded_critical = {
        item.strip()
        for pattern in lane_patterns
        for item in pattern.split('|')
        if item.strip()
    }
    missing = sorted(canonical_critical - sharded_critical)
    extra = sorted(sharded_critical - canonical_critical)
    if missing or extra:
        detail = []
        if missing:
            detail.append(f'faltan: {missing}')
        if extra:
            detail.append(f'sobran: {extra}')
        raise SystemExit('Las lanes Playwright divergen de CRITICAL_E2E_GREP: ' + '; '.join(detail))
    if sum(len([item for item in pattern.split('|') if item.strip()]) for pattern in lane_patterns) != len(canonical_critical):
        raise SystemExit('Las lanes Playwright duplican casos críticos entre runners')

    for spec_name, pattern in lane_commands:
        for item in [item.strip() for item in pattern.split('|') if item.strip()]:
            assert_lane_pattern_targets_real_test(spec_name, item)
else:
    if 'make e2e-critical' not in ci:
        raise SystemExit('CI se ha desalineado del entrypoint local: falta `make e2e-critical`')
    if '--grep "login → menú' in ci:
        raise SystemExit('CI volvió a duplicar el grep E2E en YAML; usa `make e2e-critical`')

if 'python -m pip_audit' in ci:
    raise SystemExit('CI volvió a ejecutar pip-audit fuera del venv; usa `make security-be`')

mode = (
    'lanes aisladas auditadas contra CRITICAL_E2E_GREP + títulos reales de cada spec'
    if sharded_playwright
    else 'Make target e2e-critical'
)
print(f'Test entrypoint parity OK: local y CI comparten contratos críticos ({mode}).')
