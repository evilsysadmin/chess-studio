import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearNarrativeCallLedger, loadNarrativeCallLedger } from './narrativeCallLedger.js';
import { requestRemoteNarrative } from './narrativeRemote.js';

describe('remote narrative cancellation', () => {
  beforeEach(() => {
    localStorage.clear();
    clearNarrativeCallLedger();
  });

  it('propaga AbortSignal y no registra una cancelación explícita como fallo de transporte', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url, init) => new Promise((_resolve, reject) => {
      expect(init.signal).not.toBe(controller.signal);
      expect(init.signal.aborted).toBe(false);
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }));

    const pending = requestRemoteNarrative(
      { eventType: 'player_portrait', requestKind: 'portrait_auto', facts: { total_games: 12 } },
      { token: 'jwt', fetchImpl, signal: controller.signal, timeoutMs: 5000 },
    );

    controller.abort(new DOMException('Portrait refresh superseded', 'AbortError'));

    await expect(pending).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(loadNarrativeCallLedger()).toEqual([]);
  });
});
