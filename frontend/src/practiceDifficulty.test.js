import { describe, expect, it } from 'vitest';
import { difficultyForRating } from './playerRating.js';
import { calibrateQuickMatchDifficulty } from './quickMatchDifficulty.js';
import { difficultyForPracticeRating, PRACTICE_ADAPTIVE_RELIEF } from './practiceDifficulty.js';

describe('practice adaptive difficulty', () => {
  it('uses the normal adaptive signal with relief before engine calibration', () => {
    const normal = difficultyForRating(1100, [], 12);
    const relieved = Math.max(0, normal - PRACTICE_ADAPTIVE_RELIEF);
    expect(difficultyForPracticeRating(1100, [], 12)).toBe(calibrateQuickMatchDifficulty(relieved));
    expect(PRACTICE_ADAPTIVE_RELIEF).toBe(6);
  });

  it('never underflows below the easiest CPU level', () => {
    expect(difficultyForPracticeRating(200, [], 12)).toBe(0);
  });
});
