#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const src = path.join(root, 'frontend', 'src');
const tests = fs.readdirSync(src).filter((name) => /\.test\.[jt]sx?$/.test(name));
const readers = tests.filter((name) => /(?:readFileSync|fs\.readFileSync)/.test(fs.readFileSync(path.join(src, name), 'utf8')));
const riskyTokens = [
  /\.toContain\([^\n]*(?:const |set[A-Z]|React\.lazy|import\(|await |on[A-Z][A-Za-z]*=|disabled=|enabled=|=\{|function )/,
  /\.indexOf\(/,
];
const findings = [];
for (const name of readers) {
  const lines = fs.readFileSync(path.join(src, name), 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (riskyTokens.some((pattern) => pattern.test(line))) findings.push({ name, line: idx + 1, text: line.trim() });
  });
}
const byFile = new Map();
for (const item of findings) byFile.set(item.name, (byFile.get(item.name) || 0) + 1);
const hotspots = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
const SOURCE_READER_BUDGET = 3;
const IMPLEMENTATION_ASSERT_BUDGET = 5;
console.log(`static-contract-risk audit · ${readers.length} source-reader tests · ${findings.length} implementation-coupled assertion candidates`);
if (hotspots.length) console.log(`hotspots: ${hotspots.map(([name, count]) => `${name}:${count}`).join(' · ')}`);
console.log(`budget: source-readers <= ${SOURCE_READER_BUDGET} · implementation-coupled <= ${IMPLEMENTATION_ASSERT_BUDGET}`);
if (readers.length > SOURCE_READER_BUDGET || findings.length > IMPLEMENTATION_ASSERT_BUDGET) {
  console.error('FAIL: la deuda de tests acoplados a implementación ha crecido. Migra el nuevo contrato a comportamiento/helper o reduce otro caso antes de añadirlo.');
  process.exit(1);
}
console.log('OK: la deuda está acotada; el objetivo es reducir estos presupuestos en releases posteriores.');
