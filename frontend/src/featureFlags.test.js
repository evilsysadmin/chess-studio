import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, DEFAULT_MATCHMAKING_TARGET_LEAD_ELO, normalizeFeatureFlags } from './featureFlags.js';

describe('public feature flags', () => {
  it('mantiene defaults seguros si el backend no responde con config válida', () => {
    expect(normalizeFeatureFlags(null)).toEqual({ ...DEFAULT_FEATURE_FLAGS, matchmakingTargetLeadElo: DEFAULT_MATCHMAKING_TARGET_LEAD_ELO   it('acepta un lead Elo público acotado', () => {
    expect(normalizeFeatureFlags({ features: {}, matchmaking: { targetLeadElo: 75 } }).matchmakingTargetLeadElo).toBe(75);
    expect(normalizeFeatureFlags({ features: {}, matchmaking: { targetLeadElo: 999 } }).matchmakingTargetLeadElo).toBe(150);
  });
});
  });

  it('sólo acepta booleanos de flags conocidos', () => {
    expect(normalizeFeatureFlags({ features: { spectator: false, unknown: false } })).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      spectator: false,
      matchmakingTargetLeadElo: DEFAULT_MATCHMAKING_TARGET_LEAD_ELO,
    });
  });
});
