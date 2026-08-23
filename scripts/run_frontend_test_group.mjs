#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FRONTEND_CONTRACT_TESTS, FRONTEND_SMOKE_TESTS } from './frontend_test_groups.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const frontend = path.join(root, 'frontend');
const src = path.join(frontend, 'src');
const vitest = path.join(frontend, 'node_modules', '.bin', 'vitest');
const group = process.argv[2] || 'all';
const listOnly = process.argv.includes('--list');

function discoverTests() {
  return fs.readdirSync(src)
    .filter((name) => /\.test\.(?:js|jsx|mjs)$/.test(name))
    .sort()
    .map((name) => `src/${name}`);
}

const all = discoverTests();
const reserved = new Set([...FRONTEND_SMOKE_TESTS, ...FRONTEND_CONTRACT_TESTS]);
const groups = {
  smoke: [...FRONTEND_SMOKE_TESTS],
  contract: [...FRONTEND_CONTRACT_TESTS],
  unit: all.filter((file) => !reserved.has(file)),
  all,
};
const files = groups[group];
if (!files) {
  console.error(`Grupo desconocido: ${group}. Usa smoke, unit, contract o all.`);
  process.exit(2);
}

for (const relative of files) {
  if (!all.includes(relative)) {
    console.error(`El grupo ${group} referencia un test inexistente: ${relative}`);
    process.exit(2);
  }
}

if (listOnly) {
  process.stdout.write(`${files.join('\n')}\n`);
  process.exit(0);
}

console.log(`\n==> FRONTEND ${group.toUpperCase()} · ${files.length} fichero(s) · sin solapamiento`);
const result = spawnSync(vitest, ['run', ...files], { cwd: frontend, stdio: 'inherit' });
if (result.error) {
  console.error(`No se pudo ejecutar Vitest ${group}: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 2);
