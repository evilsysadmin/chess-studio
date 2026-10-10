import { beforeEach, describe, expect, it } from 'vitest';
import { FOOTBALL_CAREER_KEY, createFootballCareer, editFootballCareer, playFootballCareerRound, readFootballCareer, replayFootballCareer, writeFootballCareer } from './footballManagerCareer.js';
import { STORAGE_LOCAL, clearStorageMemoryFallback, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';
import { clearProfileProgress } from './profileKeys.js';

describe('Football manager · versioned career journal', () => {
  beforeEach(() => { clearStorageMemoryFallback(); removeStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY); });

  it('replays actual decisions, scores and fatigue exactly across re-entry', () => {
    const first = createFootballCareer('fc-matthias', 2026);
    const attack = editFootballCareer(first, { tactic: 'attack', lineup: [
      'fc-matthias-por-1', 'fc-matthias-def-1', 'fc-matthias-med-1', 'fc-matthias-med-2', 'fc-matthias-del-2',
    ] });
    const played = playFootballCareerRound(attack.journal);
    expect(played.season.currentRound).toBe(1);
    expect(played.season.results).toHaveLength(3);
    expect(played.season.managerFatigue['fc-matthias-del-2']).toBe(17);
    expect(played.season.results.find((r) => r.managerTactic)?.managerTactic).toBe('attack');
    expect(writeFootballCareer(played.journal).status).toBe('saved');
    const resumed = readFootballCareer();
    expect(resumed.status).toBe('available');
    expect(resumed.season).toEqual(played.season);
    expect(resumed.journal).toEqual(played.journal);
    expect(resumed.journal).not.toBe(played.journal);
    expect(Object.isFrozen(resumed.journal.rounds)).toBe(true);
    const next = playFootballCareerRound(resumed.journal);
    expect(next.season.currentRound).toBe(2);
    expect(next.season.results.slice(0, 3)).toEqual(played.season.results);
  });

  it('migrates legacy v1 decisions into default training without changing scores', () => {
    let current = createFootballCareer('fc-matthias');
    current = playFootballCareerRound(current).journal;
    const old = { ...current, version: 1, rounds: current.rounds.map(({ tactic, lineup }) => ({ tactic, lineup })) };
    delete old.nextTraining;
    const migrated = replayFootballCareer(old);
    expect(migrated.journal.version).toBe(2);
    expect(migrated.journal.nextTraining).toBe('standard');
    expect(migrated.journal.rounds[0].training).toBe('standard');
    expect(migrated.season.results.map(r => [r.homeGoals, r.awayGoals]))
      .toEqual(replayFootballCareer(current).season.results.map(r => [r.homeGoals, r.awayGoals]));
    expect(playFootballCareerRound(migrated.journal).season).toEqual(playFootballCareerRound(current).season);
  });

  it('persists training choices and does not invent a training history', () => {
    const start = createFootballCareer('fc-matthias');
    const next = editFootballCareer(start, { training: 'shooting' });
    expect(writeFootballCareer(next.journal).status).toBe('saved');
    expect(readFootballCareer().journal.nextTraining).toBe('shooting');
    const played = playFootballCareerRound(readFootballCareer().journal);
    expect(played.journal.rounds[0].training).toBe('shooting');
    expect(played.season.results.find(r => r.managerLineup).managerTraining).toBe('shooting');
    expect(played.season.managerFatigue[played.journal.nextLineup[0]]).toBe(24);
    expect(() => editFootballCareer(played.journal, { training: 'fake' })).toThrow('training');
  });

  it('completes exactly ten rounds and never duplicates a finish', () => {
    let current = createFootballCareer('fc-matthias');
    for (let i = 0; i < 10; i += 1) current = playFootballCareerRound(current).journal;
    const finished = replayFootballCareer(current);
    expect(finished.season.currentRound).toBe(10);
    expect(finished.season.results).toHaveLength(30);
    expect(() => playFootballCareerRound(current)).toThrow('complete');
    expect(() => editFootballCareer(current, { tactic: 'defend' })).toThrow('complete');
  });

  it('reports memory-only progress when Web Storage rejects native writes', () => {
    const original = global.localStorage;
    try {
      global.localStorage = {
        getItem(key) { return original.getItem(key); },
        setItem() { throw new DOMException('full', 'QuotaExceededError'); },
        removeItem() { throw new DOMException('blocked', 'SecurityError'); },
        get length() { return original.length; },
        key(index) { return original.key(index); },
      };
      const career = createFootballCareer('fc-matthias');
      expect(writeFootballCareer(career).status).toBe('memory');
      expect(readFootballCareer().status).toBe('available');
      expect(original.getItem(FOOTBALL_CAREER_KEY)).toBeNull();
      const played = playFootballCareerRound(career);
      expect(writeFootballCareer(played.journal).status).toBe('memory');
      expect(readFootballCareer().season.currentRound).toBe(1);
    } finally {
      global.localStorage = original;
      clearStorageMemoryFallback();
    }
  });

  it('participates in Empezar de cero as progress, not as a preference', () => {
    expect(writeFootballCareer(createFootballCareer('fc-matthias')).status).toBe('saved');
    expect(readFootballCareer().status).toBe('available');
    clearProfileProgress();
    expect(readFootballCareer().status).toBe('empty');
  });

  it('fails closed on corruption, invented players or future versions without deleting data', () => {
    const fresh = createFootballCareer('fc-matthias');
    expect(() => editFootballCareer(fresh, { tactic: 'absurd' })).toThrow('tactic');
    expect(() => editFootballCareer(fresh, { lineup: [
      'fc-matthias-por-1','fc-matthias-def-1','fc-matthias-med-1','fc-matthias-med-2','other-club-del-1',
    ] })).toThrow('lineup');
    expect(() => replayFootballCareer({ ...fresh, rounds: Array(11).fill({ tactic: 'balanced', lineup: fresh.nextLineup }) })).toThrow();
    setStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY, '{broken');
    expect(readFootballCareer().status).toBe('invalid');
    expect(getStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY)).toBe('{broken');
    const future = JSON.stringify({ ...fresh, version: 500 });
    setStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY, future);
    expect(readFootballCareer().status).toBe('future');
    expect(writeFootballCareer(fresh).status).toBe('future');
    expect(getStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY)).toBe(future);
  });
});
