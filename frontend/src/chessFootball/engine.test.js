import { describe, expect, it } from 'vitest';
import { createSchedule, createSeason, playNextRound, seasonComplete, simulateMatch, tableFor } from './engine.js';

describe('Chess Football simulation core', () => {
  it('creates a deterministic six-club double round robin', () => {
    const season = createSeason('alpha');
    expect(season.clubs).toHaveLength(6);
    expect(season.clubs.every((club) => club.squad.length === 18)).toBe(true);
    expect(season.schedule).toHaveLength(10);
    expect(season.schedule.every((round) => round.matches.length === 3)).toBe(true);
    const pairings = season.schedule.flatMap((round) => round.matches.map(({ homeId, awayId }) => homeId + ':' + awayId));
    expect(new Set(pairings)).toHaveLength(30);
  });

  it('replays the same match exactly from the same seed', () => {
    const season = createSeason('repeatable');
    const [home, away] = season.clubs;
    expect(simulateMatch(home, away, 'same')).toEqual(simulateMatch(home, away, 'same'));
  });

  it('advances one round without mutating the previous state', () => {
    const initial = createSeason('round');
    const next = playNextRound(initial);
    expect(initial.roundIndex).toBe(0);
    expect(initial.results).toHaveLength(0);
    expect(next.roundIndex).toBe(1);
    expect(next.results).toHaveLength(1);
    expect(tableFor(next).reduce((sum, row) => sum + row.played, 0)).toBe(6);
  });

  it('finishes after ten rounds and preserves league accounting', () => {
    let state = createSeason('full-season');
    while (!seasonComplete(state)) state = playNextRound(state);
    const table = tableFor(state);
    expect(state.results).toHaveLength(10);
    expect(table.every((row) => row.played === 10)).toBe(true);
    expect(table.reduce((sum, row) => sum + row.gf, 0)).toBe(table.reduce((sum, row) => sum + row.ga, 0));
  });

  it('rejects odd club counts instead of inventing hidden byes', () => {
    expect(() => createSchedule(['a', 'b', 'c'])).toThrow(/even number/);
  });
});
