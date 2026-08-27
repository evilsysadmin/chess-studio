import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { request, requestJson } from './http.js';

beforeEach(() => { global.fetch = vi.fn(); });
afterEach(() => { vi.useRealTimers(); });

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

  it('tolera error sin cuerpo JSON sin enseñar el mensaje técnico', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 500, headers: { get: () => null }, json: async () => { throw new Error('no json'); } });
    await expect(requestJson('/api/test')).rejects.toThrow('Chess Studio ha tenido un problema al procesar esto.');
  });

  it('normaliza también fallos de red antes de recibir HTTP', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(requestJson('/api/test')).rejects.toThrow('No hemos podido conectar con Chess Studio.');
  });

  it('aborta un fetch colgado y libera el watchdog', async () => {
    vi.useFakeTimers();
    global.fetch.mockImplementation((_url, options = {}) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(options.signal.reason || new Error('aborted')), { once: true });
    }));
    const pending = request('/api/slow', { timeoutMs: 25 });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError', timedOut: true });
    await vi.advanceTimersByTimeAsync(30);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

});
