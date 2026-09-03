import worker from './index.js';

export * from './index.js';

// Staging-only wrapper: the production Worker stays untouched, while staging
// publishes the exact Git generation injected by its canonical deploy. This
// gives the pipeline a runtime identity check equivalent to backend /release
// and frontend release.json instead of trusting deployment provenance alone.
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      const response = await worker.fetch(request, env, ctx);
      const payload = await response.json();
      return new Response(JSON.stringify({
        ...payload,
        build: String(env.BUILD_SHA || ''),
      }), {
        status: response.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return worker.fetch(request, env, ctx);
  },
};
