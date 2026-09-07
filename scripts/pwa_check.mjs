import fs from 'node:fs';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const notFound = fs.readFileSync(new URL('../frontend/public/404.html', import.meta.url), 'utf8');
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
assert(notFound.includes('<title>404 · Chess Studio</title>'), 'falta 404.html top-level para impedir el fallback SPA sobre assets inexistentes');
assert(main.includes('installChessStudioPwa()'), 'la app no registra la experiencia PWA');
assert(pwaInstall.includes('APP_BUILD_ID') && pwaInstall.includes('sw.js?build='), 'el registro del worker no cambia por build');
assert(worker.includes("request.mode === 'navigate'") && worker.includes("fetch(request, { cache: 'no-store' })"), 'la navegación PWA no exige shell fresco de red');
assert(!worker.includes("cache.match(scopedUrl('./'))"), 'el worker todavía puede revivir un index.html stale');
assert(!worker.includes("const SHELL = ['./'"), 'el worker todavía precachea index.html');
assert(worker.includes("pathname.includes('/api/')"), 'el worker no excluye API dinámica');
assert(worker.includes("CACHE_PREFIX = 'chess-studio-shell-v4-'") && worker.includes('SAFE_BUILD'), 'la caché PWA no está aislada por build v4');
assert(worker.includes("url.origin !== self.location.origin"), 'el worker intercepta peticiones de terceros');
assert(worker.includes("pathname.includes('/assets/')"), 'los assets Vite hashed siguen pasando por la caché PWA');
assert(!worker.includes("const CACHE = 'chess-studio-shell-v2'"), 'la caché compartida entre releases sigue activa');
assert(html.includes('chess-studio-module-recovery-v1'), 'index no protege el arranque frente a entrypoints stale');
assert(html.includes("'vite:preloadError'") && html.includes('navigator.serviceWorker.getRegistrations()'), 'la recuperación de chunks stale no limpia PWA antes de recargar');
assert(html.includes("key.startsWith('chess-studio-shell-')") && html.includes('__cs_recover'), 'la recuperación no purga caches legacy/cache-bust de navegación');
assert(html.includes('searchParams.delete(RECOVERY_PARAM)') && html.includes('history.replaceState'), 'la recuperación deja visible el cache-buster en la URL');

console.log('pwa-check OK · assets inexistentes dan 404 real + navegación sin shell stale + autorecuperación de módulos + API/assets/terceros fuera del cache PWA');
