import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_LOGICAL_ID,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
  pawnSlugPremiumEnemyRasterWindow,
} from './pawnSlugPremiumEnemyRaster.js';

describe('Pawn Slug premium enemy raster', () => {
  it('uses the authored canonical run atlas from the reviewed R2 pointer', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_LOGICAL_ID).toBe('pawnSlug.enemy.premiumRaster');
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL).toBe('https://assets.chess-studio.shadowops.dpdns.org/pawn-slug/enemies/premium-raster/enemy_premium_raster_v5-7b62f19661e36c2c.webp');
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META).toMatchObject({
      version: 'v5-authored-canonical-run',
      width: 640,
      height: 240,
      frameWidth: 80,
      frameHeight: 80,
      columns: 8,
      rows: 3,
      framesPerType: 8,
      sourceFacing: 'left',
      canonicalSource: 'Pawn Slug: authored premium enemy lineup v5',
      derivedFrom: 'v4-authored-canonical-static',
      isolatedSilhouettes: true,
      transparentBackground: true,
      proceduralFallbackOnly: true,
      logicalId: 'pawnSlug.enemy.premiumRaster',
      transport: 'r2-cdn-with-inline-base64-fallback',
      transportReason: 'content-addressed-cdn-primary-with-bundled-migration-fallback',
    });
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META.authoredActions).toEqual(['idle', 'run']);
  });

  it('maps each class to its own authored row and keeps non-run actions on the neutral frame', () => {
    expect(pawnSlugPremiumEnemyRasterWindow('pawn', 'idle', 6, -1)).toMatchObject({ frame: 0, row: 0, sourceAction: 'idle' });
    expect(pawnSlugPremiumEnemyRasterWindow('knight', 'hurt', 6, -1)).toMatchObject({ frame: 0, row: 1, sourceAction: 'idle' });
    expect(pawnSlugPremiumEnemyRasterWindow('rook', 'death', 13, -1)).toMatchObject({ frame: 0, row: 2, sourceAction: 'idle' });
  });

  it('uses all eight authored locomotion frames and wraps the 16-frame motion track cleanly', () => {
    const frames = Array.from({ length: 16 }, (_, frame) => pawnSlugPremiumEnemyRasterWindow('knight', 'run', frame, -1).frame);
    expect(frames.slice(0, 8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(frames.slice(8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it('mirrors only at UV level for right-facing runtime actors', () => {
    const left = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 5, -1);
    const right = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 5, 1);
    expect(left).toMatchObject({ direction: -1, mirrored: false, frame: 5, row: 1 });
    expect(right).toMatchObject({ direction: 1, mirrored: true, frame: 5, row: 1 });
    expect(left.repeatX).toBeCloseTo(1 / 8, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 8, 12);
    expect(left.repeatY).toBeCloseTo(1 / 3, 12);
    expect(left.offsetY).toBeCloseTo(1 / 3, 12);
    expect(left.offsetY).toBeCloseTo(right.offsetY, 12);
  });
});
