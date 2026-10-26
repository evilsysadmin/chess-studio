import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY,
  PLAYER_PORTRAIT_MAX_CHARS,
  playerPortraitGenerationKey,
} from './playerPortraitCache.js';
import {
  AI_PLAYER_PORTRAIT_CACHE_KEY as facadeKey,
  PLAYER_PORTRAIT_MAX_CHARS as facadeMaxChars,
  playerPortraitGenerationKey as facadeGenerationKey,
} from './aiPlayerPortrait.js';

describe('portrait cache initial-load boundary', () => {
  it('keeps the persisted cache schema and public facade stable', () => {
    expect(AI_PLAYER_PORTRAIT_CACHE_KEY).toBe('chess-study-ai-player-portrait-v1');
    expect(PLAYER_PORTRAIT_MAX_CHARS).toBe(900);
    expect(playerPortraitGenerationKey({ totalGames: 3 })).toBe('9:3');
    expect(playerPortraitGenerationKey({ totalGames: 0 })).toBe('9:0');
    expect(facadeKey).toBe(AI_PLAYER_PORTRAIT_CACHE_KEY);
    expect(facadeMaxChars).toBe(PLAYER_PORTRAIT_MAX_CHARS);
    expect(facadeGenerationKey({ totalGames: 5 })).toBe(playerPortraitGenerationKey({ totalGames: 5 }));
  });

  it('does not load the heavy player model from the eager refresh hook', () => {
    const source = readFileSync(fileURLToPath(new URL('./usePlayerPortraitRefresh.js', import.meta.url)), 'utf8');
    const cacheSource = readFileSync(fileURLToPath(new URL('./playerPortraitCache.js', import.meta.url)), 'utf8');
    expect(source).toContain("from './playerPortraitCache.js'");
    expect(source).toContain("import('./playerPortraitRefreshFacts.js')");
    expect(source).not.toContain("from './aiPlayerPortrait.js'");
    expect(cacheSource).not.toContain("from './playerModel.js'");
  });
});
