import { describe, expect, it } from 'vitest';
import { buildSessionSummary } from './sessionSummary.js';

describe('buildSessionSummary', () => {
  it('no inventa un resumen con una sola actividad', () => {
    expect(buildSessionSummary({ games: 1, wins: 1, recentOutcomes: ['win'] })).toBeNull();
    expect(buildSessionSummary({ puzzlesSolved: 1 })).toBeNull();
  });

  it('resume partidas y mejora de cierre sólo cuando la secuencia la demuestra', () => {
    const summary = buildSessionSummary({
      games: 3,
      wins: 1,
      draws: 1,
      losses: 1,
      recentOutcomes: ['loss', 'draw', 'win'],
    });

    expect(summary.activityCount).toBe(3);
    expect(summary.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'games', text: '3 · 1V · 1T · 1D' }),
      expect.objectContaining({ id: 'trend-up', text: expect.stringContaining('de derrota a victoria') }),
    ]));
  });

  it('muestra reincidencia de cierre sin atribuir una causa táctica inventada', () => {
    const summary = buildSessionSummary({
      games: 3,
      wins: 0,
      draws: 1,
      losses: 2,
      recentOutcomes: ['draw', 'loss', 'loss'],
    });

    expect(summary.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'trend-down' }),
    ]));
    expect(summary.nextStep).toContain('Así juegas');
    expect(JSON.stringify(summary)).not.toMatch(/horquilla|apertura|táctic[oa] débil|reloj/i);
  });

  it('incluye puzzles de la misma sesión y recomienda llevar el bloque al tablero cuando procede', () => {
    const summary = buildSessionSummary({ puzzlesSolved: 4 });
    expect(summary.facts).toEqual([
      expect.objectContaining({ id: 'puzzles', text: '4 puzzles resueltos en esta sesión.' }),
    ]);
    expect(summary.nextStep).toContain('partida de práctica');
  });

  it('mezcla partidas y puzzles pero limita el panel a tres hechos', () => {
    const summary = buildSessionSummary({
      games: 4,
      wins: 3,
      draws: 0,
      losses: 1,
      puzzlesSolved: 5,
      recentOutcomes: ['loss', 'win', 'win', 'win'],
    });
    expect(summary.facts).toHaveLength(3);
    expect(summary.facts.map((fact) => fact.id)).toEqual(['games', 'trend-up', 'puzzles']);
  });
});
