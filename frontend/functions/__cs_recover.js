const NO_STORE_HEADERS = Object.freeze({
  'Cache-Control': 'no-store, no-cache, must-revalidate',
  'Clear-Site-Data': '"cache"',
});

function reject(status) {
  return new Response(null, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      Allow: 'POST',
    },
  });
}

export async function onRequestPost({ request }) {
  const requestUrl = new URL(request.url);
  if (request.headers.get('Origin') !== requestUrl.origin) return reject(403);
  if (request.headers.get('X-Chess-Studio-Recovery') !== '1') return reject(403);
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reject(415);

  let payload;
  try {
    payload = await request.json();
  } catch {
    return reject(400);
  }

  if (!/^[a-z0-9]{6,32}$/i.test(String(payload?.nonce || ''))) return reject(400);

  return new Response(null, {
    status: 204,
    headers: NO_STORE_HEADERS,
  });
}

export function onRequest() {
  return reject(405);
}
