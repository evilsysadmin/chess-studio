import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_SOLDIER_ATLAS_META,
  pawnSlugSoldierAtlasWindow,
} from './pawnSlugSoldierAtlas.js';

describe('Pawn Slug generated soldier atlas', () => {
  it('allocates a dense multi-action atlas contract but draws frames lazily', () => {
    expect(PAWN_SLUG_SOLDIER_ATLAS_META).toMatchObject({
      frameWidth: 96,
      frameHeight: 96,
      columns: 16,
      rows: 21,
      theme: 'military-chess-soldiers',
      generatedOnce: true,
      lazyFrameDrawing: true,
    });
    expect(PAWN_SLUG_SOLDIER_ATLAS_META.types).toEqual(['pawn', 'knight', 'rook']);
    expect(PAWN_SLUG_SOLDIER_ATLAS_META.actions).toEqual(['idle', 'run', 'jump', 'crouch', 'hurt', 'climb', 'death']);
  });

  it('maps each class and action into its own row including terminal death', () => {
    expect(pawnSlugSoldierAtlasWindow('pawn', 'idle', 0, -1).row).toBe(0);
    expect(pawnSlugSoldierAtlasWindow('pawn', 'death', 0, -1).row).toBe(6);
    expect(pawnSlugSoldierAtlasWindow('knight', 'idle', 0, -1).row).toBe(7);
    expect(pawnSlugSoldierAtlasWindow('knight', 'death', 0, -1).row).toBe(13);
    expect(pawnSlugSoldierAtlasWindow('rook', 'climb', 0, -1).row).toBe(19);
    expect(pawnSlugSoldierAtlasWindow('rook', 'death', 13, -1).row).toBe(20);
  });

  it('wraps long action tracks and mirrors only the horizontal UV axis', () => {
    const left = pawnSlugSoldierAtlasWindow('knight', 'run', 15, -1);
    const right = pawnSlugSoldierAtlasWindow('knight', 'run', 15, 1);
    expect(left.frame).toBe(15);
    expect(right.frame).toBe(15);
    expect(left.repeatX).toBeCloseTo(1 / 16, 12);
    expect(right.repeatX).toBeCloseTo(-1 / 16, 12);
    expect(left.repeatY).toBeCloseTo(1 / 21, 12);
    expect(left.offsetY).toBe(right.offsetY);
    expect(pawnSlugSoldierAtlasWindow('pawn', 'jump', 10, -1).frame).toBe(0);
  });
});
