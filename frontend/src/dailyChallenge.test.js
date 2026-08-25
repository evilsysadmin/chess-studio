import { beforeEach, describe, expect, it } from 'vitest';
import {
  DAILY_CHALLENGE_SLOTS,
  currentDailyStreak,
  dailyChallengeBrief,
  dailyChallengeProgress,
  dailyPuzzle,
  dailyPuzzles,
  markDailySolved,
} from './dailyChallenge.js';

describe('daily challenge · tres retos', () => {
  beforeEach(() => localStorage.clear());

  const pool = [
    { id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }, { id: 'g' },
  ];
  const day = new Date('2026-08-20T12:00:00');

  it('elige tres posiciones deterministas y etiqueta cada slot', () => {
    const first = dailyPuzzles(pool, day);
    const second = dailyPuzzles(pool, day);
    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(first.map((p) => p.dailySlot)).toEqual(DAILY_CHALLENGE_SLOTS.map((slot) => slot.id));
    expect(new Set(first.map((p) => p.id)).size).toBe(3);
    expect(dailyPuzzle(pool, day, 'precision')).toMatchObject({ dailySlot: 'precision', dailyKey: '2026-08-20' });
  });

  it('un reto mantiene la racha y tres forman pleno', () => {
    let state = markDailySolved('2026-08-20', { slot: 'tactic', clean: true });
    expect(dailyChallengeProgress(state, '2026-08-20')).toMatchObject({ solvedCount: 1, full: false, cleanCount: 1 });
    expect(dailyChallengeBrief(state, '2026-08-20').headline).toBe('Desafíos de hoy · 1/3');

    state = markDailySolved('2026-08-20', { slot: 'precision', clean: false });
    state = markDailySolved('2026-08-20', { slot: 'finish', clean: true });
    expect(dailyChallengeProgress(state, '2026-08-20')).toMatchObject({ solvedCount: 3, full: true, cleanCount: 2 });
    expect(dailyChallengeBrief(state, '2026-08-20').headline).toBe('Pleno diario · 3/3');
  });

  it('migra el formato antiguo de un único desafío como el primer slot', () => {
    localStorage.setItem('chess-study-daily-challenge', JSON.stringify({
      solvedDates: ['2026-08-20'],
      bestStreak: 1,
      results: { '2026-08-20': { solved: true, clean: true } },
    }));
    const state = currentDailyStreak(new Date('2026-08-20T12:00:00'));
    expect(dailyChallengeProgress(state, '2026-08-20')).toMatchObject({ solvedCount: 1, full: false, cleanCount: 1 });
  });

  it('no cuenta dos veces el mismo slot', () => {
    markDailySolved('2026-08-20', { slot: 'tactic', clean: false });
    const state = markDailySolved('2026-08-20', { slot: 'tactic', clean: true });
    expect(dailyChallengeProgress(state, '2026-08-20')).toMatchObject({ solvedCount: 1, cleanCount: 0 });
  });
});
