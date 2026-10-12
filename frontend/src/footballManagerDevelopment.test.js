import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { getDefaultFootballLineup, getFootballClubRoster, evaluateFootballLineup } from './footballManagerRoster.js';
import { advanceFootballSeason, createFootballSeason } from './footballManagerSeason.js';
import { advanceFootballDevelopment, getDevelopedFootballRoster, FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE } from './footballManagerDevelopment.js';

describe('Football manager · earned development', () => {
  const club = FOOTBALL_MANAGER_CLUBS[0];
  const roster = getFootballClubRoster(club);
  const starters = getDefaultFootballLineup(roster);
  const bench = roster.find(player => !starters.includes(player.id));

  it('only credits selected starters and recorded training, never a benched player', () => {
    let growth = undefined;
    for (let i = 0; i < 4; i += 1) growth = advanceFootballDevelopment(roster, starters, 'shooting', growth);
    const improved = getDevelopedFootballRoster(roster, growth);
    expect(improved.filter(player => player.starts === 4)).toHaveLength(5);
    expect(improved.find(player => player.id === starters[0]).attackGrowth).toBe(3);
    expect(improved.find(player => player.id === starters[0]).defenseGrowth).toBe(1);
    const idle = improved.find(player => player.id === bench.id);
    expect(idle.starts).toBe(0);
    expect(idle.attackGrowth).toBe(0);
    expect(idle.defenseGrowth).toBe(0);
    expect(Object.isFrozen(growth)).toBe(true);
    expect(Object.isFrozen(improved[0])).toBe(true);
    expect(roster[0].attack).not.toBe(improved[0].attack);
    expect(() => advanceFootballDevelopment(roster, starters, 'unknown', growth)).toThrow('training');
  });

  it('a defensive plan develops defense; recovery never grants invented training', () => {
    let data;
    for (let i = 0; i < 2; i += 1) data = advanceFootballDevelopment(roster, starters, 'shape', data);
    expect(getDevelopedFootballRoster(roster, data)[0].defenseGrowth).toBe(1);
    expect(getDevelopedFootballRoster(roster, data)[0].attackGrowth).toBe(0);
    const rest = advanceFootballDevelopment(roster, starters, 'recovery', data);
    expect(getDevelopedFootballRoster(roster, rest)[0].attackGrowth).toBe(0);
    expect(getDevelopedFootballRoster(roster, rest)[0].defenseGrowth).toBe(1);
    expect(rest[starters[0]].starts).toBe(3);
    expect(rest[starters[0]].shape).toBe(2);
  });

  it('caps every attribute at +4 even when trained repeatedly', () => {
    let development;
    for (let i = 0; i < 10; i += 1) development = advanceFootballDevelopment(roster, starters, 'shooting', development);
    const grown = getDevelopedFootballRoster(roster, development);
    expect(grown[0].attackGrowth).toBe(FOOTBALL_MAX_GROWTH_PER_ATTRIBUTE);
    expect(grown[0].defenseGrowth).toBe(2);
    expect(grown[0].attack).toBe(roster[0].attack + 4);
    expect(grown[0].defense).toBe(roster[0].defense + 2);
  });

  it('earned attributes affect only the manager fixture on later rounds', () => {
    const altered = Array.from({ length: 250 }, (_, seed) => seed).some(seed => {
      let season = createFootballSeason({ seed });
      for (let i = 0; i < 8; i += 1) {
        season = advanceFootballSeason(season, { managerClubId: club.id, lineup: starters, training: 'shooting', development: true });
      }
      const grown = advanceFootballSeason(season, { managerClubId: club.id, lineup: starters, development: true });
      const reset = advanceFootballSeason({ ...season, managerDevelopment: undefined }, { managerClubId: club.id, lineup: starters, development: true });
      expect(grown.results.slice(0, 24)).toEqual(season.results);
      expect(grown.results.filter(r => r.round === 9 && !r.managerLineup)).toEqual(reset.results.filter(r => r.round === 9 && !r.managerLineup));
      const a = grown.results.find(r => r.round === 9 && r.managerLineup);
      const b = reset.results.find(r => r.round === 9 && r.managerLineup);
      return a.homeGoals !== b.homeGoals || a.awayGoals !== b.awayGoals;
    });
    expect(altered).toBe(true);
    expect(evaluateFootballLineup(roster, starters).attackDelta).toBe(0);
  });
});
