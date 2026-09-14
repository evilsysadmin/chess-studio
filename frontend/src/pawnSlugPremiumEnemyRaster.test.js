import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
  pawnSlugPremiumEnemyRasterWindow,
} from './pawnSlugPremiumEnemyRaster.js';

describe('Pawn Slug premium enemy raster', () => {
  it('uses the authored canonical enemy lineup as the primary art source', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL).toMatch(/^data:image\/webp;base64,/);
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META).toMatchObject({
      version: 'v4-authored-canonical-static',
      width: 480,
      height: 160,
      frameWidth: 160,
      frameHeight: 160,
      columns: 3,
      rows: 1,
      sourceFacing: 'left',
      canonicalSource: 'Pawn Slug: authored premium enemy lineup v4',
      isolatedSilhouettes: true,
      transparentBackground: true,
      proceduralFallbackOnly: true,
    });
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META.authoredActions).toEqual(['idle']);
  });

  it('maps pawn, knight and rook to distinct authored canonical silhouettes', () => {
    expect(pawnSlugPremiumEnemyRasterWindow('pawn', 'idle', 0, -1)).toMatchObject({ frame: 0, row: 0 });
    expect(pawnSlugPremiumEnemyRasterWindow('knight', 'run', 7, -1)).toMatchObject({ frame: 1, row: 0, sourceAction: 'idle', requestedFrame: 7 });
    expect(pawnSlugPremiumEnemyRasterWindow('rook', 'hurt', 13, -1)).toMatchObject({ frame: 2, row: 0, sourceAction: 'idle', requestedFrame: 13 });
  });

  it('mirrors only at UV level for right-facing runtime actors', () => {
    const left = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 7, -1);
    const right = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 7, 1);
    expect(left).toMatchObject({ direction: -1, mirrored: false, frame: 1, requestedFrame: 7 });
    expect(right).toMatchObject({ direction: 1, mirrored: true, frame: 1, requestedFrame: 7 });
    expect(left.repeatX).toBeCloseTo(1 / 3, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 3, 12);
    expect(left.offsetY).toBeCloseTo(right.offsetY, 12);
  });

  it('keeps every runtime action on the authored silhouette instead of changing visual style', () => {
    for (const action of ['idle', 'run', 'hurt', 'jump', 'crouch', 'climb', 'death']) {
      const frame = pawnSlugPremiumEnemyRasterWindow('rook', action, 13, -1);
      expect(frame.sourceAction).toBe('idle');
      expect(frame.row).toBe(0);
      expect(frame.frame).toBe(2);
      expect(frame.requestedFrame).toBe(13);
    }
  });
});
