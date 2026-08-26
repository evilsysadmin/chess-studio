#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = path.join(root, 'frontend', 'src', 'styles.css');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'css_architecture_manifest.json'), 'utf8'));
const entrySource = fs.readFileSync(entry, 'utf8');
const expectedImports = manifest.orderedModules.map((name) => `@import './styles/${name}';`).join('\n') + '\n';
if (entrySource !== expectedImports) {
  console.error(`css-architecture-check FAIL · styles.css debe contener sólo los ${manifest.orderedModules.length} imports ordenados del manifiesto.`);
  process.exit(1);
}
const chunks = manifest.orderedModules.map((name) => fs.readFileSync(path.join(root, 'frontend', 'src', 'styles', name)));
const combined = Buffer.concat(chunks);
const sha = crypto.createHash('sha256').update(combined).digest('hex');
if (sha !== manifest.combinedSha256) {
  console.error(`css-architecture-check FAIL · concatenación CSS cambió (${sha} != ${manifest.combinedSha256}). Actualiza el manifiesto sólo con un cambio CSS deliberado.`);
  process.exit(1);
}
if (combined.length !== manifest.combinedBytes) {
  console.error(`css-architecture-check FAIL · bytes ${combined.length} != ${manifest.combinedBytes}`);
  process.exit(1);
}
console.log(`css-architecture-check OK · ${manifest.orderedModules.length} módulos · ${manifest.combinedLines} líneas originales · ${combined.length} bytes · orden preservado`);
