import { describe, it, expect } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { createFootballSeason, advanceFootballSeason } from './footballManagerSeason.js';
import { getFootballClubRoster, getDefaultFootballLineup, evaluateFootballLineup } from './footballManagerRoster.js';

describe('Football manager · real five-a-side starting lineup', () => {
  it('creates nine stable fictional identities and a legal five-player formation per club', () => {
    for (const club of FOOTBALL_MANAGER_CLUBS) {
      const roster = getFootballClubRoster(club);
      expect(roster).toHaveLength(9);
      expect(new Set(roster.map((player) => player.id)).size).toBe(9);
      expect(roster).toEqual(getFootballClubRoster(club));
      expect(roster.every((player) => Object.isFrozen(player))).toBe(true);
      expect(roster.every((player) => Number.isInteger(player.attack) && Number.isInteger(player.defense))).toBe(true);
      const defaultLineup = getDefaultFootballLineup(roster);
      expect(defaultLineup).toHaveLength(5);
      expect(evaluateFootballLineup(roster, defaultLineup)).toEqual({
        attackDelta: 0, defenseDelta: 0, lineupIds: defaultLineup,
      });
    }
  });

  it('allows same-role substitutions with actual attack/defense trade-offs', () => {
    const club = FOOTBALL_MANAGER_CLUBS[0];
    const roster = getFootballClubRoster(club);
    const usual = getDefaultFootballLineup(roster);
    const forwards = roster.filter((player) => player.role === 'DEL');
    const alternate = [...usual.slice(0, 4), forwards[1].id];
    const effect = evaluateFootballLineup(roster, alternate);
    expect(effect.attackDelta).toBeLessThan(0);
    expect(effect.defenseDelta).toBeGreaterThan(0);
    const season = createFootballSeason({ seed: 2026 });
    const normal = advanceFootballSeason(season, { managerClubId: club.id, lineup: usual });
    const modified = advanceFootballSeason(season, { managerClubId: club.id, lineup: alternate });
    expect(modified.results.filter((game) => game.managerLineup)).toHaveLength(1);
    expect(modified.results.filter((game) => !game.managerLineup))
      .toEqual(normal.results.filter((game) => !game.managerLineup));
    expect(modified.results.find((game) => game.managerLineup).managerLineup).toEqual(alternate);
    expect(modified.results.find((game) => game.managerLineup).managerLineup).not.toBe(alternate);
    expect(season.results).toHaveLength(0);
    const divergentSeed = Array.from({ length: 128 }, (_, seed) => seed).some((seed) => {
      const initial = createFootballSeason({ seed });
      const base = advanceFootballSeason(initial, { managerClubId: club.id, lineup: usual }).results;
      const alt = advanceFootballSeason(initial, { managerClubId: club.id, lineup: alternate }).results;
      return base.some((game, i) => game.homeGoals !== alt[i].homeGoals || game.awayGoals !== alt[i].awayGoals);
    });
    expect(divergentSeed).toBe(true);
  });

  it('rejects fake, duplicate, illegal formation and foreign-club lineups', () => {
    const roster = getFootballClubRoster(FOOTBALL_MANAGER_CLUBS[0]);
    const defaultLineup = getDefaultFootballLineup(roster);
    const season = createFootballSeason({ seed: 9 });
    expect(() => evaluateFootballLineup(roster, [defaultLineup[0], ...defaultLineup.slice(0, 4)])).toThrow('lineup');
    expect(() => evaluateFootballLineup(roster, [...defaultLineup.slice(0, 4), 'fake'])).toThrow('lineup');
    expect(() => evaluateFootballLineup(roster, [roster[5].id, roster[0].id, ...defaultLineup.slice(2)])).toThrow('formation');
    expect(() => advanceFootballSeason(season, { lineup: defaultLineup })).toThrow('plan');
    expect(() => advanceFootballSeason(season, { managerClubId: FOOTBALL_MANAGER_CLUBS[1].id, lineup: defaultLineup })).toThrow('lineup');
    expect(season.results).toHaveLength(0);
  });
});
