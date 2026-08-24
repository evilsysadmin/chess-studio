#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTEND_CONTRACT_TESTS, FRONTEND_SMOKE_TESTS } from './frontend_test_groups.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const frontendSrc = path.join(root, 'frontend', 'src');
const backendDir = path.join(root, 'backend-python');
const e2eDir = path.join(root, 'e2e');
const workerRuntimeTest = path.join(root, 'infra', 'cloudflare', 'worker', 'index.test.mjs');
const read = (p) => fs.readFileSync(p, 'utf8');
const list = (dir, predicate) => fs.readdirSync(dir).filter(predicate).sort();
const listRecursive = (dir, predicate) => {
  const found = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (predicate(entry.name)) found.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  walk(dir);
  return found.sort();
};
const fail = (message) => { throw new Error(message); };
const checkCiWiring = process.argv.includes('--ci-wiring');

const frontendFiles = listRecursive(frontendSrc, (name) => /\.test\.(?:js|jsx|mjs)$/.test(name));
const backendFiles = list(backendDir, (name) => /^test_.*\.py$/.test(name));
const e2eFiles = list(e2eDir, (name) => name.endsWith('.spec.js'));

const frontendTests = frontendFiles.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\s*\(/g)?.length || 0), 0);
const frontendParameterized = frontendFiles.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\.each\s*\(/g)?.length || 0), 0);
const backendTests = backendFiles.reduce((sum, name) => sum + (read(path.join(backendDir, name)).match(/^(?:async\s+)?def test_[A-Za-z0-9_]+\s*\(/gm)?.length || 0), 0);
const e2eTests = e2eFiles.reduce((sum, name) => sum + (read(path.join(e2eDir, name)).match(/\btest\s*\(/g)?.length || 0), 0);
const workerTests = fs.existsSync(workerRuntimeTest) ? (read(workerRuntimeTest).match(/\btest\s*\(/g)?.length || 0) : 0;

const allTestFiles = [
  ...frontendFiles.map((name) => path.join(frontendSrc, name)),
  ...backendFiles.map((name) => path.join(backendDir, name)),
  ...e2eFiles.map((name) => path.join(e2eDir, name)),
  ...(fs.existsSync(workerRuntimeTest) ? [workerRuntimeTest] : []),
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
  // Sólo los tests que TOCAN Web Storage necesitan limpieza. Contract-tests
  // que inspeccionan texto o regex sobre la palabra "localStorage" no deben
  // quedar marcados como usuarios reales del storage.
  if (!/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\s*\(/.test(source)) return false;
  return !/(?:localStorage|sessionStorage)\.clear\(\)/.test(source);
});
if (storageWithoutReset.length) fail(`Tests que usan Web Storage sin limpieza explícita: ${storageWithoutReset.join(', ')}`);

const contractBasenames = new Set(FRONTEND_CONTRACT_TESTS.map((relative) => relative.replace(/^src\//, '')));
const smokeBasenames = new Set(FRONTEND_SMOKE_TESTS.map((relative) => relative.replace(/^src\//, '')));
const overlap = [...smokeBasenames].filter((name) => contractBasenames.has(name));
if (overlap.length) fail(`Smoke y contract se solapan: ${overlap.join(', ')}`);

for (const relative of [...FRONTEND_SMOKE_TESTS, ...FRONTEND_CONTRACT_TESTS]) {
  const full = path.join(root, 'frontend', relative);
  if (!fs.existsSync(full)) fail(`Grupo frontend referencia un test inexistente: ${relative}`);
}

const sourceReaders = frontendFiles.filter((name) => /(?:readFileSync|fs\.readFileSync)/.test(read(path.join(frontendSrc, name))));
const MAX_SOURCE_READER_TESTS = 5; // dm40f baseline: bajar, nunca volver a inflar.
if (sourceReaders.length > MAX_SOURCE_READER_TESTS) fail(`Demasiados contract-tests que inspeccionan source text: ${sourceReaders.length} > ${MAX_SOURCE_READER_TESTS}. Prefiere tests de comportamiento. Detectados: ${sourceReaders.join(', ')}`);
for (const name of sourceReaders) {
  if (!contractBasenames.has(name)) fail(`${name} inspecciona source text pero no pertenece al grupo contract`);
  if (!read(path.join(frontendSrc, name)).startsWith('// STATIC CONTRACT:')) fail(`${name} carece del marcador STATIC CONTRACT`);
}
for (const name of contractBasenames) {
  if (!frontendFiles.includes(name)) fail(`Contract-test declarado pero ausente: ${name}`);
}

const unitFiles = frontendFiles.filter((name) => !smokeBasenames.has(name) && !contractBasenames.has(name));
const grouped = [...smokeBasenames, ...contractBasenames, ...unitFiles];
if (new Set(grouped).size !== frontendFiles.length || grouped.length !== frontendFiles.length) {
  fail('La partición smoke/unit/contract no cubre exactamente una vez todos los tests frontend');
}

const makefile = read(path.join(root, 'Makefile'));
if (!/npm\s+test/.test(makefile)) fail('Makefile no ejecuta la suite frontend agrupada con npm test');
if (!/^tests:.*\bstatic-preflight\b/m.test(makefile)) fail('make tests debe incluir static-preflight para adelantar gates estructurales antes del push');
const prePushHook = read(path.join(root, '.githooks', 'pre-push'));
if (!/\bmake\s+tests\b/.test(prePushHook)) fail('pre-push debe ejecutar make tests');
if (!makefile.includes('--ignore=test_chess_ai.py --ignore=test_core_game.py')) fail('backend integration no autodetecta nuevos tests backend');
if (!/compose-smoke:[\s\S]*scripts\/compose_smoke\.py/.test(makefile)) fail('Makefile no expone el smoke de integración real');
const composeSmoke = read(path.join(root, 'scripts', 'compose_smoke.py'));
if (!composeSmoke.includes('/games') || !composeSmoke.includes('restored_game')) fail('compose smoke real no cubre persistencia/recuperación de partida');
if (!composeSmoke.includes('"PATCH"') || !composeSmoke.includes('"revisions"') || !composeSmoke.includes('exc.code == 409')) {
  fail('compose smoke real no cubre PATCH optimista de perfil + conflicto 409 contra Mongo');
}
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
  const mainCiPath = path.join(workflowsDir, 'ci.yml');
  const coverageWorkflowPath = path.join(workflowsDir, 'coverage.yml');
  if (!fs.existsSync(mainCiPath)) fail('Falta .github/workflows/ci.yml');
  if (!fs.existsSync(coverageWorkflowPath)) fail('Coverage informativo debe vivir fuera del CI de cada push');
  const mainCiSource = read(mainCiPath);
  const coverageWorkflowSource = read(coverageWorkflowPath);
  if (/Coverage (?:frontend|backend) \(informativo\)/.test(mainCiSource)) fail('CI principal no debe repetir suites completas sólo para coverage informativo');
  if (!coverageWorkflowSource.includes('workflow_dispatch:') || !coverageWorkflowSource.includes('schedule:')) fail('Coverage debe quedar disponible manualmente y por calendario');
  const frontendCentralized = /npm\s+(?:run\s+)?test\b/.test(workflowSource)
    || /make\s+(?:tests-fe|tests|quality-gate)\b/.test(workflowSource);
  if (!frontendCentralized) fail('CI no ejecuta la suite frontend agrupada');
  const backendAutodiscovery = /--ignore=test_chess_ai\.py\s+--ignore=test_core_game\.py/.test(workflowSource)
    || /make\s+(?:test-backend|tests-be|tests|quality-gate)\b/.test(workflowSource);
  if (!backendAutodiscovery) fail('CI backend no autodetecta el resto de test_*.py');
  if (!workflowSource.includes('scripts/compose_smoke.py')) fail('CI no ejecuta el smoke de stack real Docker Compose');
  if (!workflowSource.includes('node --test infra/cloudflare/worker/index.test.mjs')) fail('CI no ejecuta los tests runtime del Worker AI');
  if (!workflowSource.includes('npm run test:coverage')) fail('CI no conserva el paso de coverage frontend');
  if (!workflowSource.includes('continue-on-error: true')) fail('Coverage frontend debe seguir siendo informativo');
  if (workflowSource.includes('npm install --no-save') && workflowSource.includes('@vitest/coverage-v8')) fail('CI no debe mutar node_modules con un segundo npm install para coverage');
  if (!workflowSource.includes('--cov-branch')) fail('CI backend no mide branch coverage');
  if (!workflowSource.includes('Coverage frontend (informativo)') || !workflowSource.includes('Coverage backend (informativo)')) fail('CI debe etiquetar coverage como informativo');
  if (!workflowSource.includes('scripts/bundle_size_report.mjs') || !makefile.includes('bundle-report:')) fail('CI/Makefile deben conservar el informe informativo de tamaño de bundle');
  if (!workflowSource.includes('--grep "login → menú|Partida rápida · una partida activa|Combat Chess · Campaña obliga"')) fail('Browser smoke crítico debe atravesar confirmación de despliegue Combat');
  const informationalCoverageSteps = (workflowSource.match(/continue-on-error:\s*true/g) || []).length;
  if (informationalCoverageSteps < 2) fail('Coverage frontend/backend debe ser no bloqueante con continue-on-error');
}

if (!fs.existsSync(workerRuntimeTest) || workerTests < 6) fail(`Worker AI sin cobertura runtime suficiente: ${workerTests} test(s); mínimo 6`);
const playwrightConfig = read(path.join(e2eDir, 'playwright.config.js'));
if (!playwrightConfig.includes('fullyParallel: true')) fail('Playwright CI debe conservar aislamiento/parallelismo entre tests');
if (/workers:\s*process\.env\.CI\s*\?\s*1\s*:/.test(playwrightConfig)) fail('Playwright CI no debe volver a 1 worker: serializa toda la suite');
if (!playwrightConfig.includes('actionTimeout:')) fail('Playwright debe tener actionTimeout explícito para fallar cerca de la causa y no a los 30 s');
if (!/retries:\s*0/.test(playwrightConfig)) fail('Playwright informativo no debe reintentar: los retries alargan ruido y esconden fallos deterministas');
if (e2eTests < 11) fail(`Cobertura E2E/DOM demasiado testimonial: ${e2eTests} caso(s); mínimo 11`);
const resilienceBehaviorTests = [
  'backNavigationStack.test.js',
  'useActiveGameSessionPersistence.test.js',
  'useActiveSessionRestore.test.js',
  'useGameReconnect.test.js',
];
for (const name of resilienceBehaviorTests) {
  if (!frontendFiles.includes(name)) fail(`Falta test de resiliencia de comportamiento: ${name}`);
  if (sourceReaders.includes(name)) fail(`${name} debe probar comportamiento, no inspeccionar source text`);
}

const e2eSource = e2eFiles.map((name) => read(path.join(e2eDir, name))).join('\n');

// Home cards now carry contextual help buttons whose aria-label deliberately
// repeats the feature name ("Ayuda de Partida rápida", etc.). A broad regex
// role selector therefore becomes ambiguous in Playwright strict mode. Keep
// this as a suite-level contract so a future refactor cannot reintroduce the
// exact class of CI failure fixed in dm43c.
for (const label of ['Así juegas', 'Partida rápida', 'Combat Chess · Campaña']) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const broadRoleSelector = new RegExp(`getByRole\\(['\"]button['\"],\\s*\\{\\s*name:\\s*\\/[^\\n/]*${escaped}`, 'i');
  if (broadRoleSelector.test(e2eSource)) {
    fail(`E2E usa selector de botón ambiguo para ${label}; usa buttonWithVisibleText(..., ${JSON.stringify(label)}) o exact:true`);
  }
}

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

const frontendPackage = JSON.parse(read(path.join(root, 'frontend', 'package.json')));
const hasV8CoverageProvider = Boolean(frontendPackage.devDependencies?.['@vitest/coverage-v8']);
if (!hasV8CoverageProvider) {
  console.warn('WARN: frontend coverage V8 está configurado pero @vitest/coverage-v8 no está declarado; coverage se omite de forma informativa.');
  const coverageWorkflowSource = read(path.join(root, '.github', 'workflows', 'coverage.yml'));
  if (!coverageWorkflowSource.includes('[ ! -d node_modules/@vitest/coverage-v8 ]')) {
    fail('Coverage workflow debe omitir limpiamente V8 mientras @vitest/coverage-v8 no esté declarado');
  }
}
const viteConfig = read(path.join(root, 'frontend', 'vite.config.js'));
if (/thresholds\s*:/.test(viteConfig)) fail('Coverage frontend debe ser informativo: no declares thresholds bloqueantes en Vitest');
const backendCoverageConfig = read(path.join(backendDir, '.coveragerc'));
if (!backendCoverageConfig.includes('branch = True')) fail('Backend coverage debe medir branches');
if (/fail_under\s*=\s*[1-9]/.test(backendCoverageConfig)) fail('Coverage backend debe ser informativo: fail_under no puede bloquear');

const groupDefinitions = (files) => files.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\s*\(/g)?.length || 0), 0);
const smokeDefinitions = groupDefinitions([...smokeBasenames]);
const unitDefinitions = groupDefinitions(unitFiles);
const contractDefinitions = groupDefinitions([...contractBasenames]);
const staticAssertions = sourceReaders.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\bexpect\s*\(/g)?.length || 0), 0);

console.log(`test-suite-audit OK · frontend ${frontendTests} definiciones/${frontendFiles.length} files · backend ${backendTests} definiciones/${backendFiles.length} · e2e ${e2eTests}/${e2eFiles.length} · worker ${workerTests}/1`);
console.log(`frontend groups (disjuntos): smoke ${smokeBasenames.size}/${smokeDefinitions} · unit ${unitFiles.length}/${unitDefinitions} · contract ${contractBasenames.size}/${contractDefinitions}`);
console.log(`parameterized frontend: ${frontendParameterized} definición(es) · contract-tests estáticos: ${sourceReaders.length} (${staticAssertions} assertions) · ci-wiring: ${checkCiWiring ? 'sí' : 'omitido'}`);
