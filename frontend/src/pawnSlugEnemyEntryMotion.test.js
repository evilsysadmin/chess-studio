import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_ENTRY_DURATION,
  PAWN_SLUG_ENEMY_ENTRY_META,
  PAWN_SLUG_ENEMY_ENTRY_STAGGER,
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

  it('stages mixed groups by class without adding runtime timers', () => {
    const pawnStart = pawnSlugEnemyEntryPose('pawn', 0);
    const pawnEarly = pawnSlugEnemyEntryPose('pawn', 0.04);
    const knightStart = pawnSlugEnemyEntryPose('knight', 0);
    const knightEarly = pawnSlugEnemyEntryPose('knight', 0.04);
    const rookStart = pawnSlugEnemyEntryPose('rook', 0);
    const rookEarly = pawnSlugEnemyEntryPose('rook', 0.08);

    expect(pawnEarly.x).toBeLessThan(pawnStart.x);
    expect(knightEarly.y).toBe(knightStart.y);
    expect(rookEarly.sy).toBe(rookStart.sy);
    expect(PAWN_SLUG_ENEMY_ENTRY_STAGGER.pawn).toBe(0);
    expect(PAWN_SLUG_ENEMY_ENTRY_STAGGER.knight).toBeLessThan(PAWN_SLUG_ENEMY_ENTRY_STAGGER.rook);
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