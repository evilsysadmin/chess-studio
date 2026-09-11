import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ENTRY_DURATION,
  PAWN_SLUG_ENEMY_ENTRY_META,
  pawnSlugEnemyEntryPose,
} from './pawnSlugEnemyEntryMotion.js';

describe('Pawn Slug enemy entry choreography', () => {
  it('gives each normal soldier class a distinct brief entrance', () => {
    const pawn = pawnSlugEnemyEntryPose('pawn', 0);
    const knight = pawnSlugEnemyEntryPose('knight', 0);
    const rook = pawnSlugEnemyEntryPose('rook', 0);

    expect(pawn.active).toBe(true);
    expect(knight.active).toBe(true);
    expect(rook.active).toBe(true);
    expect(pawn.x).toBeGreaterThan(knight.x);
    expect(knight.y).toBeGreaterThan(pawn.y);
    expect(rook.sy).toBeLessThan(1);
    expect(PAWN_SLUG_ENEMY_ENTRY_META.touchesAi).toBe(false);
    expect(PAWN_SLUG_ENEMY_ENTRY_META.addsPopulation).toBe(false);
  });

  it('settles completely after the short entrance window', () => {
    const settled = pawnSlugEnemyEntryPose('knight', PAWN_SLUG_ENEMY_ENTRY_DURATION + 0.01);
    expect(settled).toEqual({ x: 0, y: 0, rz: 0, sx: 1, sy: 1, active: false });
  });

  it('becomes an identity pose for reduced motion or disabled states', () => {
    expect(pawnSlugEnemyEntryPose('pawn', 0.1, { reducedMotion: true }).active).toBe(false);
    expect(pawnSlugEnemyEntryPose('rook', 0.1, { enabled: false }).active).toBe(false);
  });
});
