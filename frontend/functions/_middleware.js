const STATIC_ASSET_RE = /\.(?:avif|css|gif|glb|gltf|ico|jpe?g|js|json|mjs|mp3|ogg|png|svg|wasm|wav|webmanifest|webp|woff2?|ttf)$/i;

export function isStaticAssetPath(pathname) {
  const path = String(pathname || '');
  return path.startsWith('/assets/') || STATIC_ASSET_RE.test(path);
}

export function isHtmlResponse(response) {
  return String(response?.headers?.get?.('content-type') || '').toLowerCase().includes('text/html');
}

export async function onRequest(context) {
  const response = await context.next();
  const url = new URL(context.request.url);

  // Without a top-level 404.html, Cloudflare Pages correctly restores its SPA
  // fallback for navigations. The guard below keeps that fallback away from
  // static asset URLs so a missing hashed chunk can never masquerade as JS/CSS.
  if (isStaticAssetPath(url.pathname) && response.status === 200 && isHtmlResponse(response)) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
        'X-Chess-Studio-Asset-Guard': 'html-fallback-blocked',
      },
    });
  }

  return response;
}
