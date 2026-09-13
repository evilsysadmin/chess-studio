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

  it('keeps the infantry impact white-hot before settling into the existing hurt tint', () => {
    const impact = pawnSlugEnemyHitFlash(0, { hurt: true, type: 'pawn' });
    const halfway = pawnSlugEnemyHitFlash(PAWN_SLUG_ENEMY_HIT_FLASH_META.hotSeconds / 2, { hurt: true, type: 'pawn' });
    const settled = pawnSlugEnemyHitFlash(PAWN_SLUG_ENEMY_HIT_FLASH_META.hotSeconds, { hurt: true, type: 'pawn' });

    expect(impact.active).toBe(true);
    expect(impact.hot).toBe(1);
    expect(impact).toMatchObject({ r: 1.18, g: 1.12, b: 1.08, opacity: 1 });
    expect(halfway.hot).toBeCloseTo(0.5, 5);
    expect(halfway.g).toBeGreaterThan(settled.g);
    expect(halfway.opacity).toBeGreaterThan(settled.opacity);
    expect(settled).toMatchObject({
      active: true,
      hot: 0,
      ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
    });
  });

  it('gives armored enemies a progressively colder metallic impact flash', () => {
    const pawn = pawnSlugEnemyHitFlash(0, { hurt: true, type: 'pawn' });
    const knight = pawnSlugEnemyHitFlash(0, { hurt: true, type: 'knight' });
    const rook = pawnSlugEnemyHitFlash(0, { hurt: true, type: 'rook' });

    expect(knight.b).toBeGreaterThan(pawn.b);
    expect(rook.b).toBeGreaterThan(knight.b);
    expect(knight.r).toBeLessThan(pawn.r);
    expect(rook.r).toBeLessThan(knight.r);
    expect(rook.opacity).toBe(1);
    expect(pawnSlugEnemyHitFlash(0, { hurt: true, type: 'unknown' })).toEqual(pawn);
  });

  it('preserves the old red hurt tint for sustained damage instead of flickering', () => {
    for (const type of ['pawn', 'knight', 'rook']) {
      expect(pawnSlugEnemyHitFlash(0.5, { hurt: true, type })).toMatchObject({
        active: true,
        hot: 0,
        ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
      });
      expect(pawnSlugEnemyHitFlash(Number.POSITIVE_INFINITY, { hurt: true, type })).toMatchObject({
        active: true,
        hot: 0,
        ...PAWN_SLUG_ENEMY_HIT_FLASH_META.sustained,
      });
    }
  });
});
