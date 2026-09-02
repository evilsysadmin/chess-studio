#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const FRONTEND_SRC = path.join(ROOT, 'frontend', 'src');
const OUTPUT_DIR = path.join(ROOT, '.performance');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'runtime-surface.json');
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const CSS_EXTENSIONS = new Set(['.css']);
const LARGE_JS_BYTES = 60 * 1024;
const LARGE_CSS_BYTES = 80 * 1024;

function walk(dir, rows = []) {
  if (!fs.existsSync(dir)) return rows;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, rows);
    else if (entry.isFile()) rows.push(full);
  }
  return rows;
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function countMatches(text, regex) {
  return [...text.matchAll(regex)].length;
}

function kib(bytes) {
  return Math.round((bytes / 1024) * 10) / 10;
}

function top(rows, count = 10) {
  return [...rows].sort((a, b) => b.bytes - a.bytes).slice(0, count);
}

function formatRows(rows) {
  return rows.map((row) => `- ${row.path}: ${kib(row.bytes)} KiB`).join('\n') || '- none';
}

const files = walk(FRONTEND_SRC);
const sourceRows = [];
let jsBytes = 0;
let cssBytes = 0;
let webglRendererSites = 0;
let rafSites = 0;
let intersectionObserverSites = 0;
let resizeObserverSites = 0;

for (const file of files) {
  const extension = path.extname(file).toLowerCase();
  if (!JS_EXTENSIONS.has(extension) && !CSS_EXTENSIONS.has(extension)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const bytes = Buffer.byteLength(text);
  const row = { path: relative(file), bytes };
  sourceRows.push(row);

  if (JS_EXTENSIONS.has(extension)) {
    jsBytes += bytes;
    webglRendererSites += countMatches(text, /new\s+(?:THREE\.)?WebGLRenderer\s*\(/g);
    rafSites += countMatches(text, /\brequestAnimationFrame\s*\(/g);
    intersectionObserverSites += countMatches(text, /new\s+IntersectionObserver\s*\(/g);
    resizeObserverSites += countMatches(text, /new\s+ResizeObserver\s*\(/g);
  } else {
    cssBytes += bytes;
  }
}

const jsRows = sourceRows.filter((row) => JS_EXTENSIONS.has(path.extname(row.path).toLowerCase()));
const cssRows = sourceRows.filter((row) => CSS_EXTENSIONS.has(path.extname(row.path).toLowerCase()));
const report = {
  generatedAt: new Date().toISOString(),
  sourceFileCount: sourceRows.length,
  jsBytes,
  cssBytes,
  runtimeSites: {
    webglRenderer: webglRendererSites,
    requestAnimationFrame: rafSites,
    intersectionObserver: intersectionObserverSites,
    resizeObserver: resizeObserverSites,
  },
  largeModules: {
    jsThresholdBytes: LARGE_JS_BYTES,
    cssThresholdBytes: LARGE_CSS_BYTES,
    js: jsRows.filter((row) => row.bytes >= LARGE_JS_BYTES).sort((a, b) => b.bytes - a.bytes),
    css: cssRows.filter((row) => row.bytes >= LARGE_CSS_BYTES).sort((a, b) => b.bytes - a.bytes),
  },
  topJs: top(jsRows),
  topCss: top(cssRows),
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  '## Frontend runtime surface',
  '',
  `- Source files scanned: ${report.sourceFileCount}`,
  `- JS/TS source: ${kib(jsBytes)} KiB`,
  `- CSS source: ${kib(cssBytes)} KiB`,
  `- WebGLRenderer construction sites: ${webglRendererSites}`,
  `- requestAnimationFrame sites: ${rafSites}`,
  `- IntersectionObserver sites: ${intersectionObserverSites}`,
  `- ResizeObserver sites: ${resizeObserverSites}`,
  `- Large JS modules (>= ${LARGE_JS_BYTES / 1024} KiB): ${report.largeModules.js.length}`,
  `- Large CSS files (>= ${LARGE_CSS_BYTES / 1024} KiB): ${report.largeModules.css.length}`,
  '',
  '### Largest JS/TS modules',
  formatRows(report.topJs),
  '',
  '### Largest CSS files',
  formatRows(report.topCss),
  '',
  '> Informational only. Track the trend first; turn stable budgets into gates later.',
].join('\n');

console.log(summary);
console.log(`\nJSON report: ${relative(OUTPUT_FILE)}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
