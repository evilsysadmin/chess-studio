import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./auth.js', () => ({
  getToken: () => 'jwt-test',
  getUsername: () => 'Alice',
}));

vi.mock('./requestId.js', () => ({
  withRequestId: (headers) => headers,
}));

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('Matthias daily status refresh', () => {
  it('reuses the short cache normally but force=true reads fresh cross-tab state', async () => {
    const responses = [
      { used: false, pending: true },
      { used: true, pending: false, text: 'Veredicto listo.' },
    ];
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => responses.shift(),
    }));

    const { fetchMatthiasDailyStatus } = await import('./matthiasDaily.js');

    expect(await fetchMatthiasDailyStatus()).toMatchObject({ pending: true });
    expect(await fetchMatthiasDailyStatus()).toMatchObject({ pending: true });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    expect(await fetchMatthiasDailyStatus({ force: true })).toMatchObject({ used: true, text: 'Veredicto listo.' });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
