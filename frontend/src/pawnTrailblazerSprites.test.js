import { describe, expect, it } from 'vitest';
import { TRAIL_SPRITES } from './pawnTrailblazerSprites.js';

describe('Pawn Trailblazer sprite assets', () => {
  it('mantiene la hoja aprobada completa de Matthias, enemigos y powerups', () => {
    expect(Object.keys(TRAIL_SPRITES).sort()).toEqual([
      'enemyBishop',
      'enemyDuelist',
      'enemyKnight',
      'enemyPawn',
      'enemyRook',
      'matthiasCapture',
      'matthiasRun',
      'powerBishop',
      'powerQueen',
      'powerRook',
    ]);
    for (const value of Object.values(TRAIL_SPRITES)) {
      expect(typeof value).toBe('string');
      expect(value.length).toBeGreaterThan(5);
    }
  });
});
