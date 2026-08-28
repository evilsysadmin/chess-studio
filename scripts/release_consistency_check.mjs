#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(root, 'RELEASE.txt');
const jsPath = path.join(root, 'frontend', 'src', 'release.js');
const publicManifestPath = path.join(root, 'frontend', 'public', 'release.json');
const backendReleasePath = path.join(root, 'backend-python', 'release_info.py');
const userReleaseNotesPath = path.join(root, 'frontend', 'src', 'userReleaseNotes.js');

function fail(message) {
  console.error(`release-check FAIL · ${message}`);
  process.exit(1);
}

const js = fs.readFileSync(jsPath, 'utf8');
const jsRelease = js.match(/APP_RELEASE\s*=\s*['\"]([^'\"]+)['\"]/i)?.[1] || null;

if (!jsRelease) fail('frontend/src/release.js no exporta APP_RELEASE reconocible');
if (!/^v\d+\.\d+[a-z0-9.]*$/i.test(jsRelease)) fail(`APP_RELEASE inválida: ${jsRelease}`);

if (!fs.existsSync(backendReleasePath)) fail('backend-python/release_info.py no existe');
const backendReleaseText = fs.readFileSync(backendReleasePath, 'utf8');
const backendRelease = backendReleaseText.match(/APP_RELEASE\s*=\s*['"]([^'"]+)['"]/i)?.[1] || null;
if (backendRelease !== jsRelease) fail(`backend APP_RELEASE=${backendRelease || 'sin release'} pero frontend APP_RELEASE=${jsRelease}`);
if (!/def\s+deployment_identity\s*\(/.test(backendReleaseText)) fail('backend-python/release_info.py debe exportar deployment_identity() para las deployment annotations');

if (fs.existsSync(manifestPath)) {
  const manifest = fs.readFileSync(manifestPath, 'utf8').trim();
  const manifestRelease = manifest.match(/v\d+\.\d+[a-z0-9.]*/i)?.[0] || null;
  if (!manifestRelease) fail('RELEASE.txt existe pero no contiene una versión reconocible');
  if (manifestRelease !== jsRelease) fail(`RELEASE.txt=${manifestRelease} pero APP_RELEASE=${jsRelease}`);
} else {
  console.log(`release-check INFO · ${jsRelease} · RELEASE.txt ausente (manifiesto opcional)`);
}


if (!fs.existsSync(userReleaseNotesPath)) fail('frontend/src/userReleaseNotes.js no existe');
const userReleaseNotesText = fs.readFileSync(userReleaseNotesPath, 'utf8');
const releaseNoteEntries = [...userReleaseNotesText.matchAll(/release\s*:\s*['"]([^'"]+)['"]/gi)].map((match) => match[1]);
const currentReleaseNoteCount = releaseNoteEntries.filter((release) => release === jsRelease).length;
if (currentReleaseNoteCount !== 1) {
  fail(`frontend/src/userReleaseNotes.js debe contener exactamente una entrada para ${jsRelease}; encontradas ${currentReleaseNoteCount}`);
}

if (!fs.existsSync(publicManifestPath)) fail('frontend/public/release.json no existe');
let publicManifest;
try {
  publicManifest = JSON.parse(fs.readFileSync(publicManifestPath, 'utf8'));
} catch (error) {
  fail(`frontend/public/release.json no es JSON válido: ${error.message}`);
}
if (publicManifest?.release !== jsRelease) {
  fail(`frontend/public/release.json=${publicManifest?.release || 'sin release'} pero APP_RELEASE=${jsRelease}`);
}
console.log(`release-check OK · ${jsRelease} · frontend/backend/RELEASE.txt/release.json/novedades sincronizados`);
