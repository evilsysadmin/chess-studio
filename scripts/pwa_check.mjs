import fs from 'node:fs';
import vm from 'node:vm';
import { FRONTEND_CSP, applyFrontendCsp } from './apply_frontend_csp.mjs';
import { onRequest as moduleRecoveryFallback, onRequestPost as moduleRecoveryPost } from '../frontend/functions/__cs_recover.js';
import { onRequest as pagesMiddleware, isStaticAssetPath } from '../frontend/functions/_middleware.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../frontend/public/manifest.webmanifest', import.meta.url), 'utf8'));
const html = fs.readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
const frontendPackage = JSON.parse(fs.readFileSync(new URL('../frontend/package.json', import.meta.url), 'utf8'));
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
assert(/script-src[^;]*https:\/\/static\.cloudflareinsights\.com/.test(FRONTEND_CSP), 'script-src debe permitir el beacon de Cloudflare Web Analytics');
{
  // The only remote script host allowed is Cloudflare's analytics beacon; anything else weakens the policy.
  const scriptSrc = FRONTEND_CSP.split('; ').find((directive) => directive.startsWith('script-src '));
  const remoteHosts = scriptSrc.split(' ').slice(1).filter((token) => /^https?:/.test(token) || token === '*');
  assert(remoteHosts.length === 1 && remoteHosts[0] === 'https://static.cloudflareinsights.com', `script-src solo puede añadir el beacon de Cloudflare: ${remoteHosts.join(' ')}`);
}
assert(!/script-src[^;]*'unsafe-inline'/.test(FRONTEND_CSP), 'script-src permite unsafe-inline');
assert(!/script-src[^;]*'unsafe-eval'/.test(FRONTEND_CSP), 'script-src permite unsafe-eval genérico');
assert(/connect-src[^;]*\bblob:/.test(FRONTEND_CSP), 'connect-src debe permitir blob: para las texturas incrustadas de los GLB (GLTFLoader/ImageBitmapLoader)');
assert(FRONTEND_CSP.includes("object-src 'none'") && FRONTEND_CSP.includes("base-uri 'self'"), 'CSP carece de object/base hardening');
assert(pagesHeaders.includes('X-Content-Type-Options: nosniff'), 'Cloudflare Pages no envía nosniff');
assert(pagesHeaders.includes('X-Frame-Options: SAMEORIGIN'), 'Cloudflare Pages no restringe framing a same-origin');
assert(pagesHeaders.includes("Content-Security-Policy: frame-ancestors 'self'"), 'Cloudflare Pages no restringe frame-ancestors a same-origin por cabecera HTTP');
assert(pagesHeaders.includes('Referrer-Policy: no-referrer'), 'Cloudflare Pages no aplica Referrer-Policy');
assert(pagesHeaders.includes('Permissions-Policy: camera=(), microphone=(), geolocation=()'), 'Cloudflare Pages no restringe permisos sensibles');
assert(pagesHeaders.includes('Strict-Transport-Security: max-age=31536000'), 'Cloudflare Pages no aplica HSTS');
assert(/^\d+\.\d+\.\d+$/.test(frontendPackage.dependencies?.babylonjs || ''), 'Chesscom no fija una versión local exacta de Babylon.js');
assert(chesscomBabylon.includes("from 'babylonjs/package.json'"), 'Chesscom no deriva la etiqueta de versión del paquete Babylon.js instalado');
assert(chesscomBabylon.includes("import('babylonjs')"), 'Chesscom no carga Babylon.js desde el bundle local');
assert(!/https?:\/\//.test(chesscomBabylon), 'Chesscom intenta cargar scripts remotos incompatibles con la CSP');
let inlineRejected = false;
try { applyFrontendCsp('<meta charset="UTF-8"><script>alert(1)</script>'); } catch { inlineRejected = true; }
assert(inlineRejected, 'el transform de producción acepta JavaScript inline');
assert(!fs.existsSync(new URL('../frontend/public/404.html', import.meta.url)), 'un 404.html top-level desactiva el fallback SPA de Cloudflare Pages');
assert(isStaticAssetPath('/assets/app-deadbeef.js') && isStaticAssetPath('/models/piece.glb'), 'el guard no reconoce assets estáticos');
assert(!isStaticAssetPath('/classroom/full-screen'), 'el guard confunde una ruta SPA con un asset');
assert(main.includes('installChessStudioPwa()'), 'la app no registra la experiencia PWA');
assert(pwaInstall.includes('APP_BUILD_ID') && pwaInstall.includes('sw.js?build='), 'el registro del worker no cambia por build');
assert(worker.includes("request.mode === 'navigate'") && worker.includes("fetch(request, { cache: 'no-store' })"), 'la navegación PWA no exige shell fresco de red');
assert(!worker.includes("cache.match(scopedUrl('./'))"), 'el worker todavía puede revivir un index.html stale');
assert(!worker.includes("const SHELL = ['./'"), 'el worker todavía precachea index.html');
assert(worker.includes("pathname.includes('/api/')"), 'el worker no excluye API dinámica');
assert(worker.includes("CACHE_PREFIX = 'chess-studio-shell-v4-'") && worker.includes('SAFE_BUILD'), 'la caché PWA no está aislada por build v4');
assert(worker.includes("url.origin !== self.location.origin"), 'el worker intercepta peticiones de terceros');
assert(worker.includes('RUNTIME_ASSET_CACHE') && worker.includes('isHashedRuntimeAsset(url)'),
  'los chunks hashed JS/CSS no tienen continuidad entre despliegues');

// Exercise the real SW handler: an open game must still load a previously
// fetched JS chunk after the current Pages generation no longer serves it.
// The cache is keyed by immutable URL, not a mutable release name.
{
  const origin = 'https://staging.chess-studio.shadowops.dpdns.org';
  const oldChunk = `${origin}/assets/GameScreen-abc12345.js`;
  const missingChunk = `${origin}/assets/Board3D-deadbeef.js`;
  const htmlChunk = `${origin}/assets/False-abcd5678.js`;
  const handlers = new Map();
  const objects = new Map();
  let oldChunkServed = true;
  let networkCalls = 0;
  const stores = new Map();
  const cacheUrl = (request) => typeof request === 'string' ? request : request.url;
  const fakeCaches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async match(request) { return entries.get(cacheUrl(request))?.clone(); },
        async put(request, response) { entries.set(cacheUrl(request), response.clone()); },
        async keys() { return [...entries.keys()].map((url) => new Request(url)); },
        async delete(request) { return entries.delete(cacheUrl(request)); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const fakeFetch = async (request) => {
    networkCalls++;
    const url = cacheUrl(request);
    if (url === oldChunk && oldChunkServed) {
      return new Response('export default 42;', {
        status: 200,
        headers: { 'Content-Type': 'text/javascript', 'Cache-Control': 'public, max-age=31536000, immutable' },
      });
    }
    if (url === htmlChunk && !objects.has(url)) {
      objects.set(url, true);
      return new Response('<html>SPA fallback</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response('not found', { status: 404 });
  };
  const selfMock = {
    location: { href: `${origin}/sw.js?build=first`, origin },
    registration: { scope: `${origin}/` },
    addEventListener(type, handler) { handlers.set(type, handler); },
    clients: { claim: async () => {} },
    skipWaiting: async () => {},
  };
  vm.runInNewContext(worker, {
    self: selfMock, caches: fakeCaches, fetch: fakeFetch, URL, Request, Response,
  });
  const fetchFromWorker = async (url) => {
    const event = {
      request: new Request(url),
      respondWith(promise) { this.response = Promise.resolve(promise); },
    };
    handlers.get('fetch')(event);
    return event.response ? event.response : fakeFetch(event.request);
  };

  const initial = await fetchFromWorker(oldChunk);
  assert(initial.status === 200 && await initial.text() === 'export default 42;', 'no se pudo leer chunk antes del deploy');
  oldChunkServed = false;
  const before = networkCalls;
  const retained = await fetchFromWorker(oldChunk);
  assert(retained.status === 200 && await retained.text() === 'export default 42;',
    'un deploy ha roto el chunk hashed de una partida abierta');
  assert(networkCalls === before, 'el SW no prioriza un chunk immutable ya conservado');
  const unavailable = await fetchFromWorker(missingChunk);
  assert(unavailable.status === 404, 'el SW inventó un chunk que nunca llegó a cargar');
  await fetchFromWorker(htmlChunk);
  const rejectedFallback = await fetchFromWorker(htmlChunk);
  assert(rejectedFallback.status === 404, 'el SW cacheó HTML como JavaScript');
  const apiEvent = { request: new Request(`${origin}/api/games/123`), respondWith() { this.handled = true; } };
  handlers.get('fetch')(apiEvent);
  assert(!apiEvent.handled, 'el SW ha interceptado datos privados de la API');

  // A new release worker may rotate shell icons but must not delete the
  // immutable runtime cache while an older client still uses its chunks.
  stores.set('chess-studio-shell-v4-previous', new Map());
  let activation;
  handlers.get('activate')({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert(stores.has('chess-studio-immutable-runtime-v1'), 'activation borró los chunks de la partida');
  assert(!stores.has('chess-studio-shell-v4-previous'), 'activation mantuvo cachés shell obsoletas');
}
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

const guardedAsset = await pagesMiddleware({
  request: new Request(`${recoveryOrigin}/assets/missing-deadbeef.js`),
  next: async () => new Response('<!doctype html><html><body>SPA shell</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }),
});
assert(guardedAsset.status === 404, 'un asset inexistente puede recibir el shell HTML de la SPA');
assert(guardedAsset.headers.get('x-chess-studio-asset-guard') === 'html-fallback-blocked', 'el 404 de asset no acredita el guard');

const spaFallback = await pagesMiddleware({
  request: new Request(`${recoveryOrigin}/classroom/full-screen`),
  next: async () => new Response('<!doctype html><html><body>SPA shell</body></html>', {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }),
});
assert(spaFallback.status === 200, 'el middleware bloquea una navegación SPA válida');

console.log('pwa-check OK · CSP estricta + headers Pages + navegación sin shell stale + recovery POST con URL limpia + API/assets/terceros fuera del cache PWA');
