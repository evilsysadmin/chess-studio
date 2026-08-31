import { describe, expect, it } from 'vitest';
import {
  TRAIL_ATLAS_CELLS,
  TRAIL_ATLAS_GRID,
  TRAIL_ATLAS_IMAGE,
  TRAIL_SPRITES,
  trailSprite,
  trailSpriteStyle,
} from './pawnTrailblazerSprites.js';

describe('3D Pawn Chess professional art atlas', () => {
  it('mantiene Matthias, enemigos, powerups y obstáculos dentro de una sola textura', () => {
    expect(TRAIL_ATLAS_GRID).toBe(4);
    expect(typeof TRAIL_ATLAS_IMAGE).toBe('string');
    expect(TRAIL_ATLAS_IMAGE.length).toBeGreaterThan(5);

    expect(Object.keys(TRAIL_SPRITES).sort()).toEqual([
      'enemyBishop',
      'enemyDuelist',
      'enemyKnight',
      'enemyPawn',
      'enemyRook',
      'matthiasCapture',
      'matthiasHit',
      'matthiasRun',
      'matthiasVictory',
      'obstacleBarrel',
      'obstacleRock',
      'obstacleSpikes',
      'obstacleWall',
      'powerBishop',
      'powerQueen',
      'powerRook',
    ]);

    for (const [name, value] of Object.entries(TRAIL_SPRITES)) {
      expect(value).toBe(name);
      expect(TRAIL_ATLAS_CELLS[name]).toMatchObject({
        col: expect.any(Number),
        row: expect.any(Number),
      });
      expect(TRAIL_ATLAS_CELLS[name].col).toBeGreaterThanOrEqual(0);
      expect(TRAIL_ATLAS_CELLS[name].col).toBeLessThan(TRAIL_ATLAS_GRID);
      expect(TRAIL_ATLAS_CELLS[name].row).toBeGreaterThanOrEqual(0);
      expect(TRAIL_ATLAS_CELLS[name].row).toBeLessThan(TRAIL_ATLAS_GRID);
      expect(trailSprite(name)).toBe(name);
    }
    expect(trailSprite('no-existe')).toBeNull();
  });

  it('expone crops CSS del mismo atlas para overlays React sin duplicar arte', () => {
    const run = trailSpriteStyle('matthiasRun');
    const capture = trailSpriteStyle('matthiasCapture');
    expect(run.backgroundImage).toContain('url(');
    expect(run.backgroundSize).toBe('400% 400%');
    expect(run.backgroundPosition).not.toBe(capture.backgroundPosition);
    expect(run.width).toBe('128px');
    expect(trailSpriteStyle('no-existe')).toBeNull();
  });
});
