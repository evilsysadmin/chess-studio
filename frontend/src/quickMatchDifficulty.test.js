import { describe, expect, it } from 'vitest';
import {
  QUICK_MATCH_ENGINE_CURVE,
  calibrateQuickMatchDifficulty,
  difficultyForQuickMatchRating,
} from './quickMatchDifficulty.js';


describe('quick-match adaptive calibration', () => {
  it('is monotonic across the full 0-100 range', () => {
    const values = Array.from({ length: 101 }, (_, level) => calibrateQuickMatchDifficulty(level));
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('softens the engine depth cliffs instead of crossing them on the same UI point', () => {
    expect(calibrateQuickMatchDifficulty(69)).toBe(66);
    expect(calibrateQuickMatchDifficulty(70)).toBe(67);
    expect(calibrateQuickMatchDifficulty(90)).toBe(85);
    expect(calibrateQuickMatchDifficulty(98)).toBe(93);
  });

  it('still reaches the strongest engine tier for a maxed adaptive player', () => {
    expect(calibrateQuickMatchDifficulty(100)).toBe(98);
  });

  it('keeps a new provisional player gentle while preserving the rating signal', () => {
    expect(difficultyForQuickMatchRating(400, [], 0)).toBe(1);
    expect(difficultyForQuickMatchRating(1100, [], 12)).toBeLessThan(50);
  });

  it('keeps curve anchors ordered in both source and engine difficulty', () => {
    for (let index = 1; index < QUICK_MATCH_ENGINE_CURVE.length; index += 1) {
      expect(QUICK_MATCH_ENGINE_CURVE[index][0]).toBeGreaterThan(QUICK_MATCH_ENGINE_CURVE[index - 1][0]);
      expect(QUICK_MATCH_ENGINE_CURVE[index][1]).toBeGreaterThanOrEqual(QUICK_MATCH_ENGINE_CURVE[index - 1][1]);
    }
  });
});
