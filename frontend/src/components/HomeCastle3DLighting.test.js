import { describe, expect, it } from 'vitest';
import { HOME_CASTLE_LIGHTING, homeCastleLightingProfile } from './HomeCastle3DLighting.js';

describe('HomeCastle3DLighting', () => {
  it('keeps every castle ambient state explicit', () => {
    expect(Object.keys(HOME_CASTLE_LIGHTING).sort()).toEqual(['dawn', 'day', 'dusk', 'night']);
  });

  it('makes night darker and more torch-led than day', () => {
    const day = homeCastleLightingProfile('day');
    const night = homeCastleLightingProfile('night');

    expect(night.exposure).toBeLessThan(day.exposure);
    expect(night.ambient).toBeLessThan(day.ambient);
    expect(night.torch).toBeGreaterThan(day.torch);
  });

  it('falls back to day for an unknown ambient state', () => {
    expect(homeCastleLightingProfile('unknown')).toBe(HOME_CASTLE_LIGHTING.day);
  });
});
