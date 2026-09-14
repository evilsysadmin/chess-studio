import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';
import { pawnSlugPremiumEnemyFallbackWindow } from './pawnSlugEnemyPremiumSprites.js';


describe('Pawn Slug premium enemy runtime integration', () => {
  it('promotes the canonical premium raster ahead of procedural soldier art', () => {
    expect(PAWN_SLUG_ENEMY_RUN_META.primaryVisualSource).toBe('premium-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.fallbackVisualSource).toBe('premium-static-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.proceduralRole).toBe('last-resort');
    expect(PAWN_SLUG_ENEMY_RUN_META.premiumRaster).toMatchObject({
      version: 'v3-canonical-raster',
      frameWidth: 80,
      frameHeight: 80,
      sourceFacing: 'left',
      authoredActions: ['idle', 'run'],
      canonicalSource: 'Pawn Slug: Enemy Sprite Sheet',
      isolatedSilhouettes: true,
    });
    expect(PAWN_SLUG_ENEMY_RUN_META.premiumFallback).toMatchObject({
      asset: 'enemy_atlas_premium.webp',
      width: 384,
      height: 128,
      columns: 3,
      frameWidth: 128,
      frameHeight: 128,
    });
    expect(PAWN_SLUG_SPRITE_META.enemies.runAtlas.primaryVisualSource).toBe('premium-raster');
  });

  it('keeps the static premium fallback correctly framed and mirrored', () => {
    const pawn = pawnSlugPremiumEnemyFallbackWindow('pawn', -1);
    const knight = pawnSlugPremiumEnemyFallbackWindow('knight', -1);
    const rook = pawnSlugPremiumEnemyFallbackWindow('rook', -1);
    const rookFacingRight = pawnSlugPremiumEnemyFallbackWindow('rook', 1);

    expect(pawn).toMatchObject({ frame: 0, repeatX: 1 / 3, offsetX: 0 });
    expect(knight).toMatchObject({ frame: 1, repeatX: 1 / 3, offsetX: 1 / 3 });
    expect(rook).toMatchObject({ frame: 2, repeatX: 1 / 3, offsetX: 2 / 3 });
    expect(rookFacingRight).toMatchObject({ frame: 2, repeatX: -1 / 3, offsetX: 1 });
  });
});
