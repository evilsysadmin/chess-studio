import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';


describe('Pawn Slug premium enemy runtime integration', () => {
  it('promotes the approved raster ahead of procedural soldier art', () => {
    expect(PAWN_SLUG_ENEMY_RUN_META.primaryVisualSource).toBe('premium-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.proceduralRole).toBe('fallback-only');
    expect(PAWN_SLUG_ENEMY_RUN_META.premiumRaster).toMatchObject({
      version: 'v2-approved-raster',
      sourceFacing: 'left',
      authoredActions: ['idle', 'run'],
    });
    expect(PAWN_SLUG_SPRITE_META.enemies.runAtlas.primaryVisualSource).toBe('premium-raster');
  });
});
