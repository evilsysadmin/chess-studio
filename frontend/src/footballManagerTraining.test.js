import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { getFootballClubRoster, getDefaultFootballLineup, advanceFootballFatigue } from './footballManagerRoster.js';
import { createFootballSeason, advanceFootballSeason } from './footballManagerSeason.js';
import { FOOTBALL_TRAINING_PLANS, prepareFootballTraining } from './footballManagerTraining.js';

describe('Football manager · training has match consequences', () => {
  const roster = getFootballClubRoster(FOOTBALL_MANAGER_CLUBS[0]);
  const lineup = getDefaultFootballLineup(roster);
  const clubId = FOOTBALL_MANAGER_CLUBS[0].id;

  it('keeps four bounded deterministic decisions with exact fatigue costs', () => {
    expect(FOOTBALL_TRAINING_PLANS.map((p) => p.id)).toEqual(['standard', 'shooting', 'shape', 'recovery']);
    const fatigue = Object.fromEntries(roster.map(({ id }) => [id, 17]));
    const rest = prepareFootballTraining(roster, lineup, fatigue, 'recovery');
    expect(lineup.map((id) => rest.kickoffFatigue[id])).toEqual([5, 5, 5, 5, 5]);
    expect(rest.attackBonus).toBe(0);
    expect(Object.isFrozen(rest.kickoffFatigue)).toBe(true);
    const shots = prepareFootballTraining(roster, lineup, fatigue, 'shooting');
    expect(shots.attackBonus).toBe(.035);
    expect(shots.kickoffFatigue[lineup[0]]).toBe(24);
    expect(shots.kickoffFatigue[roster[8].id]).toBe(17);
    expect(prepareFootballTraining(roster, lineup, fatigue, 'shape').defenseBonus).toBe(.035);
    expect(() => prepareFootballTraining(roster, lineup, fatigue, 'fake')).toThrow('training');
    expect(() => prepareFootballTraining(roster, [...lineup.slice(0, 4), 'fake'], fatigue)).toThrow('lineup');
  });

  it('recovery reduces kickoff fatigue from 17 to 5 and survives after the match', () => {
    const first = advanceFootballSeason(createFootballSeason({ seed: 2026 }), { managerClubId: clubId, lineup });
    expect(first.managerFatigue[lineup[0]]).toBe(17);
    const regular = advanceFootballSeason(first, { managerClubId: clubId, lineup, training: 'standard' });
    const rest = advanceFootballSeason(first, { managerClubId: clubId, lineup, training: 'recovery' });
    const a = regular.results.find((r) => r.round === 2 && r.managerLineup);
    const b = rest.results.find((r) => r.round === 2 && r.managerLineup);
    expect(a.managerFatigueAtKickoff).toBe(17);
    expect(b.managerFatigueAtKickoff).toBe(5);
    expect(b.managerTraining).toBe('recovery');
    expect(rest.managerFatigue[lineup[0]]).toBe(22);
    expect(regular.managerFatigue[lineup[0]]).toBe(34);
    expect(rest.results.slice(0, 3)).toEqual(first.results);
    expect(advanceFootballFatigue(roster, lineup, prepareFootballTraining(roster, lineup, first.managerFatigue, 'recovery').kickoffFatigue)).toEqual(rest.managerFatigue);
  });

  it('shooting can change real seeded matches, never unrelated games', () => {
    const divergent = Array.from({ length: 160 }, (_, seed) => seed).some(seed => {
      const initial = createFootballSeason({ seed });
      const normal = advanceFootballSeason(initial, { managerClubId: clubId, lineup });
      const shooting = advanceFootballSeason(initial, { managerClubId: clubId, lineup, training: 'shooting' });
      expect(shooting.results.filter(r => !r.managerLineup)).toEqual(normal.results.filter(r => !r.managerLineup));
      const a = normal.results.find(r => r.managerLineup);
      const b = shooting.results.find(r => r.managerLineup);
      return a.homeGoals !== b.homeGoals || a.awayGoals !== b.awayGoals;
    });
    expect(divergent).toBe(true);
    expect(() => advanceFootballSeason(createFootballSeason(), { training: 'recovery' })).toThrow('manager');
  });
});
