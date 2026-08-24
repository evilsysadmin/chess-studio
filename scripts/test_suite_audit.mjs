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
  // Sólo los tests que TOCAN Web Storage necesitan limpieza. Contract-tests
  // que inspeccionan texto o regex sobre la palabra "localStorage" no deben
  // quedar marcados como usuarios reales del storage.
  if (!/(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem|clear)\s*\(/.test(source)) return false;
  return !/(?:localStorage|sessionStorage)\.clear\(\)/.test(source);
});
if (storageWithoutReset.length) fail(`Tests que usan Web Storage sin limpieza explícita: ${storageWithoutReset.join(', ')}`);

const contractBasenames = new Set(FRONTEND_CONTRACT_TESTS.map((relative) => path.basename(relative)));
const smokeBasenames = new Set(FRONTEND_SMOKE_TESTS.map((relative) => path.basename(relative)));
const overlap = [...smokeBasenames].filter((name) => contractBasenames.has(name));
if (overlap.length) fail(`Smoke y contract se solapan: ${overlap.join(', ')}`);

for (const relative of [...FRONTEND_SMOKE_TESTS, ...FRONTEND_CONTRACT_TESTS]) {
  const full = path.join(root, 'frontend', relative);
  if (!fs.existsSync(full)) fail(`Grupo frontend referencia un test inexistente: ${relative}`);
}

const sourceReaders = frontendFiles.filter((name) => /(?:readFileSync|fs\.readFileSync)/.test(read(path.join(frontendSrc, name))));
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
if (!makefile.includes('--ignore=test_chess_ai.py --ignore=test_core_game.py')) fail('backend integration no autodetecta nuevos tests backend');
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
  const frontendCentralized = /npm\s+(?:run\s+)?test\b/.test(workflowSource)
    || /make\s+(?:tests-fe|tests|quality-gate)\b/.test(workflowSource);
  if (!frontendCentralized) fail('CI no ejecuta la suite frontend agrupada');
  const backendAutodiscovery = /--ignore=test_chess_ai\.py\s+--ignore=test_core_game\.py/.test(workflowSource)
    || /make\s+(?:test-backend|tests-be|tests|quality-gate)\b/.test(workflowSource);
  if (!backendAutodiscovery) fail('CI backend no autodetecta el resto de test_*.py');
  if (!workflowSource.includes('scripts/compose_smoke.py')) fail('CI no ejecuta el smoke de stack real Docker Compose');
  if (!workflowSource.includes('@vitest/coverage-v8@4.1.10') || !workflowSource.includes('npm run test:coverage')) fail('CI no ejecuta coverage V8 frontend fijado');
  if (!workflowSource.includes('--cov-branch')) fail('CI backend no mide branch coverage');
  if (!workflowSource.includes('Coverage frontend (informativo)') || !workflowSource.includes('Coverage backend (informativo)')) fail('CI debe etiquetar coverage como informativo');
  if (!workflowSource.includes('scripts/bundle_size_report.mjs') || !makefile.includes('bundle-report:')) fail('CI/Makefile deben conservar el informe informativo de tamaño de bundle');
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

const groupDefinitions = (files) => files.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\b(?:it|test)\s*\(/g)?.length || 0), 0);
const smokeDefinitions = groupDefinitions([...smokeBasenames]);
const unitDefinitions = groupDefinitions(unitFiles);
const contractDefinitions = groupDefinitions([...contractBasenames]);
const staticAssertions = sourceReaders.reduce((sum, name) => sum + (read(path.join(frontendSrc, name)).match(/\bexpect\s*\(/g)?.length || 0), 0);

console.log(`test-suite-audit OK · frontend ${frontendTests} definiciones/${frontendFiles.length} files · backend ${backendTests} definiciones/${backendFiles.length} · e2e ${e2eTests}/${e2eFiles.length}`);
console.log(`frontend groups (disjuntos): smoke ${smokeBasenames.size}/${smokeDefinitions} · unit ${unitFiles.length}/${unitDefinitions} · contract ${contractBasenames.size}/${contractDefinitions}`);
console.log(`parameterized frontend: ${frontendParameterized} definición(es) · contract-tests estáticos: ${sourceReaders.length} (${staticAssertions} assertions) · ci-wiring: ${checkCiWiring ? 'sí' : 'omitido'}`);
