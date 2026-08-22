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

const staticContractAllowlist = new Set([
  'adminMobileLayout.test.js',
  'armyRosterView.test.js',
  'combatOperationalUx.test.js',
  'chessGlossary.test.js',
  'mechanicTutorials.test.js',
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
}

if (e2eTests < 2) fail(`Cobertura E2E demasiado testimonial: ${e2eTests} caso(s); mínimo 2`);

console.log(`test-suite-audit OK · frontend ${frontendTests} tests/${frontendFiles.length} files · backend ${backendTests}/${backendFiles.length} · e2e ${e2eTests}/${e2eFiles.length}`);
console.log(`contract-tests estáticos controlados: ${sourceReaders.length} · critical manifest: ${CRITICAL_FRONTEND_TESTS.length} · ci-wiring: ${checkCiWiring ? 'sí' : 'omitido'}`);
