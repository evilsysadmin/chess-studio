import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { advanceFootballSeason, createFootballSeason, footballStandings, FOOTBALL_MANAGER_TACTICS } from './footballManagerSeason.js';

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

  it('applies the chosen tactical trade-off only to our next fixture', () => {
    expect(FOOTBALL_MANAGER_TACTICS.map((plan) => plan.id)).toEqual(['balanced', 'attack', 'defend']);
    const create = (seed) => createFootballSeason({ seed });
    const simulate = (seed, tactic) => advanceFootballSeason(create(seed), {
      managerClubId: 'fc-matthias', tactic,
    });
    const season = simulate(2026, 'attack');
    expect(season.results).toHaveLength(3);
    expect(season.results.filter((result) => result.managerTactic === 'attack')).toHaveLength(1);
    expect(season.results.filter((result) => !result.managerTactic)).toHaveLength(2);
    const original = advanceFootballSeason(create(2026));
    expect(season.results.filter((result) => !result.managerTactic))
      .toEqual(original.results.filter((result) => result.homeId !== 'fc-matthias' && result.awayId !== 'fc-matthias'));

    // The trade-off must have observable outcomes across different seeds,
    // rather than being a cosmetic button or a forced score.
    const hasDifference = Array.from({ length: 64 }, (_, seed) => seed).some((seed) => {
      const balanced = simulate(seed, 'balanced').results.find((result) => result.managerTactic);
      const aggressive = simulate(seed, 'attack').results.find((result) => result.managerTactic);
      const defensive = simulate(seed, 'defend').results.find((result) => result.managerTactic);
      return balanced.homeGoals !== aggressive.homeGoals
        || balanced.awayGoals !== aggressive.awayGoals
        || balanced.homeGoals !== defensive.homeGoals
        || balanced.awayGoals !== defensive.awayGoals;
    });
    expect(hasDifference).toBe(true);
    // Even with an extreme level spread, matches without our club retain
    // exactly the previous statistical model and results.
    const wideLevels = FOOTBALL_MANAGER_CLUBS.map((club, index) => ({
      ...club, level: index % 2 ? 5 : 1,
    }));
    const varied = createFootballSeason({ clubs: wideLevels, seed: 2026 });
    const baseline = advanceFootballSeason(varied).results;
    const adjusted = advanceFootballSeason(varied, {
      managerClubId: 'fc-matthias', tactic: 'attack',
    }).results;
    expect(adjusted.filter((result) => !result.managerTactic))
      .toEqual(baseline.filter((result) => result.homeId !== 'fc-matthias' && result.awayId !== 'fc-matthias'));

    const next = advanceFootballSeason(season, { managerClubId: 'fc-matthias', tactic: 'defend' });
    expect(next.results.slice(0, 3)).toEqual(season.results);
    expect(next.results.slice(3).filter((result) => result.managerTactic === 'defend')).toHaveLength(1);
    expect(advanceFootballSeason(season, { managerClubId: 'fc-matthias', tactic: 'defend' }))
      .toEqual(next);
  });

  it('rejects invented tactics and clubs without mutating the season', () => {
    const season = createFootballSeason({ seed: 2 });
    expect(() => advanceFootballSeason(season, { managerClubId: 'no-such-club' })).toThrow('tactical');
    expect(() => advanceFootballSeason(season, { managerClubId: 'fc-matthias', tactic: 'impossible' })).toThrow('tactical');
    expect(() => advanceFootballSeason(season, { tactic: 'attack' })).toThrow('tactical');
    expect(season.results).toHaveLength(0);
  });

  it('rejects duplicate clubs and invalid seeds instead of inventing a league', () => {
    expect(() => createFootballSeason({ seed: -1 })).toThrow('seed');
    expect(() => createFootballSeason({ seed: 0.5 })).toThrow('seed');
    expect(() => createFootballSeason({ clubs: FOOTBALL_MANAGER_CLUBS.slice(0, 4) })).toThrow('six');
    expect(() => createFootballSeason({ clubs: [...FOOTBALL_MANAGER_CLUBS.slice(0, 5), FOOTBALL_MANAGER_CLUBS[0]] }))
      .toThrow('repeated');
  });
});
