#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const frontendSrc = path.join(root, 'frontend', 'src');
const backendSrc = path.join(root, 'backend-python');

function discoverTests(dir, found = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) discoverTests(full, found);
    else if (/\.test\.[jt]sx?$/.test(entry.name)) found.push(full);
  }
  return found;
}

const frontendTests = discoverTests(frontendSrc);
const backendTests = fs.readdirSync(backendSrc, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^test_.*\.py$/.test(entry.name))
  .map((entry) => path.join(backendSrc, entry.name));
const tests = [...frontendTests, ...backendTests];
const readers = tests.filter((file) => {
  const source = fs.readFileSync(file, 'utf8');
  return /(?:readFileSync|fs\.readFileSync|readFile\s*\(|\.read_text\s*\(|inspect\.getsource|getsource\s*\()/.test(source);
});
const riskyTokens = [
  /\.toContain\([^\n]*(?:const |set[A-Z]|React\.lazy|import\(|await |on[A-Z][A-Za-z]*=|disabled=|enabled=|=\{|function )/,
  /\.indexOf\(/,
];
const findings = [];
for (const file of readers) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, idx) => {
    if (riskyTokens.some((pattern) => pattern.test(line))) findings.push({ file, line: idx + 1, text: line.trim() });
  });
}
const relative = (file) => path.relative(root, file).split(path.sep).join('/');
const byFile = new Map();
for (const item of findings) byFile.set(relative(item.file), (byFile.get(relative(item.file)) || 0) + 1);
const hotspots = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
const SOURCE_READER_BUDGET = 0;
const IMPLEMENTATION_ASSERT_BUDGET = 0;
console.log(`static-contract-risk audit · ${readers.length} source-reader tests · ${findings.length} implementation-coupled assertion candidates`);
if (readers.length) console.log(`source-readers: ${readers.map(relative).join(' · ')}`);
if (hotspots.length) console.log(`hotspots: ${hotspots.map(([name, count]) => `${name}:${count}`).join(' · ')}`);
console.log(`budget: source-readers <= ${SOURCE_READER_BUDGET} · implementation-coupled <= ${IMPLEMENTATION_ASSERT_BUDGET}`);
if (readers.length > SOURCE_READER_BUDGET || findings.length > IMPLEMENTATION_ASSERT_BUDGET) {
  console.error('FAIL: contrato fósil detectado. Prueba comportamiento/helper público o usa un gate dedicado; no leas implementación como texto.');
  process.exit(1);
}
console.log('OK: cero tests frontend/backend leen implementación como texto; los contratos viven en comportamiento o gates dedicados.');
