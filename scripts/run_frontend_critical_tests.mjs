#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CRITICAL_FRONTEND_TESTS } from './frontend_critical_manifest.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const frontend = path.join(root, 'frontend');
const vitest = path.join(frontend, 'node_modules', '.bin', 'vitest');

if (process.argv.includes('--list')) {
  process.stdout.write(`${CRITICAL_FRONTEND_TESTS.join('\n')}\n`);
  process.exit(0);
}

const result = spawnSync(vitest, ['run', ...CRITICAL_FRONTEND_TESTS], {
  cwd: frontend,
  stdio: 'inherit',
});
if (result.error) {
  console.error(`No se pudo ejecutar Vitest crítico: ${result.error.message}`);
  process.exit(2);
}
process.exit(result.status ?? 2);
