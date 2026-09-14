import { describe, expect, it } from 'vitest';
import { buildPlayerPortraitRefreshFacts } from './playerPortraitRefreshFacts.js';

describe('player portrait prewarm facts', () => {
  it('precalienta con el mismo historial factual de entrenamiento que Player Model', () => {
    const facts = buildPlayerPortraitRefreshFacts({
      totalGames: 6,
      overall: { wins: 3, draws: 1, losses: 2, winPct: 50 },
      byMode: {},
      openingDossier: [],
      favoriteOpening: null,
      colorPreference: { white: 3, black: 3 },
      ratingTrend: null,
      longestWinStreak: 2,
      humanCaptures: 14,
    }, {
      rivalry: { record: { games: 0, byTimeControl: {} }, incidents: {} },
      personalPuzzles: [{
        id: 'portrait-prewarm-training',
        kind: 'personal',
        source: 'autopsy',
        sourceGameId: 'game-1',
        fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1',
        solution: ['Ra8#'],
        incidentKeys: ['cpu:KNIGHT_FORK'],
        attempts: 2,
        solves: 1,
        cleanSolves: 1,
        lastAttemptAt: '2026-09-14T10:00:00Z',
        lastSolvedAt: '2026-09-14T10:01:00Z',
        lastCleanAt: '2026-09-14T10:01:00Z',
        masteredAt: '2026-09-14T10:01:00Z',
      }],
      cleanGameRecords: {},
      achievementsUnlocked: 2,
      achievementsTotal: 12,
      puzzlesSolved: 7,
    });

    expect(facts.personal_training_positions).toBe(1);
    expect(facts.puzzles_solved).toBe(7);
    expect(facts.learning_evidence.training_progress).toEqual(expect.objectContaining({
      attempts: 2,
      solves: 1,
      clean_solves: 1,
      attempted_positions: 1,
      solved_positions: 1,
    }));
  });

  it('no fabrica learning_evidence cuando no existe ninguna muestra longitudinal', () => {
    const facts = buildPlayerPortraitRefreshFacts({
      totalGames: 4,
      overall: { wins: 2, draws: 0, losses: 2, winPct: 50 },
      byMode: {},
      openingDossier: [],
      favoriteOpening: null,
      colorPreference: { white: 2, black: 2 },
      ratingTrend: null,
      longestWinStreak: 1,
      humanCaptures: 8,
    }, {
      rivalry: { record: { games: 0, byTimeControl: {} }, incidents: {} },
      personalPuzzles: [],
      cleanGameRecords: {},
      achievementsUnlocked: 0,
      achievementsTotal: 12,
      puzzlesSolved: 0,
    });

    expect(facts).not.toHaveProperty('learning_evidence');
  });
});
