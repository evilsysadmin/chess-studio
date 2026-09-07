const BUILD = new URL(self.location.href).searchParams.get('build') || 'unknown';
const SAFE_BUILD = BUILD.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
const CACHE_PREFIX = 'chess-studio-shell-v4-';
const CACHE = `${CACHE_PREFIX}${SAFE_BUILD}`;
const SHELL = ['./manifest.webmanifest', './favicon.svg', './favicon-32.png', './apple-touch-icon.png'];

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

  // Vite assets are content-addressed and already carry a one-year immutable
  // HTTP cache policy. Let the browser/CDN own them; keeping them out of the
  // worker cache prevents cross-release JS/CSS mixtures.
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
