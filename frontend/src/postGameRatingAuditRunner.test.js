import { describe, expect, it } from 'vitest';
import { resultWithQualityDelta } from './postGameRatingAuditRunner.js';

describe('post-game rating quality result', () => {
  it('adds the bounded quality delta to the existing rated result', () => {
    expect(resultWithQualityDelta({
      gameId: 'g1',
      ratingApplied: true,
      eloDelta: 12,
      eloBefore: 900,
      eloAfter: 912,
      detail: 'base',
    }, 'g1', 3, 915)).toMatchObject({
      eloBaseDelta: 12,
      eloQualityDelta: 3,
      eloDelta: 15,
      eloAfter: 915,
    });
  });

  it('does not mutate a stale or unrated result', () => {
    const stale = { gameId: 'old', ratingApplied: true, eloDelta: 4 };
    expect(resultWithQualityDelta(stale, 'new', 3, 903)).toBe(stale);
    const unrated = { gameId: 'g1', ratingApplied: false };
    expect(resultWithQualityDelta(unrated, 'g1', 3, 903)).toBe(unrated);
  });
});
