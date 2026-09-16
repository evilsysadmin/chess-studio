import fs from 'node:fs';
import { FRONTEND_CSP, applyFrontendCsp } from './apply_frontend_csp.mjs';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const frontendPackage = JSON.parse(fs.readFileSync(new URL('../frontend/package.json', import.meta.url), 'utf8'));
const notFound = fs.readFileSync(new URL('../frontend/public/404.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../frontend/src/main.jsx', import.meta.url), 'utf8');
const pwaInstall = fs.readFileSync(new URL('../frontend/src/pwaInstall.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');
const moduleRecovery = fs.readFileSync(new URL('../frontend/public/moduleRecovery.js', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`pwa-check FAIL · ${message}`);
}

assert(manifest.name === 'Chess Studio' && manifest.display === 'standalone', 'manifest instalable incompleto');
assert(manifest.start_url === './' && manifest.scope === './', 'scope PWA no es portable bajo subruta');
assert(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'faltan iconos instalables');
assert(html.includes('%BASE_URL%manifest.webmanifest'), 'index no enlaza el manifest con la base de Vite');
assert(html.includes('%BASE_URL%moduleRecovery.js'), 'index no carga el bootstrap externo de recuperación');
assert(!/<script(?![^>]*\bsrc=)[^>]*>/i.test(html), 'index ha recuperado JavaScript inline incompatible con CSP estricta');
assert(!html.includes('Content-Security-Policy'), 'index de desarrollo no debe romper React Refresh con la CSP de producción');
const securedHtml = applyFrontendCsp(html);
const cspIndex = securedHtml.indexOf('http-equiv="Content-Security-Policy"');
const firstScript = securedHtml.indexOf('<script');
assert(cspIndex > 0 && firstScript > cspIndex, 'la CSP de producción no queda antes del primer script');
assert(frontendPackage.scripts?.build?.includes('apply_frontend_csp.mjs'), 'el build de producción no inyecta la CSP');
assert(FRONTEND_CSP.includes("script-src 'self' 'wasm-unsafe-eval'"), 'script-src no conserva WebAssembly sin abrir eval genérico');
assert(FRONTEND_CSP.includes("script-src-attr 'none'"), 'CSP no bloquea handlers JavaScript inline');
assert(!/script-src[^;]*'unsafe-inline'/.test(FRONTEND_CSP), 'script-src permite unsafe-inline');
assert(!/script-src[^;]*'unsafe-eval'/.test(FRONTEND_CSP), 'script-src permite unsafe-eval genérico');
assert(FRONTEND_CSP.includes("object-src 'none'") && FRONTEND_CSP.includes("base-uri 'self'"), 'CSP carece de object/base hardening');
let inlineRejected = false;
try { applyFrontendCsp('<meta charset="UTF-8"><script>alert(1)</script>'); } catch { inlineRejected = true; }
assert(inlineRejected, 'el transform de producción acepta JavaScript inline');
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
assert(moduleRecovery.includes('chess-studio-module-recovery-v1'), 'bootstrap externo no protege el arranque frente a entrypoints stale');
assert(moduleRecovery.includes("'vite:preloadError'") && moduleRecovery.includes('navigator.serviceWorker.getRegistrations()'), 'la recuperación de chunks stale no limpia PWA antes de recargar');
assert(moduleRecovery.includes("key.startsWith('chess-studio-shell-')") && moduleRecovery.includes('__cs_recover'), 'la recuperación no purga caches legacy/cache-bust de navegación');
assert(moduleRecovery.includes('searchParams.delete(RECOVERY_PARAM)') && moduleRecovery.includes('history.replaceState'), 'la recuperación deja visible el cache-buster en la URL');

console.log('pwa-check OK · CSP de producción sin JS inline + navegación sin shell stale + autorecuperación externa + API/assets/terceros fuera del cache PWA');
