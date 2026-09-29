import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isTransientFailure, withTransientRetry } from './transientRetry.js';
import { api } from './api.js';

const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
const networkError = () => Object.assign(new Error('No se pudo conectar'), { cause: new TypeError('Failed to fetch') });

describe('isTransientFailure', () => {
  it('trata red caída y 502/503/504/52x como transitorios', () => {
    expect(isTransientFailure(networkError())).toBe(true);
    for (const status of [502, 503, 504, 520, 522, 530]) expect(isTransientFailure(httpError(status))).toBe(true);
  });

  it('no reintenta errores de reglas, auth, conflicto, timeouts ni aborts', () => {
    for (const status of [400, 401, 403, 404, 409, 422, 500]) expect(isTransientFailure(httpError(status))).toBe(false);
    expect(isTransientFailure(Object.assign(new Error('t'), { timedOut: true }))).toBe(false);
    expect(isTransientFailure(new DOMException('x', 'AbortError'))).toBe(false);
  });
});

describe('withTransientRetry', () => {
  const delays = [1, 1, 1];

  it('reintenta una operación idempotente hasta que el backend vuelve', async () => {
    const attempt = vi.fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValue('ok');
    await expect(withTransientRetry(attempt, { idempotent: true, delays })).resolves.toBe('ok');
    expect(attempt).toHaveBeenCalledTimes(3);
  });

  it('nunca reintenta una mutación sin garantía de idempotencia', async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(503));
    await expect(withTransientRetry(attempt, { idempotent: false, delays })).rejects.toMatchObject({ status: 503 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('se rinde al agotar el presupuesto y propaga el último error', async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(502));
    await expect(withTransientRetry(attempt, { idempotent: true, delays })).rejects.toMatchObject({ status: 502 });
    expect(attempt).toHaveBeenCalledTimes(delays.length + 1);
  });

  it('un 409 corta en seco: el conflicto CAS no es un fallo de red', async () => {
    const attempt = vi.fn().mockRejectedValue(httpError(409));
    await expect(withTransientRetry(attempt, { idempotent: true, delays })).rejects.toMatchObject({ status: 409 });
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('respeta el abort durante la espera entre intentos', async () => {
    const controller = new AbortController();
    const attempt = vi.fn().mockRejectedValue(networkError());
    const pending = withTransientRetry(attempt, { idempotent: true, delays: [10_000], signal: controller.signal });
    controller.abort(new DOMException('cambio de partida', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(attempt).toHaveBeenCalledTimes(1);
  });
});

describe('api.playMove durante un deploy', () => {
  beforeEach(() => { vi.useFakeTimers(); global.fetch = vi.fn(); });
  afterEach(() => { vi.useRealTimers(); });

  const game = { id: 'g1', fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', turn: 'b', history: [], status: 'playing', isGameOver: false, humanColor: 'w', difficulty: 10 };

  it('reintenta con la MISMA Idempotency-Key hasta que el backend responde', async () => {
    global.fetch
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce({ ok: false, status: 530, headers: { get: () => null }, json: async () => ({}) })
      .mockResolvedValue({ ok: true, status: 200, json: async () => game });
    const pending = api.playMove('g1', 'e2', 'e4', null, { operationId: 'move-op-0000001' });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ id: 'g1' });
    expect(global.fetch).toHaveBeenCalledTimes(3);
    const keys = global.fetch.mock.calls.map(([, options]) => options.headers['Idempotency-Key']);
    expect(new Set(keys)).toEqual(new Set(['move-op-0000001']));
  });

  it('sin operationId no reintenta la jugada', async () => {
    global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    const pending = api.playMove('g1', 'e2', 'e4');
    const assertion = expect(pending).rejects.toBeTruthy();
    await vi.runAllTimersAsync();
    await assertion;
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
