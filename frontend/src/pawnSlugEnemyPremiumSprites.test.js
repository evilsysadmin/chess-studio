import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_ENEMY_RUN_META,
  PAWN_SLUG_SPRITE_META,
} from './pawnSlugSprites.js';
import {
  clonePawnSlugPremiumEnemyTexture,
  pawnSlugPremiumEnemyFallbackWindow,
  pawnSlugPremiumEnemyRenderStatus,
  reassertPawnSlugPremiumEnemyTexture,
} from './pawnSlugEnemyPremiumSprites.js';
import {
  PAWN_SLUG_ENEMY_READABILITY,
  applyPawnSlugEnemyReadability,
} from './pawnSlugEnemyReadabilityContract.js';

function fakeTexture() {
  return {
    userData: {},
    repeat: { set: vi.fn() },
    offset: { set: vi.fn() },
    dispose: vi.fn(),
  };
}

describe('Pawn Slug premium enemy runtime integration', () => {
  it('prefers authored premium art while retaining generated actions only as a visible safety net', () => {
    expect(PAWN_SLUG_ENEMY_RUN_META.primaryVisualSource).toBe('premium-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.fallbackVisualSource).toBe('premium-static-raster');
    expect(PAWN_SLUG_ENEMY_RUN_META.proceduralRole).toBe('known-good-safety-net');
    expect(PAWN_SLUG_ENEMY_RUN_META.visualEvidencePolicy).toBe('premium-alpha-readback-before-replacing-generated-actions');
    expect(PAWN_SLUG_ENEMY_RUN_META.browserPremiumContract).toBe('verified-authored-only');
    expect(PAWN_SLUG_ENEMY_RUN_META.browserFallbackAlias).toBeNull();
    expect(PAWN_SLUG_ENEMY_RUN_META.lateFallbackOverwriteProtection).toBe(true);
    expect(PAWN_SLUG_ENEMY_RUN_META.sourceDecodePolicy).toBe('shared-once-per-page-cloned-per-enemy');
    expect(PAWN_SLUG_ENEMY_RUN_META.sharedDecodedSourceCount).toBe(2);
    expect(PAWN_SLUG_ENEMY_RUN_META.visualPriority).toEqual({
      canonical: 20,
      premiumFallback: 10,
      procedural: 0,
    });
    expect(PAWN_SLUG_ENEMY_RUN_META.premiumRaster).toMatchObject({
      version: 'v5-authored-canonical-run',
      frameWidth: 80,
      frameHeight: 80,
      columns: 8,
      rows: 3,
      framesPerType: 8,
      sourceFacing: 'left',
      authoredActions: ['idle', 'run'],
      canonicalSource: 'Pawn Slug: authored premium enemy lineup v5',
      isolatedSilhouettes: true,
      transport: 'r2-cdn-primary',
      transportFallback: 'separate-premium-static-raster',
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

  it('never reports generated actions as authored premium art', () => {
    const sprite = {
      userData: {
        pawnSlugEnemyReadability: true,
        atlas: { source: 'generated-actions' },
      },
      material: { visible: true, map: {} },
      parent: {},
    };

    expect(pawnSlugPremiumEnemyRenderStatus(sprite)).toBe('generated-actions:visible:mapped:readable:attached');
  });

  it('keeps combat sprites readable over 2.5D scenery', () => {
    const sprite = {
      renderOrder: 0,
      userData: {},
      material: {
        map: {},
        visible: false,
        depthTest: true,
        depthWrite: true,
        needsUpdate: false,
      },
    };

    applyPawnSlugEnemyReadability(sprite);

    expect(PAWN_SLUG_ENEMY_READABILITY).toMatchObject({
      renderOrder: 30,
      depthTest: false,
      depthWrite: false,
    });
    expect(sprite.renderOrder).toBe(30);
    expect(sprite.material).toMatchObject({
      visible: true,
      depthTest: false,
      depthWrite: false,
      needsUpdate: true,
    });
    expect(sprite.userData.pawnSlugEnemyReadability).toBe(true);
    expect(PAWN_SLUG_SPRITE_META.enemies.readability).toBe(PAWN_SLUG_ENEMY_READABILITY);
  });

  it('clones per-enemy UV state while sharing the decoded premium image source', () => {
    const master = new THREE.Texture({ width: 640, height: 240 });
    master.repeat.set(1 / 8, 1 / 3);
    master.offset.set(1 / 8, 2 / 3);

    const first = clonePawnSlugPremiumEnemyTexture(master);
    const second = clonePawnSlugPremiumEnemyTexture(master);

    expect(first).not.toBe(master);
    expect(second).not.toBe(master);
    expect(first).not.toBe(second);
    expect(first.source).toBe(master.source);
    expect(second.source).toBe(master.source);
    expect(first.repeat).not.toBe(second.repeat);
    expect(first.offset).not.toBe(second.offset);

    first.repeat.set(-1 / 8, 1 / 3);
    first.offset.set(6 / 8, 1 / 3);
    expect(second.repeat.x).toBeCloseTo(1 / 8, 12);
    expect(second.offset.x).toBeCloseTo(1 / 8, 12);
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