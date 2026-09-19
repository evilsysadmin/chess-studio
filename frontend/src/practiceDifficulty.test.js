import { describe, expect, it } from 'vitest';
import { difficultyForPracticeRating, PRACTICE_ADAPTIVE_RELIEF } from './practiceDifficulty.js';
import { difficultyForQuickMatchRating } from './quickMatchDifficulty.js';

describe('practice adaptive difficulty', () => {
  it('uses the War Room Elo signal with a six-level practice relief', () => {
    const quick = difficultyForQuickMatchRating(1100, [], 12);
    expect(difficultyForPracticeRating(1100, [], 12)).toBe(Math.max(0, quick - PRACTICE_ADAPTIVE_RELIEF));
    expect(PRACTICE_ADAPTIVE_RELIEF).toBe(6);
  });

  it('never underflows below the easiest CPU level', () => {
    expect(difficultyForPracticeRating(200, [], 12)).toBe(0);
  });
});
