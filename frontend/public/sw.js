const BUILD = new URL(self.location.href).searchParams.get('build') || 'unknown';
const SAFE_BUILD = BUILD.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
const CACHE_PREFIX = 'chess-studio-shell-v3-';
const CACHE = `${CACHE_PREFIX}${SAFE_BUILD}`;
const SHELL = ['./', './manifest.webmanifest', './favicon.svg', './favicon-32.png', './apple-touch-icon.png'];

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
  // Never write a new release into the cache used by the currently active
  // worker. A build-scoped cache makes shell swaps atomic instead of mixing an
  // old index.html with a new set of hashed Vite assets.
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
  // shell cache prevents cross-release JS/CSS mixtures.
  if (url.pathname.includes('/assets/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error(`navigation fetch failed: ${response.status}`);
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE);
          return (await cache.match(scopedUrl('./'))) || Response.error();
        }),
    );
    return;
  }

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request)));
});
