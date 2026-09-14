import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';


describe('Pawn Slug premium enemy runtime integration', () => {
  it('promotes the canonical premium raster ahead of procedural soldier art', () => {
    expect(PAWN_SLUG_ENEMY_RUN_META.primaryVisualSource).toBe('premium-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.proceduralRole).toBe('fallback-only');
    expect(PAWN_SLUG_ENEMY_RUN_META.premiumRaster).toMatchObject({
      version: 'v3-canonical-raster',
      frameWidth: 80,
      frameHeight: 80,
      sourceFacing: 'left',
      authoredActions: ['idle', 'run'],
      canonicalSource: 'Pawn Slug: Enemy Sprite Sheet',
      isolatedSilhouettes: true,
    });
    expect(PAWN_SLUG_SPRITE_META.enemies.runAtlas.primaryVisualSource).toBe('premium-raster');
  });
});
