import { describe, expect, it } from 'vitest';
import { buildPlayerModel, evidenceConfidence, PLAYER_MODEL_VERSION } from './playerModel.js';

describe('factual player model', () => {
  it('keeps missing evidence empty instead of inventing a weakness', () => {
    expect(PLAYER_MODEL_VERSION).toBe(3);
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
      trainingProgress: {
        attempts: 0,
        solves: 0,
        cleanSolves: 0,
        attemptedPositions: 0,
        solvedPositions: 0,
        currentlyCleanPositions: 0,
        retentionCompletedPositions: 0,
        retentionDuePositions: 0,
        activeDebts: 0,
        paidDebts: 0,
        lastAttemptAt: null,
        lastSolvedAt: null,
        lastCleanAt: null,
      },
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
        factualEvidence: { version: 1, classification: 'missed-mate' },
        loss: 420,
        createdAt: '2026-09-10T10:00:00Z',
      },
      {
        id: 'p2',
        source: 'autopsy',
        sourceGameId: 'g2',
        incidentKeys: ['human:MISSED_MATE'],
        factualEvidence: { version: 1, classification: 'missed-mate' },
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
      classification: 'missed-mate',
      positions: 2,
      sourceGames: 2,
      maxLoss: 420,
      confidence: 'low',
    }));
    expect(model.trainingDebt.activeCount).toBe(1);
  });

  it('keeps recurring classification empty when any supporting position lacks shared evidence', () => {
    const model = buildPlayerModel({
      personalPuzzles: [
        { id: 'legacy', incidentKeys: ['human:MISSED_MATE'], loss: 180 },
        {
          id: 'factual',
          incidentKeys: ['human:MISSED_MATE'],
          factualEvidence: { version: 1, classification: 'missed-mate' },
          loss: 220,
        },
      ],
    });

    expect(model.recurringErrors).toHaveLength(1);
    expect(model.recurringErrors[0].classification).toBeNull();
  });

  it('summarizes persisted training history without inventing an improvement score', () => {
    const model = buildPlayerModel({
      personalPuzzles: [
        {
          id: 'retained',
          source: 'autopsy',
          sourceGameId: 'g1',
          incidentKeys: ['human:MISSED_MATE'],
          factualEvidence: { version: 2, classification: 'missed-mate' },
          createdAt: '2026-09-01T10:00:00Z',
          attempts: 2,
          solves: 1,
          cleanSolves: 1,
          lastAttemptAt: '2026-09-10T10:00:00Z',
          lastSolvedAt: '2026-09-08T10:00:00Z',
          lastCleanAt: '2026-09-08T10:00:00Z',
          retentionStage: 3,
          retentionCompletedAt: '2026-09-09T10:00:00Z',
        },
        {
          id: 'clean',
          source: 'autopsy',
          sourceGameId: 'g2',
          incidentKeys: ['human:MISSED_MATE'],
          factualEvidence: { version: 2, classification: 'missed-mate' },
          createdAt: '2026-09-02T10:00:00Z',
          attempts: 3,
          solves: 1,
          cleanSolves: 1,
          lastAttemptAt: '2026-09-12T10:00:00Z',
          lastSolvedAt: '2026-09-11T10:00:00Z',
          lastCleanAt: '2026-09-11T10:00:00Z',
          retentionStage: 0,
          nextReviewAt: '2099-01-01T00:00:00Z',
        },
        {
          id: 'relapse',
          source: 'autopsy',
          sourceGameId: 'g3',
          incidentKeys: ['human:ALLOWED_MATE'],
          factualEvidence: { version: 2, classification: 'allowed-mate' },
          createdAt: '2026-09-03T10:00:00Z',
          attempts: 1,
          solves: 1,
          cleanSolves: 1,
          lastAttemptAt: '2026-09-13T10:00:00Z',
          lastSolvedAt: '2026-09-12T10:00:00Z',
          lastCleanAt: '2026-09-12T10:00:00Z',
          retentionBrokenAt: '2026-09-13T10:00:00Z',
        },
      ],
    });

    expect(model.trainingProgress).toEqual({
      attempts: 6,
      solves: 3,
      cleanSolves: 3,
      attemptedPositions: 3,
      solvedPositions: 3,
      currentlyCleanPositions: 2,
      retentionCompletedPositions: 1,
      retentionDuePositions: 0,
      activeDebts: 0,
      paidDebts: 1,
      lastAttemptAt: '2026-09-13T10:00:00.000Z',
      lastSolvedAt: '2026-09-12T10:00:00.000Z',
      lastCleanAt: '2026-09-12T10:00:00.000Z',
    });
    expect(model.trainingProgress).not.toHaveProperty('score');
    expect(model.trainingProgress).not.toHaveProperty('trend');
  });

  it('does not count historical clean solves as currently clean after a relapse', () => {
    const model = buildPlayerModel({
      personalPuzzles: [
        {
          id: 'broken-retention',
          source: 'autopsy',
          cleanSolves: 4,
          solves: 4,
          attempts: 5,
          lastCleanAt: '2026-09-10T10:00:00Z',
          retentionCompletedAt: '2026-09-10T10:00:00Z',
          retentionBrokenAt: '2026-09-11T10:00:00Z',
        },
      ],
    });

    expect(model.trainingProgress).toMatchObject({
      cleanSolves: 4,
      currentlyCleanPositions: 0,
      retentionCompletedPositions: 0,
    });
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
