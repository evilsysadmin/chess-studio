import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../frontend/src/main.jsx', import.meta.url), 'utf8');
const pwaInstall = fs.readFileSync(new URL('../frontend/src/pwaInstall.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`pwa-check FAIL · ${message}`);
}

assert(manifest.name === 'Chess Studio' && manifest.display === 'standalone', 'manifest instalable incompleto');
assert(manifest.start_url === './' && manifest.scope === './', 'scope PWA no es portable bajo subruta');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'faltan iconos instalables');
assert(html.includes('%BASE_URL%manifest.webmanifest'), 'index no enlaza el manifest con la base de Vite');
assert(main.includes('installChessStudioPwa()'), 'la app no registra la experiencia PWA');
assert(pwaInstall.includes('APP_BUILD_ID') && pwaInstall.includes('sw.js?build='), 'el registro del worker no cambia por build');
assert(worker.includes("request.mode === 'navigate'") && worker.includes("cache.match(scopedUrl('./'))"), 'el worker no conserva shell offline');
assert(worker.includes("pathname.includes('/api/')"), 'el worker no excluye API dinámica');
assert(worker.includes("CACHE_PREFIX = 'chess-studio-shell-v3-'") && worker.includes('SAFE_BUILD'), 'la caché del shell no está aislada por build');
assert(worker.includes("url.origin !== self.location.origin"), 'el worker intercepta peticiones de terceros');
assert(worker.includes("pathname.includes('/assets/')"), 'los assets Vite hashed siguen pasando por la caché del shell');
assert(worker.includes("cache: 'no-store'"), 'la navegación online no fuerza shell fresco');
assert(!worker.includes("const CACHE = 'chess-studio-shell-v2'"), 'la caché compartida entre releases sigue activa');
assert(html.includes('chess-studio-module-recovery-v1'), 'index no protege el arranque frente a entrypoints stale');
assert(html.includes("'vite:preloadError'") && html.includes('navigator.serviceWorker.getRegistrations()'), 'la recuperación de chunks stale no limpia PWA antes de recargar');
assert(html.includes("key.startsWith('chess-studio-shell-')") && html.includes('__cs_recover'), 'la recuperación no purga shell/cache-bust de navegación');

console.log('pwa-check OK · shell atómico por build + autorecuperación de módulos stale + API/assets/terceros fuera del cache PWA');
