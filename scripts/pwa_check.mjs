import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../frontend/src/main.jsx', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`pwa-check FAIL · ${message}`);
}

assert(manifest.name === 'Chess Studio' && manifest.display === 'standalone', 'manifest instalable incompleto');
assert(manifest.start_url === './' && manifest.scope === './', 'scope PWA no es portable bajo subruta');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'faltan iconos instalables');
assert(html.includes('%BASE_URL%manifest.webmanifest'), 'index no enlaza el manifest con la base de Vite');
assert(main.includes('installChessStudioPwa()'), 'la app no registra la experiencia PWA');
assert(worker.includes("request.mode === 'navigate'") && worker.includes("caches.match('./')"), 'el worker no conserva shell offline');
assert(worker.includes("pathname.includes('/api/')"), 'el worker no excluye API dinámica');

console.log('pwa-check OK · manifest + instalación + shell offline + API network-only');
