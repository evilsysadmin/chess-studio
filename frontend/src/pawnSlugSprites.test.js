import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_SPRITE_META } from './pawnSlugSprites.js';

describe('Pawn Slug premium sprite contracts', () => {
  it('keeps approved player/enemy atlases isolated in lazy-owned assets', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.enemies.frames).toBe(3);
    expect(PAWN_SLUG_SPRITE_META.boss.frames).toBe(1);
    expect(PAWN_SLUG_SPRITE_META.weapons.frames).toBe(4);
    expect(PAWN_SLUG_SPRITE_META.matthias.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.enemies.frameWidth).toBe(192);
    expect(PAWN_SLUG_SPRITE_META.weapons.frameHeight).toBe(128);
  });

  it('locks source art to face right so visual aim matches projectile direction', () => {
    expect(PAWN_SLUG_SPRITE_META.matthias.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.enemies.sourceFacing).toBe('right');
    expect(PAWN_SLUG_SPRITE_META.matthias.framesByAction).toEqual({
      idle: 0,
      runA: 1,
      runB: 2,
      fire: 3,
    });
  });

  it('keeps pawn, knight and rook as distinct silhouettes', () => {
    expect(PAWN_SLUG_SPRITE_META.enemies.frameByType).toEqual({
      pawn: 0,
      knight: 1,
      rook: 2,
    });
  });

  it('uses local runtime assets instead of remote sprites', () => {
    for (const meta of Object.values(PAWN_SLUG_SPRITE_META)) {
      expect(meta.url).toBeTruthy();
      expect(String(meta.url)).not.toMatch(/^https?:\/\//);
    }
  });
});
