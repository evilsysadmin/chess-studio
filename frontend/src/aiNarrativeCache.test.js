import { beforeEach, describe, expect, it } from 'vitest';
import { createAiNarrativeCache } from './aiNarrativeCache.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

const CACHE_KEY = 'chess-study-test-ai-narrative-cache';
const SIX_HOURS = 6 * 60 * 60 * 1000;

function createCache() {
  return createAiNarrativeCache({
    cacheKey: CACHE_KEY,
    schema: 3,
    maxChars: 120,
    manualRequestKind: 'manual',
    generationKeyRequired: true,
  });
}

describe('shared AI narrative cache', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('preserves text and manual cooldown independently for multiple identities', () => {
    const cache = createCache();
    expect(cache.save('g-alice', 'Lectura de Alice.', 'Alice')).toBe(true);
    expect(cache.markManualRefresh({ now: 1_000_000, identityScope: 'Alice' })).toBe(true);

    expect(cache.save('g-bob', 'Lectura de Bob.', 'bob')).toBe(true);
    expect(cache.markManualRefresh({ now: 2_000_000, identityScope: 'bob' })).toBe(true);

    expect(cache.load('g-alice', 'alice')).toBe('Lectura de Alice.');
    expect(cache.load('g-bob', 'BOB')).toBe('Lectura de Bob.');
    expect(cache.manualRefreshState({ now: 2_000_001, identityScope: 'alice' }).allowed).toBe(false);
    expect(cache.manualRefreshState({ now: 2_000_001, identityScope: 'bob' }).allowed).toBe(false);
  });

  it('migrates the legacy single-record shape without discarding that identity', () => {
    localStorage.setItem(CACHE_KEY, JSON.stringify({
      schema: 3,
      identityScope: 'Alice',
      generationKey: 'g-alice',
      text: 'Legacy Alice.',
      manualRequestedAt: 1_000_000,
    }));
    const cache = createCache();

    expect(cache.load('g-alice', 'alice')).toBe('Legacy Alice.');
    expect(cache.save('g-bob', 'Nueva lectura de Bob.', 'bob')).toBe(true);
    expect(cache.load('g-alice', 'ALICE')).toBe('Legacy Alice.');
    expect(cache.load('g-bob', 'bob')).toBe('Nueva lectura de Bob.');
    expect(cache.manualRefreshState({ now: 1_000_001, identityScope: 'alice' }).retryAfterMs).toBe(SIX_HOURS - 1);

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(stored.storeVersion).toBe(1);
    expect(stored.records).toHaveLength(2);
  });

  it('bounds retained identities and keeps the most recently written records', () => {
    const cache = createCache();
    for (let index = 0; index < 8; index += 1) {
      expect(cache.save(`g-${index}`, `Lectura ${index}`, `user-${index}`)).toBe(true);
    }

    const stored = JSON.parse(localStorage.getItem(CACHE_KEY));
    expect(stored.records).toHaveLength(6);
    expect(cache.load('g-0', 'user-0')).toBeNull();
    expect(cache.load('g-1', 'user-1')).toBeNull();
    expect(cache.load('g-2', 'user-2')).toBe('Lectura 2');
    expect(cache.load('g-7', 'user-7')).toBe('Lectura 7');
  });
});
