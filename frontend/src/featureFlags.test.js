import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURE_FLAGS, normalizeFeatureFlags } from './featureFlags.js';

describe('public feature flags', () => {
  it('mantiene defaults seguros si el backend no responde con config válida', () => {
    expect(normalizeFeatureFlags(null)).toEqual(DEFAULT_FEATURE_FLAGS);
  });

  it('sólo acepta booleanos de flags conocidos', () => {
    expect(normalizeFeatureFlags({ features: { spectator: false, rivalGhost: 'no', unknown: false } })).toEqual({
      ...DEFAULT_FEATURE_FLAGS,
      spectator: false,
    });
  });
});
