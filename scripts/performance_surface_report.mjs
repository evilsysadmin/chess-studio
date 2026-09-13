#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const FRONTEND_SRC = path.join(ROOT, 'frontend', 'src');
const FRONTEND_DIST = path.join(ROOT, 'frontend', 'dist');
const OUTPUT_DIR = path.join(ROOT, '.performance');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'runtime-surface.json');
const JS_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.ts', '.tsx']);
const CSS_EXTENSIONS = new Set(['.css']);
const LARGE_JS_BYTES = 60 * 1024;
const LARGE_CSS_BYTES = 80 * 1024;
// Data-backed ratchet: the measured baseline before this gate was 161.4 KiB gzip.
// 164 KiB leaves ~1.6% headroom for deterministic chunking noise without hiding real growth.
const INITIAL_JS_GZIP_BUDGET_BYTES = 164 * 1024;
const INITIAL_CSS_GZIP_BUDGET_BYTES = 68 * 1024;
// Architectural ratchet: lower this ceiling when renderer ownership is consolidated.
// Raising it requires an explicit lifecycle/GPU decision rather than accidental growth.
const MAX_WEBGL_RENDERER_SITES = 4;

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

function normalizeDistAsset(asset) {
  return asset.replace(/^\/+/, '');
}

function gzipDistAssets(assets) {
  return assets.reduce((total, asset) => {
    const assetPath = path.join(FRONTEND_DIST, normalizeDistAsset(asset));
    return total + gzipSync(fs.readFileSync(assetPath)).byteLength;
  }, 0);
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
const indexHtml = fs.readFileSync(path.join(FRONTEND_DIST, 'index.html'), 'utf8');
const initialCssAssets = [...indexHtml.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+\.css)["'][^>]*>/g)]
  .map((match) => match[1]);
const initialJsEntryAssets = [...indexHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*>/g)]
  .map((match) => match[1]);
const initialJsPreloadAssets = [...indexHtml.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']([^"']+\.js)["'][^>]*>/g)]
  .map((match) => match[1]);
const initialJsAssets = [...new Set([...initialJsEntryAssets, ...initialJsPreloadAssets])];
const initialCssGzipBytes = gzipDistAssets(initialCssAssets);
const initialJsGzipBytes = gzipDistAssets(initialJsAssets);
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
  runtimeBudgets: {
    webglRenderer: MAX_WEBGL_RENDERER_SITES,
  },
  largeModules: {
    jsThresholdBytes: LARGE_JS_BYTES,
    cssThresholdBytes: LARGE_CSS_BYTES,
    js: jsRows.filter((row) => row.bytes >= LARGE_JS_BYTES).sort((a, b) => b.bytes - a.bytes),
    css: cssRows.filter((row) => row.bytes >= LARGE_CSS_BYTES).sort((a, b) => b.bytes - a.bytes),
  },
  topJs: top(jsRows),
  topCss: top(cssRows),
  buildAssets: {
    initialCss: initialCssAssets,
    initialCssGzipBytes,
    initialCssGzipBudgetBytes: INITIAL_CSS_GZIP_BUDGET_BYTES,
    initialJs: initialJsAssets,
    initialJsEntry: initialJsEntryAssets,
    initialJsPreload: initialJsPreloadAssets,
    initialJsGzipBytes,
    initialJsGzipBudgetBytes: INITIAL_JS_GZIP_BUDGET_BYTES,
  },
};

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(OUTPUT_FILE, `${JSON.stringify(report, null, 2)}\n`);

const summary = [
  '## Frontend runtime surface',
  '',
  `- Source files scanned: ${report.sourceFileCount}`,
  `- JS/TS source: ${kib(jsBytes)} KiB`,
  `- CSS source: ${kib(cssBytes)} KiB`,
  `- WebGLRenderer construction sites: ${webglRendererSites} (budget ${MAX_WEBGL_RENDERER_SITES})`,
  `- requestAnimationFrame sites: ${rafSites}`,
  `- IntersectionObserver sites: ${intersectionObserverSites}`,
  `- ResizeObserver sites: ${resizeObserverSites}`,
  `- Large JS modules (>= ${LARGE_JS_BYTES / 1024} KiB): ${report.largeModules.js.length}`,
  `- Large CSS files (>= ${LARGE_CSS_BYTES / 1024} KiB): ${report.largeModules.css.length}`,
  `- Initial JS: ${kib(initialJsGzipBytes)} KiB gzip across ${initialJsAssets.length} asset(s) (budget ${INITIAL_JS_GZIP_BUDGET_BYTES / 1024} KiB)`,
  `- Initial CSS: ${kib(initialCssGzipBytes)} KiB gzip (budget ${INITIAL_CSS_GZIP_BUDGET_BYTES / 1024} KiB)`,
  '',
  '### Largest JS/TS modules',
  formatRows(report.topJs),
  '',
  '### Largest CSS files',
  formatRows(report.topCss),
  '',
  '> WebGL renderer count, initial JS and initial CSS are ratchets. Lower the ceilings as ownership and loading improve.',
].join('\n');

console.log(summary);
console.log(`\nJSON report: ${relative(OUTPUT_FILE)}`);

if (webglRendererSites > MAX_WEBGL_RENDERER_SITES) {
  throw new Error(`WebGLRenderer construction sites are ${webglRendererSites}; budget is ${MAX_WEBGL_RENDERER_SITES}`);
}

if (initialJsGzipBytes > INITIAL_JS_GZIP_BUDGET_BYTES) {
  throw new Error(`Initial JS is ${kib(initialJsGzipBytes)} KiB gzip; budget is ${INITIAL_JS_GZIP_BUDGET_BYTES / 1024} KiB`);
}

if (initialCssGzipBytes > INITIAL_CSS_GZIP_BUDGET_BYTES) {
  throw new Error(`Initial CSS is ${kib(initialCssGzipBytes)} KiB gzip; budget is ${INITIAL_CSS_GZIP_BUDGET_BYTES / 1024} KiB`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}
