import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';
import {
  pawnSlugPremiumEnemyFallbackWindow,
  reassertPawnSlugPremiumEnemyTexture,
} from './pawnSlugEnemyPremiumSprites.js';

function fakeTexture() {
  return {
    userData: {},
    repeat: { set: vi.fn() },
    offset: { set: vi.fn() },
    dispose: vi.fn(),
  };
}

describe('Pawn Slug premium enemy runtime integration', () => {
  it('promotes the canonical premium raster ahead of procedural soldier art', () => {
    expect(PAWN_SLUG_ENEMY_RUN_META.primaryVisualSource).toBe('premium-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.fallbackVisualSource).toBe('premium-static-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.proceduralRole).toBe('last-resort');
    expect(PAWN_SLUG_ENEMY_RUN_META.lateFallbackOverwriteProtection).toBe(true);
    expect(PAWN_SLUG_ENEMY_RUN_META.visualPriority).toEqual({
      canonical: 20,
      premiumFallback: 10,
      procedural: 0,
    });
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

  it('reasserts premium art after a late legacy texture overwrites the material', () => {
    const premium = fakeTexture();
    premium.userData.pawnSlugPremiumEnemyRetained = true;
    const lateLegacy = fakeTexture();
    const sprite = {
      userData: {
        action: 'run',
        actionFrame: 3,
        atlas: {
          disposed: false,
          enemyType: 'knight',
          direction: -1,
          source: 'primary-run',
          texture: lateLegacy,
          premiumWindowKey: null,
          premiumVisual: { texture: premium, source: 'premium-raster', priority: 20 },
        },
      },
      material: {
        map: lateLegacy,
        visible: true,
        needsUpdate: false,
      },
    };

    expect(reassertPawnSlugPremiumEnemyTexture(sprite)).toBe(true);
    expect(sprite.userData.atlas.source).toBe('premium-raster');
    expect(sprite.userData.atlas.texture).toBe(premium);
    expect(sprite.material.map).toBe(premium);
    expect(lateLegacy.dispose).toHaveBeenCalledTimes(1);
    expect(premium.repeat.set).toHaveBeenCalledTimes(1);
    expect(premium.offset.set).toHaveBeenCalledTimes(1);
    expect(reassertPawnSlugPremiumEnemyTexture(sprite)).toBe(false);
  });
});
