import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearNarrativeCallLedger, loadNarrativeCallLedger, recordNarrativeCall } from './narrativeCallLedger.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

const originalLocalStorage = global.localStorage;

beforeEach(() => {
  global.localStorage = originalLocalStorage;
  originalLocalStorage.clear();
  clearStorageMemoryFallback();
});

afterEach(() => {
  global.localStorage = originalLocalStorage;
  clearStorageMemoryFallback();
});

describe('AI call ledger clear persistence', () => {
  it('confirms a native clear when Web Storage accepts the write', () => {
    recordNarrativeCall({ eventType: 'mate', provider: 'cloudflare', ok: true });
    expect(loadNarrativeCallLedger()).toHaveLength(1);
    expect(clearNarrativeCallLedger()).toBe(true);
    expect(loadNarrativeCallLedger()).toEqual([]);
  });

  it('reports tab-only fallback when the browser rejects the clear', () => {
    originalLocalStorage.setItem('chess-study-narrative-call-ledger-v1', JSON.stringify([{ eventType: 'old' }]));
    global.localStorage = {
      getItem(key) { return originalLocalStorage.getItem(key); },
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem() { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(clearNarrativeCallLedger()).toBe(false);
    expect(loadNarrativeCallLedger()).toEqual([]);
    expect(originalLocalStorage.getItem('chess-study-narrative-call-ledger-v1')).toContain('old');
  });
});
