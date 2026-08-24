import { beforeEach, describe, expect, it, vi } from 'vitest';
import { request, requestJson } from './http.js';

beforeEach(() => { global.fetch = vi.fn(); });

describe('HTTP común', () => {
  it('añade un request id sin pisar headers del caller', async () => {
    global.fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    await request('/api/test', { headers: { Authorization: 'Bearer x' } });
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer x');
    expect(options.headers['X-Request-ID']).toBeTruthy();
  });

  it('propaga error seguro, status y request id', async () => {
    global.fetch.mockResolvedValue({
      ok: false, status: 409,
      headers: { get: (name) => name.toLowerCase() === 'x-request-id' ? 'req-409' : null },
      json: async () => ({ detail: 'Conflicto controlado.' }),
    });
    await expect(requestJson('/api/test')).rejects.toMatchObject({ message: 'Conflicto controlado. · Ref: req-409', status: 409, requestId: 'req-409' });
  });

  it('tolera error sin cuerpo JSON', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, json: async () => { throw new Error('no json'); } });
    await expect(requestJson('/api/test')).rejects.toThrow('Error 500');
  });
});
