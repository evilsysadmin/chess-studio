#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(root, 'RELEASE.txt');
const jsPath = path.join(root, 'frontend', 'src', 'release.js');

function fail(message) {
  console.error(`release-check FAIL · ${message}`);
  process.exit(1);
}

const js = fs.readFileSync(jsPath, 'utf8');
const jsRelease = js.match(/APP_RELEASE\s*=\s*['\"]([^'\"]+)['\"]/i)?.[1] || null;

if (!jsRelease) fail('frontend/src/release.js no exporta APP_RELEASE reconocible');
if (!/^v\d+\.\d+[a-z0-9.]*$/i.test(jsRelease)) fail(`APP_RELEASE inválida: ${jsRelease}`);

if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8').trim();
  const manifestRelease = manifest.match(/v\d+\.\d+[a-z0-9.]*/i)?.[0] || null;
  if (!manifestRelease) fail('RELEASE.txt existe pero no contiene una versión reconocible');
  if (manifestRelease !== jsRelease) fail(`RELEASE.txt=${manifestRelease} pero APP_RELEASE=${jsRelease}`);
  console.log(`release-check OK · ${jsRelease} · RELEASE.txt sincronizado`);
} else {
  console.log(`release-check OK · ${jsRelease} · RELEASE.txt ausente (manifiesto opcional)`);
}
