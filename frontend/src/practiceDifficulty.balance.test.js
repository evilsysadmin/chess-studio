import { describe, expect, it } from 'vitest';
import { difficultyForPracticeRating, PRACTICE_ADAPTIVE_RELIEF } from './practiceDifficulty.js';
import { difficultyForQuickMatchRating } from './quickMatchDifficulty.js';

describe('practice adaptive difficulty calibration', () => {
  it('stays at or below the equivalent quick-match adaptive opponent', () => {
    for (const rating of [400, 700, 1000, 1300, 1600, 1900, 2200]) {
      expect(difficultyForPracticeRating(rating, null, 20))
        .toBeLessThanOrEqual(difficultyForQuickMatchRating(rating, null, 20));
    }
  });

  it('is monotonic as player strength rises', () => {
    let previous = -1;
    for (let rating = 200; rating <= 2200; rating += 20) {
      const current = difficultyForPracticeRating(rating, null, 20);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });

  it('keeps the six-point relief before engine calibration', () => {
    expect(PRACTICE_ADAPTIVE_RELIEF).toBe(6);
    expect(difficultyForPracticeRating(1100, null, 20))
      .toBeLessThan(difficultyForQuickMatchRating(1100, null, 20));
  });

  it('does not jump directly onto the raw engine cliffs from one nearby rating step', () => {
    const samples = [];
    for (let rating = 200; rating <= 2200; rating += 5) {
      samples.push(difficultyForPracticeRating(rating, null, 20));
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index] - samples[index - 1]).toBeLessThanOrEqual(2);
    }
  });

  it('keeps practice below maximum engine strength even for a very strong profile', () => {
    expect(difficultyForPracticeRating(5000, null, 200)).toBeLessThan(95);
  });
});
