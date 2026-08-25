import { beforeEach, describe, expect, it } from 'vitest';
import { currentDailyStreak, dailyChallengeBrief, dailyPuzzle, markDailySolved } from './dailyChallenge.js';

describe('daily challenge', () => {
  beforeEach(() => localStorage.clear());

  it('elige siempre el mismo puzzle para la misma fecha', () => {
    const pool = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const aug20 = new Date(2026, 7, 20, 12, 0, 0);
    const aug21 = new Date(2026, 7, 21, 12, 0, 0);
    expect(dailyPuzzle(pool, aug20)).toMatchObject({ id: 'c', dailyKey: '2026-08-20' });
    expect(dailyPuzzle(pool, aug21)).toMatchObject({ id: 'a', dailyKey: '2026-08-21' });
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

  it('guarda si el reto se resolvió limpio y celebra sólo una mejor racha real', () => {
    markDailySolved('2026-08-19', { clean: false });
    const state = markDailySolved('2026-08-20', { clean: true });
    expect(state.results['2026-08-20']).toMatchObject({ solved: true, clean: true, newBest: true });
    expect(dailyChallengeBrief(state, '2026-08-20')).toMatchObject({
      solved: true,
      clean: true,
      headline: 'Nueva mejor racha: 2 días',
    });
  });

  it('da personalidad al reto pendiente sin inventar resultados', () => {
    const brief = dailyChallengeBrief({ solvedDates: ['2026-08-20','2026-08-21'], streak: 2, bestStreak: 4, results: {} }, '2026-08-22');
    expect(brief).toEqual({
      solved: false,
      clean: null,
      headline: '2 días seguidos. Falta hoy.',
      detail: 'Una posición y fuera. Luego ya puedes presumir.',
    });
  });

});
