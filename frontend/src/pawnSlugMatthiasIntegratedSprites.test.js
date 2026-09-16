import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MATTHIAS_INTEGRATED_ART,
  PAWN_SLUG_MATTHIAS_R2_ASSETS,
  pawnSlugCanonicalHeadAtlasUrl,
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

  it('pins stable R2 logical ids without coupling runtime code to content hashes', () => {
    expect(PAWN_SLUG_MATTHIAS_R2_ASSETS).toEqual({
      canonicalMaster: 'pawnSlug.matthias.canonicalMaster',
      pistol: 'pawnSlug.matthias.pistol',
      machinegun: 'pawnSlug.matthias.machinegun',
      shotgun: 'pawnSlug.matthias.shotgun',
      panzerfaust: 'pawnSlug.matthias.panzerfaust',
      motion: 'pawnSlug.matthias.motion',
    });
    expect(PAWN_SLUG_MATTHIAS_INTEGRATED_ART.r2Assets).toBe(PAWN_SLUG_MATTHIAS_R2_ASSETS);
  });

  it('resolves the published Matthias atlases from the public R2 CDN', () => {
    expect(pawnSlugIntegratedWeaponId('banana')).toBe('pistol');
    expect(pawnSlugIntegratedWeaponAtlasUrl('pistol')).toMatch(
      /^https:\/\/assets\.chess-studio\.shadowops\.dpdns\.org\/pawn-slug\/matthias\/pistol\//,
    );
    expect(pawnSlugIntegratedWeaponAtlasUrl('shotgun')).toMatch(
      /^https:\/\/assets\.chess-studio\.shadowops\.dpdns\.org\/pawn-slug\/matthias\/shotgun\//,
    );
    expect(pawnSlugCanonicalHeadAtlasUrl()).toMatch(
      /^https:\/\/assets\.chess-studio\.shadowops\.dpdns\.org\/pawn-slug\/matthias\/motion\//,
    );
  });
});
