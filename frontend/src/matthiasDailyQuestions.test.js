import { describe, expect, it } from 'vitest';
import { focusMatthiasDailyFacts } from './matthiasDailyQuestions.js';

const FACTS = Object.freeze({
  total_games: 12,
  record: { wins: 7, draws: 1, losses: 4 },
  rating_trend: { delta: 42 },
  cpu_rivalry: { games: 9, wins: 4, losses: 5 },
  noteworthy_incidents: [{ key: 'cpu:KNIGHT_FORK', count: 3 }],
  worst_recorded_move: { played: 'Qe2', suggested: 'Nf3', centipawn_loss: 430 },
  favorite_opening: { name: 'Defensa Siciliana', games: 5 },
  openings: [{ name: 'Defensa Siciliana', games: 5, wins: 3, losses: 2 }],
  longest_win_streak: 4,
  human_captures: 27,
  by_mode: { casual: { games: 8, wins: 5 } },
  puzzles_solved: 31,
  personal_training_positions: 6,
  achievements_unlocked: 9,
  achievements_total: 20,
});

describe('focusMatthiasDailyFacts', () => {
  it('centra táctica en incidentes y entrenamiento sin arrastrar aperturas ni récord global', () => {
    const result = focusMatthiasDailyFacts('tactics', FACTS);
    expect(result.noteworthy_incidents).toEqual(FACTS.noteworthy_incidents);
    expect(result.worst_recorded_move).toEqual(FACTS.worst_recorded_move);
    expect(result.puzzles_solved).toBe(31);
    expect(result).not.toHaveProperty('openings');
    expect(result).not.toHaveProperty('record');
  });

  it('centra fortalezas en señales positivas y contexto de rendimiento, no en el peor blunder', () => {
    const result = focusMatthiasDailyFacts('strengths', FACTS);
    expect(result.record).toEqual(FACTS.record);
    expect(result.longest_win_streak).toBe(4);
    expect(result.achievements_unlocked).toBe(9);
    expect(result.openings).toEqual(FACTS.openings);
    expect(result).not.toHaveProperty('worst_recorded_move');
    expect(result).not.toHaveProperty('noteworthy_incidents');
  });

  it('centra aperturas exclusivamente en repertorio y tamaño de muestra', () => {
    const result = focusMatthiasDailyFacts('openings', FACTS);
    expect(result).toEqual({
      total_games: 12,
      favorite_opening: FACTS.favorite_opening,
      openings: FACTS.openings,
    });
  });

  it('mantiene improve y action distintos para que no reciban el mismo dossier', () => {
    const improve = focusMatthiasDailyFacts('improve', FACTS);
    const action = focusMatthiasDailyFacts('action', FACTS);
    expect(improve.record).toEqual(FACTS.record);
    expect(action).not.toHaveProperty('record');
    expect(action.puzzles_solved).toBe(31);
    expect(improve).not.toHaveProperty('puzzles_solved');
  });
});
