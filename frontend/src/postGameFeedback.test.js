import { describe, expect, it } from 'vitest';
import { shouldAskPostGameFeedback } from './postGameFeedback.js';

describe('feedback post-partida', () => {
  it('no molesta en las dos primeras partidas y pregunta en la tercera', () => {
    expect(shouldAskPostGameFeedback({ completedGames: 1, randomValue: 0 })).toBe(false);
    expect(shouldAskPostGameFeedback({ completedGames: 2, randomValue: 0 })).toBe(false);
    expect(shouldAskPostGameFeedback({ completedGames: 3, randomValue: 0.99 })).toBe(true);
  });

  it('después sólo aparece con una probabilidad baja', () => {
    expect(shouldAskPostGameFeedback({ completedGames: 8, randomValue: 0.19 })).toBe(true);
    expect(shouldAskPostGameFeedback({ completedGames: 8, randomValue: 0.20 })).toBe(false);
    expect(shouldAskPostGameFeedback({ completedGames: 8, randomValue: 0.92 })).toBe(false);
  });

  it('respeta cooldown y máximo de una invitación por sesión', () => {
    const now = 10_000;
    expect(shouldAskPostGameFeedback({ completedGames: 3, nextPromptAt: now + 1, now })).toBe(false);
    expect(shouldAskPostGameFeedback({ completedGames: 3, sessionAsked: true, now })).toBe(false);
  });
});
