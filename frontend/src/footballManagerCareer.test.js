import { beforeEach, describe, expect, it } from 'vitest';
import { FOOTBALL_CAREER_KEY, createFootballCareer, editFootballCareer, playFootballCareerRound, readFootballCareer, replayFootballCareer, writeFootballCareer } from './footballManagerCareer.js';
import { STORAGE_LOCAL, getStorageItem, removeStorageItem, setStorageItem } from './safeStorage.js';

describe('Football manager · versioned career journal', () => {
  beforeEach(() => { removeStorageItem(STORAGE_LOCAL, FOOTBALL_CAREER_KEY); });

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

  it('completes exactly ten rounds and never duplicates a finish', () => {
    let current = createFootballCareer('fc-matthias');
    for (let i = 0; i < 10; i += 1) current = playFootballCareerRound(current).journal;
    const finished = replayFootballCareer(current);
    expect(finished.season.currentRound).toBe(10);
    expect(finished.season.results).toHaveLength(30);
    expect(() => playFootballCareerRound(current)).toThrow('complete');
    expect(() => editFootballCareer(current, { tactic: 'defend' })).toThrow('complete');
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
