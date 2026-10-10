const BUILD = new URL(self.location.href).searchParams.get('build') || 'unknown';
const SAFE_BUILD = BUILD.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
const CACHE_PREFIX = 'chess-studio-shell-v4-';
const CACHE = `${CACHE_PREFIX}${SAFE_BUILD}`;
const SHELL = ['./manifest.webmanifest', './favicon.svg', './favicon-32.png', './apple-touch-icon.png'];
 
// Keep previously fetched content-addressed JS/CSS available to open tabs
// across a Pages release switch. The shell/HTML/API stay network-owned.
const RUNTIME_ASSET_CACHE = 'chess-studio-immutable-runtime-v1';
const RUNTIME_CACHE_LIMIT = 160;
const HASHED_RUNTIME_ASSET_RE = /^\/assets\/[a-zA-Z0-9_./-]+-[a-zA-Z0-9_-]{8,}\.(?:js|mjs|css)$/;

function isHashedRuntimeAsset(url) {
  return url.origin === self.location.origin
    && !url.search
    && HASHED_RUNTIME_ASSET_RE.test(url.pathname);
}

function isSafeRuntimeResponse(response, path) {
  if (!response?.ok || response.type === 'opaque') return false;
  const mime = (response.headers.get('content-type') || '').toLowerCase();
  const policy = (response.headers.get('cache-control') || '').toLowerCase();
  if (/no-store|private/.test(policy)) return false;
  return path.endsWith('.css')
    ? mime.includes('text/css')
    : mime.includes('javascript') || mime.includes('ecmascript');
}

async function runtimeAssetResponse(request) {
  // Degrade to normal network loading when CacheStorage is unavailable.
  let cache;
  try {
    cache = await caches.open(RUNTIME_ASSET_CACHE);
    const existing = await cache.match(request);
    if (existing) return existing;
  } catch {
    return fetch(request);
  }

  // Do not cache HTML SPA fallbacks or 404s as JS chunks.
  const response = await fetch(request);
  if (isSafeRuntimeResponse(response, new URL(request.url).pathname)) {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - RUNTIME_CACHE_LIMIT))
        .map((key) => cache.delete(key)));
    } catch {
      // Quota/security errors never block an otherwise healthy module load.
    }
  }
  return response;
}

function scopedUrl(path) {
  return new URL(path, self.registration.scope).href;
}

async function refreshShell() {
  const cache = await caches.open(CACHE);
  await Promise.all(SHELL.map(async (path) => {
    const url = scopedUrl(path);
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error(`shell fetch failed: ${response.status} ${url}`);
    await cache.put(url, response);
  }));
}

self.addEventListener('install', (event) => {
  // Cache only release-stable install metadata/icons. Do not cache index.html:
  // Vite entrypoints are content-addressed and an old HTML shell can reference
  // assets that no longer exist after a deploy.
  event.waitUntil(refreshShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('chess-studio-shell-') && key !== CACHE)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // The app worker owns only Chess Studio. Third-party telemetry such as
  // Cloudflare Web Analytics must never become a rejected FetchEvent here.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;

  // Only cache successful immutable JS/CSS chunks by their hashed URLs.
  // Old tabs must be able to import their already-fetched modules after Pages
  // switches the current deployment. Never cache HTML, API or arbitrary files.
  if (isHashedRuntimeAsset(url)) {
    event.respondWith(runtimeAssetResponse(request));
    return;
  }
  if (url.pathname.includes('/assets/')) return;

  if (request.mode === 'navigate') {
    // Never fall back to a cached index.html. Without the matching hashed JS/CSS
    // that shell is not a usable offline app and can strand clients on removed
    // entrypoints after a deploy. A network failure should fail visibly instead
    // of manufacturing a stale application shell.
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
