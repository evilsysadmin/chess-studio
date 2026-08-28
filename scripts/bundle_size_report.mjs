#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'frontend', 'dist');
const assets = path.join(dist, 'assets');
const indexPath = path.join(dist, 'index.html');

const kib = (bytes) => bytes / 1024;
const fmt = (bytes) => `${kib(bytes).toFixed(1)} KiB`;

if (!fs.existsSync(indexPath) || !fs.existsSync(assets)) {
  console.error('bundle-size: falta frontend/dist. Ejecuta primero npm run build.');
  process.exit(2);
}

const jsFiles = fs.readdirSync(assets).filter((name) => name.endsWith('.js')).sort();
if (!jsFiles.length) {
  console.error('bundle-size: el build no contiene chunks JavaScript.');
  process.exit(2);
}

const rows = jsFiles.map((name) => {
  const buffer = fs.readFileSync(path.join(assets, name));
  return { name, raw: buffer.length, gzip: zlib.gzipSync(buffer, { level: 9 }).length };
});

const html = fs.readFileSync(indexPath, 'utf8');
const initialNames = new Set();
for (const match of html.matchAll(/(?:src|href)=["'][^"']*\/assets\/([^"']+\.js)["']/g)) {
  initialNames.add(match[1]);
}
const initialRows = rows.filter((row) => initialNames.has(row.name));
const total = rows.reduce((sum, row) => sum + row.gzip, 0);
const initialTotal = initialRows.reduce((sum, row) => sum + row.gzip, 0);
const largest = [...rows].sort((a, b) => b.gzip - a.gzip).slice(0, 8);
const largestInitial = [...initialRows].sort((a, b) => b.gzip - a.gzip)[0] || null;

const budgets = {
  initialGzip: Number(process.env.CHESS_BUNDLE_INITIAL_GZIP_KB || 420) * 1024,
  largestInitialGzip: Number(process.env.CHESS_BUNDLE_LARGEST_INITIAL_GZIP_KB || 260) * 1024,
  totalGzip: Number(process.env.CHESS_BUNDLE_TOTAL_GZIP_KB || 1800) * 1024,
};

const warnings = [];
if (initialTotal > budgets.initialGzip) warnings.push(`JS inicial gzip ${fmt(initialTotal)} > presupuesto blando ${fmt(budgets.initialGzip)}`);
if (largestInitial && largestInitial.gzip > budgets.largestInitialGzip) warnings.push(`chunk inicial mayor ${largestInitial.name} ${fmt(largestInitial.gzip)} > ${fmt(budgets.largestInitialGzip)}`);
if (total > budgets.totalGzip) warnings.push(`JS total gzip ${fmt(total)} > presupuesto blando ${fmt(budgets.totalGzip)}`);

console.log('== Chess Studio · bundle size (informativo) ==');
console.log(`JS inicial: ${fmt(initialTotal)} en ${initialRows.length} chunk(s)`);
console.log(`JS total:   ${fmt(total)} en ${rows.length} chunk(s)`);
console.log('Chunks mayores (gzip):');
for (const row of largest) console.log(`  ${fmt(row.gzip).padStart(11)}  ${row.name}${initialNames.has(row.name) ? '  [inicial]' : '  [lazy]'}`);
if (warnings.length) {
  console.log('\nWARN: presupuesto blando superado:');
  for (const warning of warnings) console.log(`  - ${warning}`);
  console.log('No bloquea CI: sirve para detectar engordes antes de convertirlos en costumbre.');
} else {
  console.log('\nOK: dentro de los presupuestos blandos actuales.');
}
