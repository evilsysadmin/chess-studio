import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug integrated weapon metadata', () => {
  it('declares the Blender atlas as authoritative and removes the overlay', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.integratedWeaponArt.version).toBe('blender-premium-v2');
    expect(PAWN_SLUG_SPRITE_META.matthias.separateWeaponOverlay).toBe(false);
    expect(PAWN_SLUG_SPRITE_META.matthias.weaponGripAnchor).toBe('baked-into-matthias-atlas');
  });
});
