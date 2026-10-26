import { describe, expect, it } from 'vitest';
import { cleanGameSummary, CLEAN_GAME_INCIDENT_COVERAGE_VERSION, CLEAN_GAME_POSITIVE_EVIDENCE_VERSION } from './cleanGameRecords.js';
import { cleanGameSummary as publicCleanGameSummary } from './cleanGames.js';

describe('lightweight clean-game read model', () => {
  it('preserves the existing summary and public cleanGames facade', () => {
    const records = {
      c: { version: 1, sufficientSample: true, clean: true, date: '2026-09-03' },
      a: { version: 1, sufficientSample: true, clean: true, date: '2026-09-01' },
      b: { version: 1, sufficientSample: true, clean: false, date: '2026-09-02' },
      ignored: { version: 1, sufficientSample: false, clean: true, date: '2026-09-04' },
    };
    const summary = cleanGameSummary(records);
    expect(summary).toMatchObject({ eligible: 3, clean: 2, rate: 67, currentStreak: 1, bestStreak: 1 });
    expect(summary.latest.date).toBe('2026-09-03');
    expect(summary.latestClean.date).toBe('2026-09-03');
    expect(publicCleanGameSummary(records)).toEqual(summary);
    expect(CLEAN_GAME_INCIDENT_COVERAGE_VERSION).toBe(1);
    expect(CLEAN_GAME_POSITIVE_EVIDENCE_VERSION).toBe(1);
  });

  it('does not invent a clean streak without eligible records', () => {
    expect(cleanGameSummary({})).toMatchObject({ eligible: 0, clean: 0, rate: null, currentStreak: 0, bestStreak: 0, latest: null, latestClean: null });
  });
});
