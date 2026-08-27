import { describe, expect, it, vi } from 'vitest';
import { abortableDelay, fetchWithTimeout, isAbortError } from './asyncControl.js';

describe('asyncControl', () => {
  it('cancela esperas diferidas sin dejar promesas vivas', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const pending = abortableDelay(5000, controller.signal);
    controller.abort(new DOMException('cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(isAbortError(new DOMException('cancelled', 'AbortError'))).toBe(true);
    vi.useRealTimers();
  });

  it('aborta fetch inyectable al vencer el watchdog', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = fetchWithTimeout(fetchImpl, '/slow', {}, 50);
    await vi.advanceTimersByTimeAsync(51);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError', timeout: true, timeoutMs: 50 });
    vi.useRealTimers();
  });

  it('propaga una cancelación externa antes del timeout', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
    }));
    const pending = fetchWithTimeout(fetchImpl, '/cancel', { signal: controller.signal }, 5000);
    controller.abort(new DOMException('session changed', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
