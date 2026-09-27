import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_MATCHMAKING_TARGET_LEAD_ELO,
  getMatchmakingTargetLeadElo,
  normalizeMatchmakingTargetLeadElo,
  setMatchmakingTargetLeadElo,
} from './matchmakingSettings.js';

beforeEach(() => setMatchmakingTargetLeadElo(DEFAULT_MATCHMAKING_TARGET_LEAD_ELO));

describe('matchmaking runtime settings', () => {
  it('normalizes and clamps the target lead', () => {
    expect(normalizeMatchmakingTargetLeadElo('72')).toBe(72);
    expect(normalizeMatchmakingTargetLeadElo(-10)).toBe(0);
    expect(normalizeMatchmakingTargetLeadElo(999)).toBe(150);
    expect(normalizeMatchmakingTargetLeadElo('nope')).toBe(50);
  });

  it('updates the in-memory value consumed by quick matchmaking', () => {
    setMatchmakingTargetLeadElo(75);
    expect(getMatchmakingTargetLeadElo()).toBe(75);
  });
});
