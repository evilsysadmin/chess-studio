import { beforeEach, describe, expect, it } from 'vitest';
import { currentDailyStreak, dailyPuzzle, markDailySolved } from './dailyChallenge.js';

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

  it('pone la racha actual a cero si el último solve ya es antiguo', () => {
    localStorage.setItem('chess-study-daily-challenge', JSON.stringify({ solvedDates: ['2026-08-01','2026-08-02'], bestStreak: 2 }));
    const state = currentDailyStreak(new Date('2026-08-22T12:00:00'));
    expect(state.streak).toBe(0);
    expect(state.bestStreak).toBe(2);
  });

  it('mantiene viva la racha si el último solve fue ayer', () => {
    localStorage.setItem('chess-study-daily-challenge', JSON.stringify({ solvedDates: ['2026-08-20','2026-08-21'], bestStreak: 2 }));
    expect(currentDailyStreak(new Date('2026-08-22T12:00:00')).streak).toBe(2);
  });
});
