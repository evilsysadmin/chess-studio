import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { advanceFootballSeason, createFootballSeason, footballStandings } from './footballManagerSeason.js';

function finishSeason(seed) {
  let season = createFootballSeason({ seed });
  for (let round = 0; round < 10; round += 1) season = advanceFootballSeason(season);
  return season;
}

describe('Football manager season slice 0', () => {
  it('creates a true six-club double round-robin with exactly ten matchdays', () => {
    const season = createFootballSeason({ seed: 417 });
    expect(season.currentRound).toBe(0);
    expect(season.results).toHaveLength(0);
    expect(season.rounds).toHaveLength(10);
    expect(season.rounds.every((fixtures) => fixtures.length === 3)).toBe(true);
    const fixtures = season.rounds.flat();
    expect(new Set(fixtures.map((game) => game.id)).size).toBe(30);
    const perTeam = Object.fromEntries(season.clubs.map((club) => [club.id, { home: 0, away: 0 }]));
    const pairings = new Map();
    for (const game of fixtures) {
      expect(game.homeId).not.toBe(game.awayId);
      perTeam[game.homeId].home += 1;
      perTeam[game.awayId].away += 1;
      const pair = [game.homeId, game.awayId].sort().join(':');
      pairings.set(pair, [...(pairings.get(pair) || []), game]);
    }
    expect(pairings.size).toBe(15);
    expect(Object.values(perTeam).every(({ home, away }) => home === 5 && away === 5)).toBe(true);
    for (const [pair, games] of pairings) {
      expect(games, pair).toHaveLength(2);
      expect(games[0].homeId).toBe(games[1].awayId);
      expect(games[0].awayId).toBe(games[1].homeId);
    }
  });

  it('advances exactly once per round and derives standings from actual simulated results', () => {
    const initial = createFootballSeason({ seed: 14 });
    const afterFirst = advanceFootballSeason(initial);
    expect(initial.currentRound).toBe(0);
    expect(initial.results).toHaveLength(0);
    expect(afterFirst.currentRound).toBe(1);
    expect(afterFirst.results).toHaveLength(3);
    expect(afterFirst.results.every((game) => game.source === 'statistical-simulation')).toBe(true);

    const finished = finishSeason(14);
    expect(finished.currentRound).toBe(10);
    expect(finished.results).toHaveLength(30);
    expect(advanceFootballSeason(finished)).toBe(finished);
    expect(new Set(finished.results.map((result) => result.fixtureId)).size).toBe(30);
    expect(finished.results.every((result) => Number.isInteger(result.homeGoals) && result.homeGoals >= 0
      && Number.isInteger(result.awayGoals) && result.awayGoals >= 0)).toBe(true);

    const table = footballStandings(finished);
    expect(table).toHaveLength(6);
    expect(table.every((row) => row.played === 10)).toBe(true);
    expect(table.every((row) => row.played === row.won + row.drawn + row.lost)).toBe(true);
    expect(table.every((row) => row.points === 3 * row.won + row.drawn)).toBe(true);
    expect(table.reduce((sum, row) => sum + row.scored, 0))
      .toBe(table.reduce((sum, row) => sum + row.conceded, 0));
    expect(table.reduce((sum, row) => sum + row.won, 0))
      .toBe(table.reduce((sum, row) => sum + row.lost, 0));
    expect(table.reduce((sum, row) => sum + row.difference, 0)).toBe(0);
    expect(table).toEqual([...table].sort((a, b) => b.points - a.points
      || b.difference - a.difference || b.scored - a.scored
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
  });

  it('replays fixtures and match results from the exact same seed', () => {
    const firstRun = finishSeason(2026);
    const independentReplay = finishSeason(2026);
    const differentSeed = finishSeason(2027);
    expect(independentReplay).toEqual(firstRun);
    expect(differentSeed.results).not.toEqual(firstRun.results);
    expect(Object.isFrozen(finishSeason(42))).toBe(true);
    expect(Object.isFrozen(finishSeason(42).results)).toBe(true);
    expect(footballStandings(createFootballSeason()).every((row) => row.points === 0)).toBe(true);
  });

  it('rejects duplicate clubs and invalid seeds instead of inventing a league', () => {
    expect(() => createFootballSeason({ seed: -1 })).toThrow('seed');
    expect(() => createFootballSeason({ seed: 0.5 })).toThrow('seed');
    expect(() => createFootballSeason({ clubs: FOOTBALL_MANAGER_CLUBS.slice(0, 4) })).toThrow('six');
    expect(() => createFootballSeason({ clubs: [...FOOTBALL_MANAGER_CLUBS.slice(0, 5), FOOTBALL_MANAGER_CLUBS[0]] }))
      .toThrow('repeated');
  });
});
