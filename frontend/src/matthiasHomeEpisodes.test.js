import { describe, expect, it } from 'vitest';
import { buildMatthiasHomeCardModel, buildMatthiasHomeVisit, shouldShowMatthiasHome } from './matthiasHome.js';

const MISSED_MATE_MEMORY = Object.freeze({
  relationship: { tier: 'veteran', label: 'Viejo conocido' },
  episodicMemory: {
    episodeCount: 1,
    callbackCandidates: [{
      reasons: ['recent', 'severe'],
      episode: {
        fingerprint: 'incident:human:MISSED_MATE:3',
        kind: 'incident',
        polarity: 'shame',
        severity: 92,
        evidence: {
          source: 'noteworthy_incidents',
          key: 'human:MISSED_MATE',
          previous_count: 2,
          count: 3,
          delta: 1,
        },
      },
    }],
  },
});

describe('Matthias episodic memory on Home', () => {
  it('prefers an eligible grounded episode over generic legacy chatter', () => {
    const visit = buildMatthiasHomeVisit({
      memory: MISSED_MATE_MEMORY,
      rivalry: { record: { incidents: {}, recentGames: [] } },
    });

    expect(visit).toMatchObject({
      kind: 'episodic-incident',
      action: 'train',
      actionLabel: 'Entrenar ese error',
      episodeFingerprint: 'incident:human:MISSED_MATE:3',
    });
    expect(visit.text).toMatch(/3 mates/i);
    expect(buildMatthiasHomeCardModel({ visit, memory: MISSED_MATE_MEMORY })).toMatchObject({
      variant: 'comment',
      eyebrow: 'MATTHIAS · DEL EXPEDIENTE',
    });
  });

  it('never displaces continue, reunion, active challenge, open debt or earned respect', () => {
    expect(buildMatthiasHomeVisit({ memory: MISSED_MATE_MEMORY, hasSavedGame: true }).kind).toBe('continue');
    expect(buildMatthiasHomeVisit({ memory: { ...MISSED_MATE_MEMORY, returnContext: { days: 20 } } }).kind).toBe('reunion');
    expect(buildMatthiasHomeVisit({ memory: { ...MISSED_MATE_MEMORY, activeChallenge: {
      label: 'Tres partidas limpias', baseline_games: 10, current_games: 11, target_games: 3,
    } } }).kind).toBe('challenge');
    expect(buildMatthiasHomeVisit({ memory: { ...MISSED_MATE_MEMORY, openDebt: { status: 'mixed' } } }).kind).toBe('debt');
    expect(buildMatthiasHomeVisit({ memory: { ...MISSED_MATE_MEMORY, recentMilestones: [{
      kind: 'goal_completed', polarity: 'fame', label: 'Objetivo superado',
    }] } }).kind).toBe('earned-respect');
  });

  it('does not increase Home appearance probability just because a memory exists', () => {
    const now = Date.parse('2026-09-05T12:00:00Z');
    // Veteran generic cadence is 0.18. Episodic callbacks must use the same
    // threshold instead of the 0.42 meaningful-visit boost.
    expect(shouldShowMatthiasHome({
      now, randomValue: 0.17, relationshipTier: 'veteran', visitKind: 'episodic-incident',
    })).toBe(true);
    expect(shouldShowMatthiasHome({
      now, randomValue: 0.19, relationshipTier: 'veteran', visitKind: 'episodic-incident',
    })).toBe(false);
    // A real active goal still gets the existing meaningful-visit allowance.
    expect(shouldShowMatthiasHome({
      now, randomValue: 0.30, relationshipTier: 'veteran', visitKind: 'goal',
    })).toBe(true);
  });
});
