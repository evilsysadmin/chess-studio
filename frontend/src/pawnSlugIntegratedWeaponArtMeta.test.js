import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug integrated weapon metadata', () => {
  it('keeps canonical Matthias authoritative and uses a weapon-only runtime overlay', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.integratedWeaponArt.version).toBe('blender-premium-v3');
    expect(PAWN_SLUG_SPRITE_META.matthias.separateWeaponOverlay).toBe(true);
    expect(PAWN_SLUG_SPRITE_META.matthias.weaponGripAnchor).toBe('canonical-body-plus-runtime-weapon-overlay');
  });
});