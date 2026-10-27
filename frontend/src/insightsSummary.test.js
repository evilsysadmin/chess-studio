import { describe, expect, it } from 'vitest';
import { computeInsights, ratingTrend } from './insightsSummary.js';
import { computeInsights as publicComputeInsights, ratingTrend as publicRatingTrend } from './insights.js';

describe('lightweight history insights read model', () => {
  it('keeps the existing public insights exports identical', () => {
    expect(publicComputeInsights).toBe(computeInsights);
    expect(publicRatingTrend).toBe(ratingTrend);
  });

  it('preserves filtering, black-to-move captures, combat draws and rating deltas', () => {
    const games = [
      {
        date: '2026-10-01', outcome: 'win', mode: 'casual', humanColor: 'b',
        initialFen: '8/8/8/8/8/8/8/8 b - - 0 1',
        moves: [{ san: 'Nf6', captured: 'p' }],
      },
      { date: '2026-10-02', outcome: 'loss', mode: 'lab', humanColor: 'w', moves: [] },
      { date: '2026-10-03', outcome: 'win', mode: 'practice', excludedFromStats: true, humanColor: 'w', moves: [] },
    ];
    const combat = [{ date: '2026-10-04', outcome: 'draw', log: [{ by: 'human', captured: 'p' }] }];
    const summary = computeInsights(games, combat, [{ rating: 600 }, { rating: 625 }]);
    expect(summary.totalGames).toBe(2);
    expect(summary.overall).toEqual({ wins: 1, draws: 1, losses: 0, total: 2, winPct: 50 });
    expect(summary.byMode.casual.total).toBe(1);
    expect(summary.byMode.combat.draws).toBe(1);
    expect(summary.byMode.practice).toBeUndefined();
    expect(summary.humanCaptures).toBe(2);
    expect(summary.ratingTrend).toEqual({ min: 600, max: 625, first: 600, last: 625, delta: 25 });
  });

  it('retains the empty-history contract used on first login', () => {
    expect(computeInsights([], [], [])).toMatchObject({
      totalGames: 0, overall: null, favoriteOpening: null, longestWinStreak: 0, ratingTrend: null,
    });
  });
});
