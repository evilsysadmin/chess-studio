import { describe, expect, it } from 'vitest';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';

describe('Pawn Trailblazer sprite assets', () => {
  it('mantiene los sprites aprobados de Matthias y enemigos como WebP embebido', () => {
    expect(Object.keys(TRAIL_SPRITES).sort()).toEqual([
      'enemyKnight',
      'enemyPawn',
      'enemyRook',
      'matthiasCapture',
      'matthiasRun',
    ]);
    for (const value of Object.values(TRAIL_SPRITES)) {
      expect(value.startsWith('data:image/webp;base64,UklGR')).toBe(true);
      expect(value.length).toBeGreaterThan(1_000);
    }
  });
});
