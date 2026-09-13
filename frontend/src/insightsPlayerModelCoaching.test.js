import { describe, expect, it } from 'vitest';
import { generateCoaching } from './insights.js';

const insights = {
  totalGames: 12,
  overall: { wins: 6, draws: 0, losses: 6, total: 12, winPct: 50 },
  byMode: {},
  favoriteOpening: null,
  openingDossier: [],
  colorPreference: { white: 6, black: 6 },
  longestWinStreak: 2,
  ratingTrend: null,
  humanCaptures: 30,
};

function pattern(incidentKey, positions, improvementState, active) {
  return {
    incidentKey,
    positions,
    improvementState,
    debt: { active, paid: !active },
  };
}

describe('Player Model tactical coaching', () => {
  it('uses only active or relapsed model patterns and ignores stale rivalry counters', () => {
    const recurringErrors = [
      pattern('human:MISSED_MATE', 2, 'no-sample', true),
      pattern('human:ALLOWED_MATE', 3, 'still-occurring', false),
      pattern('cpu:PAWN_FORK', 8, 'probable-improvement', true),
      pattern('cpu:KNIGHT_FORK', 10, 'corrected-with-sufficient-sample', true),
    ];

    const coaching = generateCoaching(
      insights,
      { incidents: { 'cpu:KNIGHT_FORK': 99 } },
      { puzzlesSolved: 8, recurringErrors },
    );
    const tactical = coaching.filter((item) => item.evidence?.kind === 'incident');

    expect(tactical.map((item) => item.evidence.key).sort()).toEqual([
      'human:ALLOWED_MATE',
      'human:MISSED_MATE',
    ]);
    expect(tactical.every((item) => item.evidence.source === 'player-model')).toBe(true);
    expect(tactical.find((item) => item.evidence.key === 'human:MISSED_MATE')?.evidence.count).toBe(2);
    expect(tactical.find((item) => item.evidence.key === 'human:ALLOWED_MATE')?.evidence.improvementState).toBe('still-occurring');
  });

  it('treats an explicit empty Player Model result as authoritative instead of falling back to rivalry', () => {
    const coaching = generateCoaching(
      insights,
      { incidents: { 'human:MISSED_MATE': 12 } },
      { puzzlesSolved: 8, recurringErrors: [] },
    );

    expect(coaching.some((item) => item.evidence?.kind === 'incident')).toBe(false);
    expect(coaching).toHaveLength(1);
    expect(coaching[0].title).toBe('No hay un incendio dominante');
  });

  it('keeps legacy rivalry incidents as a compatibility fallback when Player Model data is absent', () => {
    const coaching = generateCoaching(
      insights,
      { incidents: { 'human:MISSED_MATE': 3 } },
      { puzzlesSolved: 8 },
    );
    const tactical = coaching.filter((item) => item.evidence?.kind === 'incident');

    expect(tactical).toHaveLength(1);
    expect(tactical[0].evidence).toMatchObject({
      kind: 'incident',
      key: 'human:MISSED_MATE',
      count: 3,
    });
    expect(tactical[0].evidence).not.toHaveProperty('source');
  });
});
