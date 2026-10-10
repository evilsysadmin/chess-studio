import { describe, expect, it } from 'vitest';
import { FOOTBALL_MANAGER_CLUBS } from './footballManagerClubs.js';
import { createFootballSeason, advanceFootballSeason } from './footballManagerSeason.js';
import { FOOTBALL_CLUB_TARGETS, footballClubObjectiveReport } from './footballManagerObjectives.js';

describe('Football manager · measurable club objectives', () => {
  const play = (clubId, seed = 2026) => {
    let season = createFootballSeason({ seed });
    const club = FOOTBALL_MANAGER_CLUBS.find((entry) => entry.id === clubId);
    // Pure spectator simulation is sufficient for measuring standings-based
    // objectives; manager decisions are exercised by the career E2E path.
    for (let i = 0; i < 10; i += 1) season = advanceFootballSeason(season);
    return { season, club };
  };

  it('covers exactly the six canonical clubs without mixing objectives', () => {
    expect(Object.keys(FOOTBALL_CLUB_TARGETS).sort()).toEqual(FOOTBALL_MANAGER_CLUBS.map((club) => club.id).sort());
    for (const club of FOOTBALL_MANAGER_CLUBS) {
      const season = createFootballSeason({ seed: 2026 });
      const report = footballClubObjectiveReport(season, club.id);
      expect(report.title).toBeTruthy();
      expect(report.detail).toBeTruthy();
      expect(report.status).toBe('pending');
      expect(report.statusLabel).toBe('En disputa');
      expect(Object.isFrozen(report)).toBe(true);
    }
  });

  it('never claims final success before round ten, including fast point targets', () => {
    const clubId = 'peones-del-norte';
    const all = play(clubId, 2026).season;
    expect(footballClubObjectiveReport(all, clubId).status).not.toBe('pending');
    const nearly = { ...all, currentRound: 9 };
    expect(footballClubObjectiveReport(nearly, clubId).status).toBe('pending');
  });

  it('derives championship and top-three targets from actual final table', () => {
    const { season } = play('fc-matthias', 2026);
    for (const clubId of ['fc-matthias', 'real-enroque', 'atletico-torreon']) {
      const report = footballClubObjectiveReport(season, clubId);
      const goal = FOOTBALL_CLUB_TARGETS[clubId].limit;
      expect(report.status).toBe(report.position <= goal ? 'met' : 'missed');
      expect(report.progress).toContain(`Meta: ${goal}.º o mejor`);
    }
  });

  it('counts only genuine wins against high-rated clubs for Gambito', () => {
    const original = createFootballSeason({ seed: 2026 });
    const report = footballClubObjectiveReport(original, 'deportivo-gambito');
    expect(report.progress).toContain('0 de 1');
    const opponent = original.clubs.find((club) => club.level >= 4);
    const fakeNotCounted = { ...original, currentRound: 10, results: [
      { homeId: 'deportivo-gambito', awayId: 'union-alfil', homeGoals: 5, awayGoals: 0 },
    ] };
    expect(footballClubObjectiveReport(fakeNotCounted, 'deportivo-gambito').status).toBe('missed');
    const scored = { ...original, currentRound: 10, results: [
      { homeId: 'deportivo-gambito', awayId: opponent.id, homeGoals: 1, awayGoals: 0 },
    ] };
    expect(footballClubObjectiveReport(scored, 'deportivo-gambito').status).toBe('met');
    expect(footballClubObjectiveReport(scored, 'deportivo-gambito').progress).toContain('1 de 1');
  });

  it('refuses unknown clubs or invalid season states', () => {
    const season = createFootballSeason({ seed: 2026 });
    expect(() => footballClubObjectiveReport(season, 'fake')).toThrow('objective');
    expect(() => footballClubObjectiveReport({ ...season, currentRound: 11 }, 'fc-matthias')).toThrow('objective');
  });
});
