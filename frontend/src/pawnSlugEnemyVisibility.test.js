import { describe, expect, it } from 'vitest';
import { PAWN_SLUG_ENEMY_VISIBILITY, pawnSlugEnemyVisibleForFire } from './pawnSlugEnemyVisibility.js';

describe('Pawn Slug enemy fire visibility', () => {
  it('allows fire only inside the real horizontal camera frustum with a small inset', () => {
    const left = -14.75;
    const right = 14.75;
    const inset = (right - left) * PAWN_SLUG_ENEMY_VISIBILITY.fireInsetRatio;
    expect(pawnSlugEnemyVisibleForFire(-14.75 + inset - 0.01, 0, left, right)).toBe(false);
    expect(pawnSlugEnemyVisibleForFire(-14.75 + inset + 0.01, 0, left, right)).toBe(true);
    expect(pawnSlugEnemyVisibleForFire(14.75 - inset - 0.01, 0, left, right)).toBe(true);
    expect(pawnSlugEnemyVisibleForFire(14.75 - inset + 0.01, 0, left, right)).toBe(false);
  });

  it('tracks widened landscape frustums instead of assuming VIEW_W', () => {
    expect(pawnSlugEnemyVisibleForFire(17, 20, -18, 18)).toBe(true);
    expect(pawnSlugEnemyVisibleForFire(1.5, 20, -18, 18)).toBe(false);
  });

  it('rejects malformed or inverted camera bounds', () => {
    expect(pawnSlugEnemyVisibleForFire(0, 0, 10, -10)).toBe(false);
    expect(pawnSlugEnemyVisibleForFire(Number.NaN, 0, -10, 10)).toBe(false);
  });
});
