import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_META,
  PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL,
  pawnSlugPremiumEnemyRasterWindow,
} from './pawnSlugPremiumEnemyRaster.js';

describe('Pawn Slug premium enemy raster', () => {
  it('uses the approved compact six-row raster as the primary art source', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_URL).toMatch(/^data:image\/png;base64,/);
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META).toMatchObject({
      version: 'v2-approved-raster',
      width: 640,
      height: 240,
      frameWidth: 40,
      frameHeight: 40,
      columns: 16,
      rows: 6,
      sourceFacing: 'left',
      proceduralFallbackOnly: true,
    });
    expect(PAWN_SLUG_PREMIUM_ENEMY_RASTER_META.authoredActions).toEqual(['idle', 'run']);
  });

  it('maps pawn, knight and rook idle/run to distinct authored rows', () => {
    expect(pawnSlugPremiumEnemyRasterWindow('pawn', 'idle', 0, -1).row).toBe(0);
    expect(pawnSlugPremiumEnemyRasterWindow('pawn', 'run', 0, -1).row).toBe(1);
    expect(pawnSlugPremiumEnemyRasterWindow('knight', 'idle', 0, -1).row).toBe(2);
    expect(pawnSlugPremiumEnemyRasterWindow('knight', 'run', 0, -1).row).toBe(3);
    expect(pawnSlugPremiumEnemyRasterWindow('rook', 'idle', 0, -1).row).toBe(4);
    expect(pawnSlugPremiumEnemyRasterWindow('rook', 'run', 0, -1).row).toBe(5);
  });

  it('mirrors only at UV level for right-facing runtime actors', () => {
    const left = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 7, -1);
    const right = pawnSlugPremiumEnemyRasterWindow('knight', 'run', 7, 1);
    expect(left).toMatchObject({ direction: -1, mirrored: false, frame: 7 });
    expect(right).toMatchObject({ direction: 1, mirrored: true, frame: 7 });
    expect(left.repeatX).toBeCloseTo(1 / 16, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 16, 12);
    expect(left.offsetY).toBeCloseTo(right.offsetY, 12);
  });

  it('keeps non-authored action poses on the premium idle row instead of changing visual style', () => {
    for (const action of ['hurt', 'jump', 'crouch', 'climb', 'death']) {
      const frame = pawnSlugPremiumEnemyRasterWindow('rook', action, 13, -1);
      expect(frame.sourceAction).toBe('idle');
      expect(frame.row).toBe(4);
      expect(frame.frame).toBe(13);
    }
  });
});
