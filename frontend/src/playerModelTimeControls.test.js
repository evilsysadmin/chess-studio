import { describe, expect, it } from 'vitest';
import { buildPlayerModel } from './playerModel.js';

describe('player model · time-control evidence', () => {
  it('keeps only real clock buckets and attaches sample strength without inventing skill', () => {
    const model = buildPlayerModel({
      insights: { totalGames: 21 },
      timeControlStats: {
        none: { games: 99, wins: 99, draws: 0, losses: 0 },
        broken: { games: 'nope', wins: 8, draws: 0, losses: 0 },
        '1+0': { games: 2, wins: 2, draws: 0, losses: 0 },
        '3+2': { games: 4, wins: 1, draws: 1, losses: 2 },
        '5+0': { games: 5, wins: 3, draws: 0, losses: 2 },
        '15+10': { games: 10, wins: 7, draws: 1, losses: 2 },
      },
    });

    expect(model.timeControls).toEqual([
      { id: '15+10', games: 10, wins: 7, draws: 1, losses: 2, winPct: 70, confidence: 'high' },
      { id: '5+0', games: 5, wins: 3, draws: 0, losses: 2, winPct: 60, confidence: 'medium' },
      { id: '3+2', games: 4, wins: 1, draws: 1, losses: 2, winPct: 25, confidence: 'low' },
      { id: '1+0', games: 2, wins: 2, draws: 0, losses: 0, winPct: 100, confidence: 'low' },
    ]);
    expect(model.timeControls.find((row) => row.id === 'none')).toBeUndefined();
    expect(model.timeControls.find((row) => row.id === 'broken')).toBeUndefined();
    for (const row of model.timeControls) {
      expect(row).not.toHaveProperty('skill');
      expect(row).not.toHaveProperty('improved');
      expect(row).not.toHaveProperty('trend');
    }
  });

  it('does not add a time-control section when no real clock evidence exists', () => {
    const model = buildPlayerModel({
      insights: { totalGames: 3 },
      timeControlStats: {
        none: { games: 3, wins: 1, draws: 1, losses: 1 },
        broken: { games: 0, wins: 0, draws: 0, losses: 0 },
      },
    });

    expect(model).not.toHaveProperty('timeControls');
  });
});
