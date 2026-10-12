import { beforeEach, describe, expect, it } from 'vitest';
import {
  createFootballCareer, editFootballCareer, playFootballCareerRound, replayFootballCareer,
  startNextFootballSeason, FOOTBALL_CAREER_MAX_SEASONS, writeFootballCareer, readFootballCareer,
  FOOTBALL_CAREER_VERSION, FOOTBALL_CAREER_KEY,
} from './footballManagerCareer.js';
import { STORAGE_LOCAL, clearStorageMemoryFallback, removeStorageItem } from './safeStorage.js';

const playToEnd = (journal) => {
  let current = journal;
  while (current.rounds.length < 10) current = playFootballCareerRound(current).journal;
  return replayFootballCareer(current);
};

describe('Football manager · continuous multi-season career', () => {
  beforeEach(() => {
    clearStorageMemoryFallback();
    removeStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY);
  });

  it('renews only completed leagues; preserves earned players, history and club identity', () => {
    let first = createFootballCareer('fc-matthias', 2026);
    expect(() => startNextFootballSeason(first)).toThrow('complete');
    first = editFootballCareer(first, { training: 'shooting' }).journal;
    const completed = playToEnd(first);
    const id = completed.journal.nextLineup[0];
    const earned = completed.season.managerDevelopment[id];
    expect(earned.starts).toBe(10);
    const actualResults = completed.season.results;
    const next = startNextFootballSeason(completed.journal);
    expect(next.journal.version).toBe(FOOTBALL_CAREER_VERSION);
    expect(next.journal.clubId).toBe('fc-matthias');
    expect(next.journal.initialSeed).toBe(2026);
    expect(next.journal.seed).toBe(2027);
    expect(next.journal.completedSeasons).toHaveLength(1);
    expect(next.journal.rounds).toHaveLength(0);
    expect(next.journal.nextTraining).toBe('standard');
    expect(next.season.currentRound).toBe(0);
    expect(next.season.results).toEqual([]);
    expect(next.season.managerFatigue).toBeUndefined();
    expect(next.season.managerDevelopment[id]).toEqual(earned);
    expect(next.history).toHaveLength(1);
    expect(next.history[0].number).toBe(1);
    expect(next.history[0].position).toBeGreaterThan(0);
    expect(next.history[0].points).toBeGreaterThanOrEqual(0);
    expect(Object.isFrozen(next.history)).toBe(true);
    expect(replayFootballCareer(completed.journal).season.results).toEqual(actualResults);
    expect(() => editFootballCareer(completed.journal, { tactic: 'attack' })).toThrow('complete');
  });

  it('records new season decisions without ever rewriting previous league or standings', () => {
    const first = playToEnd(editFootballCareer(createFootballCareer('fc-matthias', 67), { training: 'shooting' }).journal);
    const next = startNextFootballSeason(first.journal);
    const changed = playFootballCareerRound(next.journal);
    expect(changed.season.currentRound).toBe(1);
    expect(changed.journal.completedSeasons).toEqual(next.journal.completedSeasons);
    expect(changed.history).toEqual(next.history);
    expect(changed.season.managerDevelopment[next.journal.nextLineup[0]].starts).toBe(11);
    expect(replayFootballCareer(changed.journal)).toEqual(changed);
    expect(writeFootballCareer(changed.journal).status).toBe('saved');
    expect(readFootballCareer().season).toEqual(changed.season);
    expect(readFootballCareer().history).toEqual(first.history.length ? first.history : next.history);
  });

  it('migrates completed v1/v2/v3 seasons losslessly before renewal', () => {
    const original = playToEnd(editFootballCareer(createFootballCareer('fc-matthias', 123), { training: 'shooting' }).journal);
    for (const version of [1, 2, 3]) {
      const old = { ...original.journal, version };
      delete old.initialSeed;
      delete old.completedSeasons;
      if (version <= 2) delete old.legacyRounds;
      if (version === 1) {
        delete old.nextTraining;
        old.rounds = old.rounds.map(({ tactic, lineup }) => ({ tactic, lineup }));
      }
      const migration = replayFootballCareer(old);
      expect(migration.journal.version).toBe(4);
      expect(migration.journal.legacyRounds).toBe(version <= 2 ? 10 : 0);
      expect(migration.season.currentRound).toBe(10);
      // The same version-3 journal is exactly stable: none of its played
      // fixtures is replayed under a different player-development contract.
      if (version === 3) expect(migration.season.results).toEqual(original.season.results);
      const renewed = startNextFootballSeason(migration.journal);
      expect(renewed.history).toHaveLength(1);
      expect(renewed.season.currentRound).toBe(0);
      expect(renewed.journal.completedSeasons[0].legacyRounds).toBe(version <= 2 ? 10 : 0);
      expect(replayFootballCareer(renewed.journal)).toEqual(renewed);
    }
  });

  it('bounds historical archive, refuses forged completed seasons and seed chain corruption', () => {
    let current = createFootballCareer('fc-matthias', Number.MAX_SAFE_INTEGER);
    for (let i = 0; i < FOOTBALL_CAREER_MAX_SEASONS; i += 1) {
      const finished = playToEnd(current);
      expect(finished.season.currentRound).toBe(10);
      if (i === FOOTBALL_CAREER_MAX_SEASONS - 1) {
        expect(() => startNextFootballSeason(finished.journal)).toThrow('limit');
        expect(finished.history).toHaveLength(FOOTBALL_CAREER_MAX_SEASONS - 1);
        expect(JSON.stringify(finished.journal).length).toBeLessThan(16000);
        break;
      }
      current = startNextFootballSeason(finished.journal).journal;
      expect(current.seed).toBe(i);
    }
    const baseline = startNextFootballSeason(playToEnd(createFootballCareer('fc-matthias')).journal).journal;
    expect(() => replayFootballCareer({ ...baseline, seed: 1234 })).toThrow('seed chain');
    expect(() => replayFootballCareer({ ...baseline, initialSeed: -1 })).toThrow('initial seed');
    expect(() => replayFootballCareer({ ...baseline, completedSeasons: [{ rounds: [] }] })).toThrow('round count');
    expect(() => replayFootballCareer({
      ...baseline, completedSeasons: [{ rounds: baseline.completedSeasons[0].rounds, legacyRounds: 11 }],
    })).toThrow('boundary');
    expect(() => replayFootballCareer({
      ...baseline, completedSeasons: Array(FOOTBALL_CAREER_MAX_SEASONS).fill(baseline.completedSeasons[0]),
    })).toThrow('completed seasons');
  });
});
