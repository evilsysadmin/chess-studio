import { beforeEach, describe, expect, it } from 'vitest';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY,
  PLAYER_PORTRAIT_MAX_CHARS,
  playerPortraitGenerationKey,
  loadCachedPlayerPortrait,
  saveCachedPlayerPortrait,
  markPlayerPortraitManualRefresh,
  playerPortraitManualRefreshState,
} from './playerPortraitCache.js';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY as facadeKey,
  PLAYER_PORTRAIT_MAX_CHARS as facadeMaxChars,
  playerPortraitGenerationKey as facadeGenerationKey,
  loadCachedPlayerPortrait as facadeLoad,
} from './aiPlayerPortrait.js';
import { clearStorageMemoryFallback } from './safeStorage.js';

describe('portrait cache initial-load boundary', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
  });

  it('keeps the persisted cache schema and public facade stable', () => {
    expect(AI_PLAYER_PORTRAIT_CACHE_KEY).toBe('chess-study-ai-player-portrait-v1');
    expect(PLAYER_PORTRAIT_MAX_CHARS).toBe(900);
    expect(playerPortraitGenerationKey({ totalGames: 3 })).toBe('9:3');
    expect(playerPortraitGenerationKey({ totalGames: 0 })).toBe('9:0');
    expect(facadeKey).toBe(AI_PLAYER_PORTRAIT_CACHE_KEY);
    expect(facadeMaxChars).toBe(PLAYER_PORTRAIT_MAX_CHARS);
    expect(facadeGenerationKey({ totalGames: 5 })).toBe(playerPortraitGenerationKey({ totalGames: 5 }));
  });

  it('persists a portrait for its identity and generation without leaking between users', () => {
    const generation = playerPortraitGenerationKey({ totalGames: 3 });
    expect(saveCachedPlayerPortrait(generation, '  Retrato de Alice.  ', 'Alice')).toBe(true);
    expect(loadCachedPlayerPortrait(generation, 'alice')).toBe('Retrato de Alice.');
    expect(facadeLoad(generation, 'ALICE')).toBe('Retrato de Alice.');
    expect(loadCachedPlayerPortrait(generation, 'bob')).toBeNull();
    expect(loadCachedPlayerPortrait(playerPortraitGenerationKey({ totalGames: 4 }), 'alice')).toBeNull();

    expect(saveCachedPlayerPortrait(generation, 'Retrato de Bob.', 'Bob')).toBe(true);
    expect(loadCachedPlayerPortrait(generation, 'alice')).toBe('Retrato de Alice.');
    expect(loadCachedPlayerPortrait(generation, 'bob')).toBe('Retrato de Bob.');
  });

  it('bounds portrait text and retains the manual cooldown when a new generation is saved', () => {
    const generation = playerPortraitGenerationKey({ totalGames: 3 });
    expect(saveCachedPlayerPortrait(generation, 'x'.repeat(PLAYER_PORTRAIT_MAX_CHARS + 50), 'alice')).toBe(true);
    expect(loadCachedPlayerPortrait(generation, 'alice')).toHaveLength(PLAYER_PORTRAIT_MAX_CHARS);
    expect(markPlayerPortraitManualRefresh({ now: 1_000_000, identityScope: 'alice' })).toBe(true);

    const nextGeneration = playerPortraitGenerationKey({ totalGames: 4 });
    expect(saveCachedPlayerPortrait(nextGeneration, 'Nuevo retrato.', 'alice')).toBe(true);
    const cooldown = playerPortraitManualRefreshState({ now: 1_000_001, identityScope: 'alice' });
    expect(cooldown.allowed).toBe(false);
    expect(cooldown.retryAfterMs).toBe(6 * 60 * 60 * 1000 - 1);
    expect(loadCachedPlayerPortrait(nextGeneration, 'alice')).toBe('Nuevo retrato.');
  });
});
