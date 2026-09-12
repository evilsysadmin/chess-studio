import { describe, expect, it } from 'vitest';
import { buildPlayerModel, evidenceConfidence, PLAYER_MODEL_VERSION } from './playerModel.js';

describe('factual player model', () => {
  it('keeps missing evidence empty instead of inventing a weakness', () => {
    expect(buildPlayerModel()).toEqual({
      version: PLAYER_MODEL_VERSION,
      samples: { games: 0, personalPositions: 0 },
      confidence: { games: 'none', personalTraining: 'none' },
      outcomes: null,
      colorPreference: null,
      ratingTrend: null,
      openings: [],
      recurringErrors: [],
      trainingDebt: expect.objectContaining({ activeCount: 0, paidCount: 0, top: null }),
    });
  });

  it('attaches explicit sample strength to measured opening records', () => {
    const model = buildPlayerModel({
      insights: {
        totalGames: 9,
        overall: { wins: 4, draws: 1, losses: 4, total: 9, winPct: 44 },
        colorPreference: { white: 5, black: 4 },
        ratingTrend: { first: 400, last: 436, delta: 36, min: 400, max: 450 },
        openingDossier: [
          { name: 'Italiana', games: 2, wins: 1, draws: 0, losses: 1, white: 2, black: 0, winPct: 50 },
          { name: 'Siciliana', games: 8, wins: 3, draws: 1, losses: 4, white: 0, black: 8, winPct: 38 },
        ],
      },
    });

    expect(model.samples.games).toBe(9);
    expect(model.confidence.games).toBe('medium');
    expect(model.openings).toEqual([
      expect.objectContaining({ name: 'Italiana', games: 2, confidence: 'low' }),
      expect.objectContaining({ name: 'Siciliana', games: 8, confidence: 'high' }),
    ]);
    expect(model.ratingTrend).toEqual(expect.objectContaining({ delta: 36 }));
  });

  it('promotes a recurring incident only from the same real positions already used by training', () => {
    const personalPuzzles = [
      {
        id: 'p1',
        source: 'autopsy',
        sourceGameId: 'g1',
        incidentKeys: ['human:MISSED_MATE'],
        loss: 420,
        createdAt: '2026-09-10T10:00:00Z',
      },
      {
        id: 'p2',
        source: 'autopsy',
        sourceGameId: 'g2',
        incidentKeys: ['human:MISSED_MATE'],
        loss: 260,
        createdAt: '2026-09-11T10:00:00Z',
      },
    ];

    const model = buildPlayerModel({ personalPuzzles });

    expect(model.samples.personalPositions).toBe(2);
    expect(model.confidence.personalTraining).toBe('low');
    expect(model.recurringErrors).toHaveLength(1);
    expect(model.recurringErrors[0]).toEqual(expect.objectContaining({
      incidentKey: 'human:MISSED_MATE',
      positions: 2,
      sourceGames: 2,
      maxLoss: 420,
      confidence: 'low',
    }));
    expect(model.trainingDebt.activeCount).toBe(1);
  });
});

describe('evidenceConfidence', () => {
  it('is a sample-size label, not a fabricated probability', () => {
    expect(evidenceConfidence(0)).toBe('none');
    expect(evidenceConfidence(1)).toBe('low');
    expect(evidenceConfidence(3)).toBe('medium');
    expect(evidenceConfidence(8)).toBe('high');
  });
});
