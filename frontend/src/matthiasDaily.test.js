import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKEN_KEY } from './auth.js';
import { askMatthiasDaily, fetchMatthiasBriefing, fetchMatthiasDailyStatus, resetOwnMatthiasMemory } from './matthiasDaily.js';

const USERNAME_KEY = 'chess-study-auth-username';

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
    localStorage.setItem(USERNAME_KEY, 'player');
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

  it('comparte una lectura GET concurrente del estado de Matthias y permite refrescar después', async () => {
    global.fetch.mockResolvedValue(response(200, { used: false, memory: { consultations: 2 } }));
    const first = fetchMatthiasDailyStatus();
    const second = fetchMatthiasDailyStatus();
    const [a, b] = await Promise.all([first, second]);

    expect(a.memory.consultations).toBe(2);
    expect(b.memory.consultations).toBe(2);
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await fetchMatthiasDailyStatus();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('no comparte una GET pendiente entre identidades distintas', async () => {
    let resolveAlice;
    let resolveBob;
    global.fetch
      .mockImplementationOnce(() => new Promise((resolve) => { resolveAlice = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveBob = resolve; }));

    localStorage.setItem(USERNAME_KEY, 'alice');
    localStorage.setItem(TOKEN_KEY, 'alice-token');
    const alice = fetchMatthiasDailyStatus();

    localStorage.setItem(USERNAME_KEY, 'bob');
    localStorage.setItem(TOKEN_KEY, 'bob-token');
    const bob = fetchMatthiasDailyStatus();

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer alice-token');
    expect(global.fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer bob-token');

    resolveAlice(response(200, { memory: { owner: 'alice' } }));
    resolveBob(response(200, { memory: { owner: 'bob' } }));
    await expect(alice).resolves.toMatchObject({ memory: { owner: 'alice' } });
    await expect(bob).resolves.toMatchObject({ memory: { owner: 'bob' } });
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
