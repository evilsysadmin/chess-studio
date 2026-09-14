import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT,
  PAWN_SLUG_PREMIUM_ENEMY_TYPES,
  pawnSlugEnemyActionNeedsAuthoredFacing,
  pawnSlugEnemyFacingStrategy,
  pawnSlugEnemyFacingWindow,
} from './pawnSlugEnemyPremiumArtContract.js';

describe('Pawn Slug premium enemy art contract', () => {
  it('keeps the premium pass bounded to the existing three regular enemy classes', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_TYPES).toEqual(['pawn', 'knight', 'rook']);
  });

  it('mirrors locomotion and terminal poses from the canonical left-facing source', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT.sourceFacing).toBe('left');
    for (const action of ['idle', 'run', 'jump', 'crouch', 'hurt', 'climb', 'death']) {
      expect(pawnSlugEnemyFacingStrategy(action)).toBe('mirror');
      expect(pawnSlugEnemyFacingWindow(action, -1)).toMatchObject({ facing: 'left', mirrored: false, authored: false });
      expect(pawnSlugEnemyFacingWindow(action, 1)).toMatchObject({ facing: 'right', mirrored: true, authored: false });
    }
  });

  it('requires authored left and right attack art instead of flipping asymmetric equipment', () => {
    expect(PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT.authoredFacingsByAction.attack).toEqual(['left', 'right']);
    expect(PAWN_SLUG_PREMIUM_ENEMY_FACING_CONTRACT.asymmetricDetails).toEqual([
      'weapon-hand',
      'shield-side',
      'cape-flow',
      'rim-light',
    ]);
    expect(pawnSlugEnemyActionNeedsAuthoredFacing('attack')).toBe(true);
    expect(pawnSlugEnemyFacingWindow('attack', -1)).toMatchObject({ facing: 'left', mirrored: false, authored: true });
    expect(pawnSlugEnemyFacingWindow('attack', 1)).toMatchObject({ facing: 'right', mirrored: false, authored: true });
  });
});
