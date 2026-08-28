import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { askMatthiasDaily, fetchMatthiasBriefing, resetOwnMatthiasMemory } from './matthiasDaily.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  };
}

describe('Matthias daily transport', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(TOKEN_KEY, 'player-token');
    global.fetch = vi.fn();
  });

  it('envía un consultationId estable para idempotencia del backend', async () => {
    global.fetch.mockResolvedValue(response(200, { text: 'ok', provider: 'cloudflare' }));
    await askMatthiasDaily('tactics', { total_games: 8 }, { id: 'fixed-consultation' });
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/matthias/daily');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({
      questionKind: 'tactics',
      facts: { total_games: 8 },
      consultationId: 'fixed-consultation',
    });
  });

  it('lee un briefing persistente sin consumir una audiencia', async () => {
    global.fetch.mockResolvedValue(response(200, { text: 'Objetivo en vigor.', memory: { consultations: 3 } }));
    const result = await fetchMatthiasBriefing();
    expect(result.text).toBe('Objetivo en vigor.');
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/matthias/briefing');
    expect(options.method).toBeUndefined();
  });

  it('puede borrar la memoria propia sin tocar otros endpoints de progreso', async () => {
    global.fetch.mockResolvedValue(response(200, { reset: true }));
    await resetOwnMatthiasMemory();
    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/matthias/reset-memory');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer player-token');
  });
});
