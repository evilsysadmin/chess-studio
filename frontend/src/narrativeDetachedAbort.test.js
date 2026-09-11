import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNarrativeCallLedger, loadNarrativeCallLedger } from './narrativeCallLedger.js';
import { requestRemoteNarrativeDetached } from './narrativeRemote.js';

describe('detached narrative cancellation', () => {
  beforeEach(() => {
    localStorage.clear();
    clearNarrativeCallLedger();
  });

  it('aborta el transporte y silencia callbacks cuando se cancela', async () => {
    const onText = vi.fn();
    const onUnavailable = vi.fn();
    let observedSignal = null;
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      observedSignal = init.signal;
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));

    const cancel = requestRemoteNarrativeDetached(
      { eventType: 'blunder', facts: { san: 'Qd4' } },
      { token: 'jwt', fetchImpl, onText, onUnavailable, timeoutMs: 5000 },
    );

    expect(observedSignal?.aborted).toBe(false);
    cancel();
    expect(observedSignal?.aborted).toBe(true);

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(onText).not.toHaveBeenCalled();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(loadNarrativeCallLedger()).toEqual([]);
  });

  it('propaga también una señal externa al controlador detached', async () => {
    const external = new AbortController();
    let observedSignal = null;
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      observedSignal = init.signal;
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));

    requestRemoteNarrativeDetached(
      { eventType: 'tactic', facts: {} },
      { token: 'jwt', fetchImpl, signal: external.signal, timeoutMs: 5000 },
    );
    external.abort(new DOMException('Parent closed', 'AbortError'));

    expect(observedSignal?.aborted).toBe(true);
    await Promise.resolve();
    expect(loadNarrativeCallLedger()).toEqual([]);
  });
});
