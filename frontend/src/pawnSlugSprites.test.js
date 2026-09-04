import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('keeps Matthias animated and enemies/boss/arsenal isolated in lazy-owned assets', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.enemies.frames).toBe(3);
    expect(PAWN_SLUG_SPRITE_META.boss.frames).toBe(1);
    expect(PAWN_SLUG_SPRITE_META.weapons.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameWidth).toBe(256);
    expect(PAWN_SLUG_SPRITE_META.weapons.frameHeight).toBe(128);
  });

  it('uses original local SVG atlases instead of remote runtime assets', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
    }
  });
});
