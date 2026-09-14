import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_MATTHIAS_RUN_POLISH,
  applyPawnSlugMatthiasRunPolish,
  pawnSlugMatthiasRunCadence,
  pawnSlugMatthiasRunUvWindow,
} from './pawnSlugMatthiasRunPolish.js';

describe('Pawn Slug Matthias run polish', () => {
  it('uses a restrained two-step cadence instead of adding a fresh vertical bounce', () => {
    expect(pawnSlugMatthiasRunCadence(0)).toBeCloseTo(0, 8);
    expect(pawnSlugMatthiasRunCadence(4)).toBeCloseTo(1, 8);
    expect(pawnSlugMatthiasRunCadence(8)).toBeCloseTo(0, 8);
    expect(pawnSlugMatthiasRunCadence(12)).toBeCloseTo(1, 8);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.maxVerticalCompensation).toBeLessThan(0.02);
  });

  it('crops the dirty lower edge of the authored run row without touching other atlas rows', () => {
    const uv = pawnSlugMatthiasRunUvWindow();
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.bottomTrimTexels).toBe(4);
    expect(uv.repeatY).toBeCloseTo(91 / 480, 12);
    expect(uv.offsetY).toBeCloseTo(196 / 480, 12);
  });

  it('makes grounded running read more forward and applies the clean run UV window', () => {
    const repeatSet = vi.fn();
    const offsetSet = vi.fn();
    const sprite = {
      userData: {
        animation: { action: 'run', frameIndex: 4 },
        atlas: {
          source: 'primary',
          texture: {
            repeat: { x: 0.1, set: repeatSet },
            offset: { x: 0.2, set: offsetSet },
          },
        },
      },
      position: { y: 0 },
      scale: { x: 1, y: 1 },
      material: { rotation: 0 },
    };

    const result = applyPawnSlugMatthiasRunPolish(sprite, { running: true, dir: 1 });
    const uv = pawnSlugMatthiasRunUvWindow();

    expect(result.cadence).toBeCloseTo(1, 8);
    expect(sprite.position.y).toBeLessThan(0);
    expect(sprite.scale.x).toBeGreaterThan(1);
    expect(sprite.scale.y).toBeLessThan(1);
    expect(sprite.material.rotation).toBeLessThan(0);
    expect(repeatSet).toHaveBeenCalledWith(0.1, uv.repeatY);
    expect(offsetSet).toHaveBeenCalledWith(0.2, uv.offsetY);
  });

  it('does nothing for idle, airborne or crouched poses', () => {
    const base = () => ({
      userData: { animation: { action: 'idle', frameIndex: 0 } },
      position: { y: 0 },
      scale: { x: 1, y: 1 },
      material: { rotation: 0 },
    });
    expect(applyPawnSlugMatthiasRunPolish(base(), { running: false })).toBeNull();
    expect(applyPawnSlugMatthiasRunPolish(base(), { running: true, airborne: true })).toBeNull();
    expect(applyPawnSlugMatthiasRunPolish(base(), { running: true, crouch: true })).toBeNull();
  });
});
