import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_RUNTIME_HOT_PATH,
  pawnSlugFirstHitEnemyIndex,
  pawnSlugRectsOverlap,
} from './pawnSlugRuntimeHotPath.js';

describe('Pawn Slug runtime hot path', () => {
  it('preserves the strict rectangle-overlap contract without temporary boxes', () => {
    expect(PAWN_SLUG_RUNTIME_HOT_PATH).toBe('scalar-collision-index-loops-v1');
    expect(pawnSlugRectsOverlap(0, 0, 1, 1, 0.5, 0.5, 1, 1)).toBe(true);
    expect(pawnSlugRectsOverlap(0, 0, 1, 1, 1, 0, 1, 1)).toBe(false);
    expect(pawnSlugRectsOverlap(0, 0, 1, 1, -1, 0, 1, 1)).toBe(false);
  });

  it('returns the first live enemy hit in original array order', () => {
    const enemies = [
      { id: 'dead-first', x: 0, y: 0, w: 1, h: 1, dead: true },
      { id: 'first-live', x: 0.35, y: 0, w: 1, h: 1, dead: false },
      { id: 'second-live', x: 0.5, y: 0, w: 1, h: 1, dead: false },
    ];
    const snapshot = enemies.slice();

    expect(pawnSlugFirstHitEnemyIndex(enemies, 0, 0, 0.8, 0.4)).toBe(1);
    expect(enemies).toEqual(snapshot);
  });

  it('returns -1 when the projectile only touches an edge or misses', () => {
    const enemies = [{ x: 1, y: 0, w: 1, h: 1, dead: false }];
    expect(pawnSlugFirstHitEnemyIndex(enemies, 0, 0, 0.5, 0.5)).toBe(-1);
    expect(pawnSlugFirstHitEnemyIndex(enemies, 0.5, 0, 0.5, 0.5)).toBe(-1);
  });
});
