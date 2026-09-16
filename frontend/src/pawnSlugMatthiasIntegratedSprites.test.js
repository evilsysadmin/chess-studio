import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MATTHIAS_INTEGRATED_ART,
  pawnSlugIntegratedWeaponAtlasUrl,
  pawnSlugIntegratedWeaponId,
} from './pawnSlugMatthiasIntegratedSprites.js';

describe('Pawn Slug integrated Matthias weapon art', () => {
  it('covers every live player weapon with one Blender-authored atlas', () => {
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.weapons).toEqual([
      'pistol',
      'machinegun',
      'shotgun',
      'panzerfaust',
    ]);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.version).toBe('blender-premium-v3');
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.frameWidth).toBe(192);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.frameHeight).toBe(192);
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.separateWeaponOverlay).toBe(false);
  });

  it('falls back safely to pistol and emits bundled WebP data URLs', () => {
    expect(pawnSlugIntegratedWeaponId('banana')).toBe('pistol');
    expect(pawnSlugIntegratedWeaponAtlasUrl('shotgun')).toMatch(/^data:image\/webp;base64,/);
    expect(pawnSlugIntegratedWeaponAtlasUrl('shotgun').length).toBeGreaterThan(1000);
  });
});
