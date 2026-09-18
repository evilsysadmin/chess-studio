#!/usr/bin/env python3
"""Fail fast when local test entrypoints and GitHub CI drift apart."""
from pathlib import Path
import re

from quality_scope import CORE_E2E_LANES
from run_core_e2e_lane import LANE_COMMANDS, critical_targets, self_test as core_e2e_lane_self_test
from workflow_static_contracts import validate_workflow_static_contracts

ROOT = Path(__file__).resolve().parents[1]
makefile = (ROOT / 'Makefile').read_text(encoding='utf-8')
ci = (ROOT / '.github/workflows/cicd.yml').read_text(encoding='utf-8')


def playwright_test_titles(relative_path: str, seen: set[str] | None = None) -> list[str]:
    """Extract test titles from a spec and static side-effect imports it aggregates."""
    seen = set() if seen is None else seen
    normalized = Path(relative_path).as_posix()
    if normalized in seen:
        return []
    seen.add(normalized)

    path = ROOT / 'e2e' / normalized
    source = path.read_text(encoding='utf-8')
    titles = [
        match.group(2)
        for match in re.finditer(r"\btest\s*\(\s*(['\"])(.*?)\1\s*,", source, re.S)
    ]

    for imported in re.findall(r"^\s*import\s+(['\"])(\./[^'\"]+)\1\s*;?\s*$", source, re.M):
        candidate = (path.parent / imported[1]).resolve()
        e2e_root = (ROOT / 'e2e').resolve()
        if not candidate.is_relative_to(e2e_root) or candidate.suffix != '.js' or not candidate.exists():
            continue
        titles.extend(playwright_test_titles(candidate.relative_to(e2e_root).as_posix(), seen))

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
        exact = [title for title in matches if title == item]
        if len(exact) != 1:
            raise SystemExit(
                f'Grep crítico ambiguo en {spec_name}: {item!r} coincide con {len(matches)} tests: {matches}'
            )


def ci_job_block(job_name: str) -> str:
    match = re.search(
        rf'^  {re.escape(job_name)}:\n(.*?)(?=^  [A-Za-z0-9_-]+:\n|\Z)',
        ci,
        re.M | re.S,
    )
    if not match:
        raise SystemExit(f'No se pudo inspeccionar el job CI `{job_name}`')
    return match.group(0)


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

legacy_head_diff = 'git diff --name-only "$BASE_SHA" "$HEAD_SHA"'
legacy_three_dot = 'git diff --name-only "$BASE_SHA...$HEAD_SHA"'
merge_diff = 'scripts/pr_merge_diff.py --base "$BASE_SHA" --merge "$EVENT_SHA"'
if legacy_head_diff in ci or legacy_three_dot in ci:
    raise SystemExit('CI debe clasificar el PR desde el merge sintético, no desde base/head con historial completo')
if ci.count(merge_diff) != 3:
    raise SystemExit('CI debe usar exactamente tres diffs base→merge sintético: Quality, browser especializado y seguridad')
for job_name in ['preflight', 'security']:
    job = ci_job_block(job_name)
    if 'fetch-depth: 2' not in job or 'fetch-depth: 0' in job:
        raise SystemExit(f'{job_name} debe conservar checkout shallow de dos generaciones para el merge sintético')

canonical_match = re.search(r'^CRITICAL_E2E_GREP\s*:=\s*(.+)$', makefile, re.M)
if not canonical_match:
    raise SystemExit('El grep E2E crítico debe vivir en Makefile como contrato único')
canonical_critical = {item.strip() for item in canonical_match.group(1).split('|') if item.strip()}
if not canonical_critical:
    raise SystemExit('CRITICAL_E2E_GREP no puede estar vacío')

sharded_playwright = 'e2e_lanes:' in ci
if sharded_playwright:
    core_lanes = ci_job_block('e2e_lanes')
    expected_lanes = (
        'regression-state', 'regression-school', 'learning-golden', 'learning-observation',
        'app-boot', 'admin', 'tournament', 'combat', 'home', 'smoke',
    )
    core_e2e_lane_self_test()
    if CORE_E2E_LANES != expected_lanes:
        raise SystemExit(f'quality_scope perdió las lanes core canónicas: {CORE_E2E_LANES!r}')
    if tuple(LANE_COMMANDS) != expected_lanes:
        raise SystemExit(f'runner core perdió las lanes canónicas: {tuple(LANE_COMMANDS)!r}')
    for marker in [
        'matrix: ${{ fromJSON(needs.preflight.outputs.core_e2e_matrix) }}',
        'Tests · Playwright · ${{ matrix.lane }}',
        'python3 -S scripts/run_core_e2e_lane.py "$CRITICAL_E2E_LANE"',
    ]:
        if marker not in core_lanes:
            raise SystemExit(f'CI shardado incompleto: falta `{marker}`')
    if 'case "$CRITICAL_E2E_LANE"' in core_lanes:
        raise SystemExit('CI volvió a duplicar el dispatch de lanes en YAML; usa run_core_e2e_lane.py')

    lane_commands = critical_targets()
    if len(lane_commands) != 3:
        raise SystemExit(
            f'runner core debe declarar exactamente tres comandos spec+grep críticos; encontrados: {len(lane_commands)}'
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

    if 'e2e_specialized:' in ci:
        specialized = ci_job_block('e2e_specialized')
        aggregate = ci_job_block('e2e')
        for marker in [
            'Browser required · ${{ matrix.label }}',
            "build-frontend: 'false'",
            'actions/download-artifact@018cc2cf5baa6db3ef3c5f8a56943fffe632ef53',
        ]:
            if marker not in specialized:
                raise SystemExit(f'Gate browser especializado incompleto: falta `{marker}`')
        if 'needs: [preflight, e2e_lanes, e2e_specialized]' not in aggregate:
            raise SystemExit('Tests · Playwright debe agregar core + browser especializado en el mismo required check')
        if 'SPECIALIZED_RESULT' not in aggregate:
            raise SystemExit('Tests · Playwright no está comprobando el resultado de las lanes especializadas')
else:
    if 'make e2e-critical' not in ci:
        raise SystemExit('CI se ha desalineado del entrypoint local: falta `make e2e-critical`')
    if '--grep "login → menú' in ci:
        raise SystemExit('CI volvió a duplicar el grep E2E en YAML; usa `make e2e-critical`')

if 'python -m pip_audit' in ci:
    raise SystemExit('CI volvió a ejecutar pip-audit fuera del venv; usa `make security-be`')

validate_workflow_static_contracts(ROOT)

mode = (
    'lanes core auditadas contra CRITICAL_E2E_GREP + gate especializado agregado'
    if sharded_playwright
    else 'Make target e2e-critical'
)
print(f'Test entrypoint parity OK: local y CI comparten contratos críticos ({mode}).')
