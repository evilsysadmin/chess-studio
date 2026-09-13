import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_ENEMY_HIT_FLASH_META,
  pawnSlugEnemyHitFlash,
} from './pawnSlugEnemyHitFlash.js';

describe('Pawn Slug enemy hit flash', () => {
  it('keeps healthy soldiers visually neutral', () => {
    expect(pawnSlugEnemyHitFlash(0, { hurt: false })).toEqual({
      active: false,
      hot: 0,
      r: 1,
      g: 1,
      b: 1,
      opacity: 1,
    });
  });

  it('starts with a short white-hot impact before settling into the existing hurt tint', () => {
    const impact = pawnSlugEnemyHitFlash(0, { hurt: true });
    const halfway = pawnSlugEnemyHitFlash(PAWN_SLUG_ENEMY_HIT_FLASH_META.hotSeconds / 2, { hurt: true });
    const settled = pawnSlugEnemyHitFlash(PAWN_SLUG_ENEMY_HIT_FLASH_META.hotSeconds, { hurt: true });

    expect(impact.active).toBe(true);
    expect(impact.hot).toBe(1);
    expect(impact.r).toBeGreaterThan(1);
    expect(impact.g).toBeGreaterThan(1);
    expect(impact.b).toBeGreaterThan(1);
    expect(impact.opacity).toBe(1);
    expect(halfway.hot).toBeCloseTo(0.5, 5);
    expect(halfway.g).toBeGreaterThan(settled.g);
    expect(halfway.opacity).toBeGreaterThan(settled.opacity);
    expect(settled).toMatchObject({
      active: true,
      hot: 0,
      ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
    });
  });

  it('preserves the old red hurt tint for sustained damage instead of flickering', () => {
    expect(pawnSlugEnemyHitFlash(0.5, { hurt: true })).toMatchObject({
      active: true,
      hot: 0,
      ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
    });
    expect(pawnSlugEnemyHitFlash(Number.POSITIVE_INFINITY, { hurt: true })).toMatchObject({
      active: true,
      hot: 0,
      ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
    });
  });
});
