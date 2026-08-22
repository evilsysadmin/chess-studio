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

const manifest = fs.readFileSync(manifestPath, 'utf8').trim();
const js = fs.readFileSync(jsPath, 'utf8');
const manifestRelease = manifest.match(/v\d+\.\d+[a-z0-9.]*/i)?.[0] || null;
const jsRelease = js.match(/APP_RELEASE\s*=\s*['\"]([^'\"]+)['\"]/i)?.[1] || null;

if (!manifestRelease) fail('RELEASE.txt no contiene una versión reconocible');
if (!jsRelease) fail('frontend/src/release.js no exporta APP_RELEASE reconocible');
if (manifestRelease !== jsRelease) fail(`RELEASE.txt=${manifestRelease} pero APP_RELEASE=${jsRelease}`);

console.log(`release-check OK · ${jsRelease}`);
