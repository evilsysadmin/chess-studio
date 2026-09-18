import fs from 'node:fs';
import vm from 'node:vm';
import { FRONTEND_CSP, applyFrontendCsp } from './apply_frontend_csp.mjs';
import { onRequest as moduleRecoveryFallback, onRequestPost as moduleRecoveryPost } from '../frontend/functions/__cs_recover.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const frontendPackage = JSON.parse(fs.readFileSync(new URL('../frontend/package.json', import.meta.url), 'utf8'));
const notFound = fs.readFileSync(new URL('../frontend/public/404.html', import.meta.url), 'utf8');
const main = fs.readFileSync(new URL('../frontend/src/main.jsx', import.meta.url), 'utf8');
const pwaInstall = fs.readFileSync(new URL('../frontend/src/pwaInstall.js', import.meta.url), 'utf8');
const worker = fs.readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');
const moduleRecovery = fs.readFileSync(new URL('../frontend/public/moduleRecovery.js', import.meta.url), 'utf8');
const chesscomBabylon = fs.readFileSync(new URL('../frontend/src/chesscomBabylonPremium.js', import.meta.url), 'utf8');
const pagesHeaders = fs.readFileSync(new URL('../frontend/public/_headers', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(`pwa-check FAIL · ${message}`);
}

function moduleRecoveryReplacementFor(href) {
  let replacement = null;
  vm.runInNewContext(moduleRecovery, {
    URL,
    location: { href },
    history: {
      state: null,
      replaceState(_state, _title, url) { replacement = url; },
    },
    addEventListener() {},
  });
  return replacement;
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
assert(pagesHeaders.includes('X-Content-Type-Options: nosniff'), 'Cloudflare Pages no envía nosniff');
assert(pagesHeaders.includes('X-Frame-Options: SAMEORIGIN'), 'Cloudflare Pages no restringe framing a same-origin');
assert(pagesHeaders.includes("Content-Security-Policy: frame-ancestors 'self'"), 'Cloudflare Pages no restringe frame-ancestors a same-origin por cabecera HTTP');
assert(pagesHeaders.includes('Referrer-Policy: no-referrer'), 'Cloudflare Pages no aplica Referrer-Policy');
assert(pagesHeaders.includes('Permissions-Policy: camera=(), microphone=(), geolocation=()'), 'Cloudflare Pages no restringe permisos sensibles');
assert(pagesHeaders.includes('Strict-Transport-Security: max-age=31536000'), 'Cloudflare Pages no aplica HSTS');
assert(frontendPackage.dependencies?.babylonjs === '9.25.0', 'Chesscom no fija la versión local de Babylon.js');
assert(chesscomBabylon.includes("import('babylonjs')"), 'Chesscom no carga Babylon.js desde el bundle local');
assert(!/https?:\/\//.test(chesscomBabylon), 'Chesscom intenta cargar scripts remotos incompatibles con la CSP');
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
assert(moduleRecovery.includes("key.startsWith('chess-studio-shell-')"), 'la recuperación no purga caches legacy antes de recargar');
assert(moduleRecovery.includes("method: 'POST'") && moduleRecovery.includes("fetch(RECOVERY_ENDPOINT"), 'la recuperación de chunks stale no usa el intercambio POST same-origin');
assert(!moduleRecovery.includes('searchParams.set(') && !moduleRecovery.includes('location.replace('), 'la recuperación vuelve a exponer un cache-buster en la query string');
assert(moduleRecovery.includes("'__cs_recover'") && moduleRecovery.includes("'_cs_recover'"), 'la compatibilidad no reconoce las dos variantes legacy del cache-buster');
assert(moduleRecovery.includes('searchParams.has(param)') && moduleRecovery.includes('history.replaceState'), 'la compatibilidad no limpia URLs legacy con cache-buster');
assert(moduleRecoveryReplacementFor('https://staging.chess-studio.shadowops.dpdns.org/?_cs_recover=mu464l64') === '/', 'la variante OCI _cs_recover queda visible en la URL');
assert(moduleRecoveryReplacementFor('https://staging.chess-studio.shadowops.dpdns.org/?__cs_recover=legacy&keep=1#war') === '/?keep=1#war', 'la variante legacy __cs_recover no se limpia preservando query/hash útiles');
assert(moduleRecoveryReplacementFor('https://staging.chess-studio.shadowops.dpdns.org/?keep=1#war') === null, 'la limpieza toca URLs que no contienen recovery cache-buster');

const recoveryOrigin = 'https://staging.chess-studio.shadowops.dpdns.org';
const recoveryResponse = await moduleRecoveryPost({
  request: new Request(`${recoveryOrigin}/__cs_recover`, {
    method: 'POST',
    headers: {
      Origin: recoveryOrigin,
      'Content-Type': 'application/json',
      'X-Chess-Studio-Recovery': '1',
    },
    body: JSON.stringify({ nonce: 'mu45dge9' }),
  }),
});
assert(recoveryResponse.status === 204, 'la Pages Function rechaza un recovery POST same-origin válido');
assert(recoveryResponse.headers.get('clear-site-data') === '"cache"', 'el recovery POST no invalida la caché HTTP del origen');
assert(recoveryResponse.headers.get('cache-control')?.includes('no-store'), 'el recovery POST puede quedar cacheado');
const crossOriginRecovery = await moduleRecoveryPost({
  request: new Request(`${recoveryOrigin}/__cs_recover`, {
    method: 'POST',
    headers: {
      Origin: 'https://example.invalid',
      'Content-Type': 'application/json',
      'X-Chess-Studio-Recovery': '1',
    },
    body: JSON.stringify({ nonce: 'mu45dge9' }),
  }),
});
assert(crossOriginRecovery.status === 403, 'el recovery POST acepta orígenes ajenos');
assert(moduleRecoveryFallback().status === 405, 'el endpoint de recovery acepta métodos distintos de POST');

console.log('pwa-check OK · CSP estricta + headers Pages + navegación sin shell stale + recovery POST con URL limpia + API/assets/terceros fuera del cache PWA');
