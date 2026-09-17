import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MATTHIAS_2D_RUNTIME,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';

describe('Pawn Slug canonical 2D weapon metadata', () => {
  it('keeps one R2-backed Matthias body while weapons remain separate attachments', () => {
    expect(PAWN_SLUG_MATTHIAS_2D_RUNTIME.bodyAsset).toBe('pawnSlug.matthias.motion');
    expect(PAWN_SLUG_MATTHIAS_2D_RUNTIME.bodyAuthority).toBe('single-canonical-matthias');
    expect(PAWN_SLUG_MATTHIAS_2D_RUNTIME.weaponMode).toBe('separate-attachment');
    expect(PAWN_SLUG_SPRITE_META.matthias.canonical2dRuntime).toBe(PAWN_SLUG_MATTHIAS_2D_RUNTIME);
    expect(PAWN_SLUG_SPRITE_META.matthias.separateWeaponOverlay).toBe(true);
    expect(PAWN_SLUG_SPRITE_META.matthias.weaponGripAnchor).toBe('centered-sprite');
    expect(PAWN_SLUG_SPRITE_META.matthias.integratedWeaponArt).toBeUndefined();
  });
});
