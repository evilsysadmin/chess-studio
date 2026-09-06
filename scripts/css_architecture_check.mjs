#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const entry = path.join(root, 'frontend', 'src', 'styles.css');
const manifest = JSON.parse(fs.readFileSync(path.join(here, 'css_architecture_manifest.json'), 'utf8'));
const orderedModules = manifest.orderedModules || [];
const globalModules = manifest.globalModules || orderedModules;
const lazyModules = manifest.lazyModules || [];

const orderedSet = new Set(orderedModules);
const globalSet = new Set(globalModules);
const lazySet = new Set(lazyModules);
const duplicates = (items) => items.filter((name, index) => items.indexOf(name) !== index);
const failures = [];

if (duplicates(orderedModules).length) failures.push(`orderedModules contiene duplicados: ${duplicates(orderedModules).join(', ')}`);
if (duplicates(globalModules).length) failures.push(`globalModules contiene duplicados: ${duplicates(globalModules).join(', ')}`);
if (duplicates(lazyModules).length) failures.push(`lazyModules contiene duplicados: ${duplicates(lazyModules).join(', ')}`);
for (const name of globalModules) {
  if (!orderedSet.has(name)) failures.push(`globalModules referencia un módulo fuera del inventario: ${name}`);
  if (lazySet.has(name)) failures.push(`módulo declarado a la vez global y lazy: ${name}`);
}
for (const name of lazyModules) {
  if (!orderedSet.has(name)) failures.push(`lazyModules referencia un módulo fuera del inventario: ${name}`);
}
for (const name of orderedModules) {
  if (!globalSet.has(name) && !lazySet.has(name)) failures.push(`módulo canónico sin estrategia de carga: ${name}`);
}
if (failures.length) {
  console.error('css-architecture-check FAIL · manifiesto de carga inválido');
  failures.forEach((message) => console.error(` - ${message}`));
  process.exit(1);
}

const entrySource = fs.readFileSync(entry, 'utf8');
const expectedImports = globalModules.map((name) => `@import './styles/${name}';`).join('\n') + '\n';
if (entrySource !== expectedImports) {
  console.error(`css-architecture-check FAIL · styles.css debe contener sólo los ${globalModules.length} imports globales ordenados del manifiesto.`);
  process.exit(1);
}

const chunks = orderedModules.map((name) => fs.readFileSync(path.join(root, 'frontend', 'src', 'styles', name)));
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
console.log(`css-architecture-check OK · ${orderedModules.length} módulos canónicos · ${globalModules.length} globales · ${lazyModules.length} lazy · ${manifest.combinedLines} líneas originales · ${combined.length} bytes · orden preservado`);
