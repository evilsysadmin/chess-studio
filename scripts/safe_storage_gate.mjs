#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const srcRoot = path.join(root, 'frontend', 'src');
const directStorageCall = /(?:\b|window\.|globalThis\.)(?:localStorage|sessionStorage)\s*\.\s*(?:getItem|setItem|removeItem)\s*\(/;

function productionSources(dir = srcRoot) {
  const rows = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) rows.push(...productionSources(absolute));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.(?:js|jsx)$/.test(entry.name) && entry.name !== 'test-setup.js') rows.push(absolute);
  }
  return rows;
}

const offenders = productionSources()
  .filter((file) => path.basename(file) !== 'safeStorage.js')
  .flatMap((file) => fs.readFileSync(file, 'utf8').split('\n').map((line, index) => ({ file, line, index: index + 1 })))
  .filter(({ line }) => directStorageCall.test(line))
  .map(({ file, line, index }) => `${path.relative(srcRoot, file)}:${index} ${line.trim()}`);

if (offenders.length) {
  console.error('safe-storage-gate FAIL · usa safeStorage.js: Web Storage puede lanzar incluso al leer');
  for (const offender of offenders) console.error(` - ${offender}`);
  process.exit(1);
}

console.log('safe-storage-gate OK · persistencia productiva centralizada en safeStorage.js');
