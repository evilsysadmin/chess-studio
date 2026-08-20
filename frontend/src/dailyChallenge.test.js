import { beforeEach, describe, expect, it } from 'vitest';
import { dailyPuzzle, markDailySolved } from './dailyChallenge.js';

describe('daily challenge', () => {
  beforeEach(() => localStorage.clear());

  it('elige siempre el mismo puzzle para la misma fecha', () => {
    const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const date = new Date(2026, 7, 20, 12, 0, 0);
    expect(dailyPuzzle(pool, date).id).toBe(dailyPuzzle(pool, date).id);
  });

  it('no cuenta dos veces el mismo día', () => {
    markDailySolved('2026-08-19');
    const state = markDailySolved('2026-08-20');
    const again = markDailySolved('2026-08-20');
    expect(state.bestStreak).toBeGreaterThanOrEqual(2);
    expect(again.solvedDates.filter((d) => d === '2026-08-20')).toHaveLength(1);
  });
});
