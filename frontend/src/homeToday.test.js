import { describe, expect, it } from 'vitest';
import { buildHomeToday } from './homeToday.js';

describe('Home · Hoy', () => {
  it('resume retos diarios, racha y última partida terminada sin inventar datos', () => {
    const summary = buildHomeToday({
      daily: {
        solvedDates: ['2026-08-23'], streak: 4, bestStreak: 9,
        results: { '2026-08-23': { slots: { tactic: { solved: true, clean: false } } } },
      },
      todayKey: '2026-08-23',
      activity: [
        { state: 'started', outcome: null, modeLabel: 'Partida rápida' },
        { state: 'finished', outcome: 'win', modeLabel: 'Torneo', date: '2026-08-22T20:00:00Z' },
      ],
    });
    expect(summary).toMatchObject({ dailySolved: true, dailySolvedCount: 1, dailyFull: false, streak: 4, bestStreak: 9, dailyHeadline: 'Hoy · 1/3' });
    expect(summary.lastResult).toMatchObject({ label: 'Victoria', modeLabel: 'Torneo' });
  });

  it('tolera perfiles nuevos sin historial', () => {
    const summary = buildHomeToday({ todayKey: '2026-08-23' });
    expect(summary).toMatchObject({
      dailySolved: false,
      dailySolvedCount: 0,
      dailyFull: false,
      streak: 0,
      bestStreak: 0,
      dailyHeadline: 'Hoy · 0/3',
      dailyDetail: 'Tres posiciones. Completa al menos una para mantener la racha.',
      lastResult: null,
    });
    expect(summary.dailySlots.map((slot) => [slot.id, slot.solved])).toEqual([
      ['tactic', false], ['precision', false], ['finish', false],
    ]);
  });
});
