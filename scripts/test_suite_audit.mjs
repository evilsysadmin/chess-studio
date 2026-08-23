#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITICAL_FRONTEND_TESTS } from './frontend_critical_manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const frontendSrc = path.join(root, 'frontend', 'src');
const backendDir = path.join(root, 'backend-python');
const e2eDir = path.join(root, 'e2e');
const read = (p) => fs.readFileSync(p, 'utf8');
const list = (dir, predicate) => fs.readdirSync(dir).filter(predicate).sort();
const fail = (message) => { throw new Error(message); };
const checkCiWiring = process.argv.includes('--ci-wiring');

const frontendFiles = list(frontendSrc, (name) => /\.test\.(?:js|jsx|mjs)$/.test(name));
const backendFiles = list(backendDir, (name) => /^test_.*\.py$/.test(name));
const e2eFiles = list(e2eDir, (name) => name.endsWith('.spec.js'));

const frontendTests = frontendFiles.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\s*\(/g)?.length || 0), 0);
const frontendParameterized = frontendFiles.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\.each\s*\(/g)?.length || 0), 0);
const backendTests = backendFiles.reduce((sum, name) => sum + (read(path.join(backendDir, name)).match(/^(?:async\s+)?def test_[A-Za-z0-9_]+\s*\(/gm)?.length || 0), 0);
const e2eTests = e2eFiles.reduce((sum, name) => sum + (read(path.join(e2eDir, name)).match(/\btest\s*\(/g)?.length || 0), 0);

const allTestFiles = [
  ...frontendFiles.map((name) => path.join(frontendSrc, name)),
  ...backendFiles.map((name) => path.join(backendDir, name)),
  ...e2eFiles.map((name) => path.join(e2eDir, name)),
];
for (const file of allTestFiles) {
  const source = read(file);
  if (/\.(?:only|skip|todo)\s*\(/.test(source)) fail(`${path.relative(root, file)} contiene .only/.skip/.todo`);
}

const directRandomMutation = frontendFiles.filter((name) => /Math\.random\s*=/.test(read(path.join(frontendSrc, name))));
if (directRandomMutation.length) fail(`Mutación directa de Math.random en: ${directRandomMutation.join(', ')}. Usa vi.spyOn + mockRestore.`);

for (const name of frontendFiles) {
  const lines = read(path.join(frontendSrc, name)).split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    const match = line.match(/expect\((.+)\)\.(toBe|toEqual)\((.+)\)/);
    if (match && match[1].trim() === match[3].trim()) {
      fail(`${name}:${index + 1} contiene una aserción tautológica (${match[2]})`);
    }
  }
}

const implicitClockTests = frontendFiles.filter((name) => /new Date\(\)|Date\.now\(\)/.test(read(path.join(frontendSrc, name))));
if (implicitClockTests.length) fail(`Tests dependientes del reloj real: ${implicitClockTests.join(', ')}. Inyecta fecha o usa fake timers.`);

const storageWithoutReset = frontendFiles.filter((name) => {
  const source = read(path.join(frontendSrc, name));
  if (!/(?:localStorage|sessionStorage)/.test(source)) return false;
  return !/(?:localStorage|sessionStorage)\.clear\(\)/.test(source);
});
if (storageWithoutReset.length) fail(`Tests que usan Web Storage sin limpieza explícita: ${storageWithoutReset.join(', ')}`);

const staticContractAllowlist = new Set([
  'adminMobileLayout.test.js',
  'adminUxContract.test.js',
  'armyRosterView.test.js',
  'combatOperationalUx.test.js',
  'combatRegressionContract.test.js',
  'combatBattleLayout.test.js',
  'campaignOperationalFlow.test.js',
  'chessGlossary.test.js',
  'mechanicTutorials.test.js',
  'narrativeWiring.test.js',
  'releaseContinuity.test.js',
  'zenMode.test.js',
]);
const sourceReaders = frontendFiles.filter((name) => /(?:readFileSync|fs\.readFileSync)/.test(read(path.join(frontendSrc, name))));
for (const name of sourceReaders) {
  if (!staticContractAllowlist.has(name)) fail(`${name} inspecciona source text pero no está declarado como contract-test estático`);
  if (!read(path.join(frontendSrc, name)).startsWith('// STATIC CONTRACT:')) fail(`${name} carece del marcador STATIC CONTRACT`);
}
for (const name of staticContractAllowlist) {
  if (!frontendFiles.includes(name)) fail(`Contract-test estático declarado pero ausente: ${name}`);
}

for (const relative of CRITICAL_FRONTEND_TESTS) {
  const full = path.join(root, 'frontend', relative);
  if (!fs.existsSync(full)) fail(`Gate crítico referencia un test inexistente: ${relative}`);
}
if (new Set(CRITICAL_FRONTEND_TESTS).size !== CRITICAL_FRONTEND_TESTS.length) fail('El manifest crítico contiene tests duplicados');

const makefile = read(path.join(root, 'Makefile'));
if (!/node\s+(?:\.\/)?scripts\/run_frontend_critical_tests\.mjs/.test(makefile)) fail('Makefile no usa el runner crítico centralizado');
if (!makefile.includes('--ignore=test_chess_ai.py --ignore=test_core_game.py')) fail('test-backend no autodetecta nuevos tests backend');
if (!/compose-smoke:[\s\S]*scripts\/compose_smoke\.py/.test(makefile)) fail('Makefile no expone el smoke de integración real');
if (!/coverage-fe:[\s\S]*test:coverage/.test(makefile)) fail('Makefile no expone coverage frontend real');
if (!/coverage-be:[\s\S]*--cov-branch/.test(makefile)) fail('Makefile no expone branch coverage backend');

const prepareRepoPath = path.join(root, 'scripts', 'prepare_repo.py');
if (fs.existsSync(prepareRepoPath) && read(prepareRepoPath).includes('fix_known_stale_tests.py')) {
  fail('prepare_repo.py no debe reescribir tests para ponerlos verdes; elimina fix_known_stale_tests.py del flujo automático');
}

if (checkCiWiring) {
  const workflowsDir = path.join(root, '.github', 'workflows');
  const workflowFiles = fs.existsSync(workflowsDir)
    ? fs.readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name)).sort()
    : [];
  if (!workflowFiles.length) fail('No hay workflows de GitHub Actions que auditar');
  const workflowSource = workflowFiles.map((name) => read(path.join(workflowsDir, name))).join('\n');
  const frontendCentralized = /node\s+(?:\.\/)?scripts\/run_frontend_critical_tests\.mjs/.test(workflowSource)
    || /make\s+(?:gate-frontend-critical|tests-fe|tests|quality-gate)\b/.test(workflowSource);
  if (!frontendCentralized) fail('CI no ejecuta el gate frontend crítico centralizado');
  const backendAutodiscovery = /--ignore=test_chess_ai\.py\s+--ignore=test_core_game\.py/.test(workflowSource)
    || /make\s+(?:test-backend|tests-be|tests|quality-gate)\b/.test(workflowSource);
  if (!backendAutodiscovery) fail('CI backend no autodetecta el resto de test_*.py');
  if (!workflowSource.includes('scripts/compose_smoke.py')) fail('CI no ejecuta el smoke de stack real Docker Compose');
  if (!workflowSource.includes('@vitest/coverage-v8@4.1.10') || !workflowSource.includes('npm run test:coverage')) fail('CI no ejecuta coverage V8 frontend fijado');
  if (!workflowSource.includes('--cov-branch')) fail('CI backend no mide branch coverage');
  if (!workflowSource.includes('Coverage frontend (informativo)') || !workflowSource.includes('Coverage backend (informativo)')) fail('CI debe etiquetar coverage como informativo');
  const informationalCoverageSteps = (workflowSource.match(/continue-on-error:\s*true/g) || []).length;
  if (informationalCoverageSteps < 2) fail('Coverage frontend/backend debe ser no bloqueante con continue-on-error');
}

if (e2eTests < 11) fail(`Cobertura E2E/DOM demasiado testimonial: ${e2eTests} caso(s); mínimo 11`);
const e2eSource = e2eFiles.map((name) => read(path.join(e2eDir, name))).join('\n');
for (const required of [
  'obliga a confirmar despliegue antes de iniciar combate',
  'hover abre ficha y doble clic mueve Tablero ↔ Banquillo',
  'una batalla activa sobrevive a reload y no vuelve a Setup',
  'clic simple fija la ficha sin mover la unidad',
  'la batalla usa el rail derecho como Registro de batalla',
  'las piezas interactivas reciben pointer events reales en Mesa de Guerra',
  'focus de teclado sobre una reserva abre la ficha rápida sin ratón',
  'Escape cierra primero la ficha fijada sin abandonar Preparar despliegue',
]) {
  if (!e2eSource.includes(required)) fail(`Falta regresión E2E crítica de Combat: ${required}`);
}

const viteConfig = read(path.join(root, 'frontend', 'vite.config.js'));
if (/thresholds\s*:/.test(viteConfig)) fail('Coverage frontend debe ser informativo: no declares thresholds bloqueantes en Vitest');
const backendCoverageConfig = read(path.join(backendDir, '.coveragerc'));
if (!backendCoverageConfig.includes('branch = True')) fail('Backend coverage debe medir branches');
if (/fail_under\s*=\s*[1-9]/.test(backendCoverageConfig)) fail('Coverage backend debe ser informativo: fail_under no puede bloquear');

const criticalDefinitions = CRITICAL_FRONTEND_TESTS.reduce((sum, relative) => {
  const full = path.join(root, 'frontend', relative);
  return sum + (read(full).match(/\b(?:it|test)\s*\(/g)?.length || 0);
}, 0);
const criticalPct = frontendTests ? Math.round((criticalDefinitions / frontendTests) * 1000) / 10 : 0;
const staticAssertions = sourceReaders.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\bexpect\s*\(/g)?.length || 0), 0);

console.log(`test-suite-audit OK · frontend ${frontendTests} definiciones/${frontendFiles.length} files · backend ${backendTests} definiciones/${backendFiles.length} · e2e ${e2eTests}/${e2eFiles.length}`);
console.log(`parameterized frontend: ${frontendParameterized} definición(es) · contract-tests estáticos: ${sourceReaders.length} (${staticAssertions} assertions)`);
console.log(`critical manifest: ${CRITICAL_FRONTEND_TESTS.length} ficheros / ${criticalDefinitions} definiciones (${criticalPct}% del frontend) · ci-wiring: ${checkCiWiring ? 'sí' : 'omitido'}`);
if (criticalPct > 65) console.warn(`WARN: el gate frontend crítico repite ${criticalPct}% de las definiciones antes de la suite completa; ya no es especialmente rápido.`);
