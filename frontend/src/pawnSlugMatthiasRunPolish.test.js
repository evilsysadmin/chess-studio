import { describe, expect, it, vi } from 'vitest';
import {
  PAWN_SLUG_MATTHIAS_RUN_POLISH,
  applyPawnSlugMatthiasRunPolish,
  pawnSlugMatthiasRunCadence,
  pawnSlugMatthiasRunFrame,
  pawnSlugMatthiasRunUvWindow,
} from './pawnSlugMatthiasRunPolish.js';

describe('Pawn Slug Matthias run polish', () => {
  it('uses a fluid sixteen-frame cadence and never adds a fresh vertical bounce', () => {
    expect(pawnSlugMatthiasRunCadence(0)).toBeCloseTo(0, 8);
    expect(pawnSlugMatthiasRunCadence(4)).toBeCloseTo(1, 8);
    expect(pawnSlugMatthiasRunCadence(8)).toBeCloseTo(0, 8);
    expect(pawnSlugMatthiasRunCadence(12)).toBeCloseTo(1, 8);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.frameCount).toBe(16);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.frameRate).toBe(14);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.maxVerticalCompensation).toBe(0);
    expect(pawnSlugMatthiasRunFrame(1, 0)).toBe(14);
  });

  it('crops all four dirty edges of the authored run cell with extra lower-corner cleanup', () => {
    const uv = pawnSlugMatthiasRunUvWindow(4, 1);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.leftTrimTexels).toBeGreaterThanOrEqual(4);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.rightTrimTexels).toBeGreaterThanOrEqual(4);
    expect(PAWN_SLUG_MATTHIAS_RUN_POLISH.bottomTrimTexels).toBeGreaterThanOrEqual(10);
    expect(uv.repeatX).toBeCloseTo(88 / 1536, 12);
    expect(uv.repeatY).toBeCloseTo(84 / 480, 12);
    expect(uv.offsetX).toBeCloseTo((4 * 96 + 4) / 1536, 12);
    expect(uv.offsetY).toBeCloseTo(202 / 480, 12);

    const mirrored = pawnSlugMatthiasRunUvWindow(4, -1);
    expect(mirrored.repeatX).toBeCloseTo(-88 / 1536, 12);
    expect(mirrored.offsetX).toBeCloseTo((5 * 96 - 4) / 1536, 12);
  });

  it('honours the locomotion controller frame and keeps grounded running planted', () => {
    const repeatSet = vi.fn();
    const offsetSet = vi.fn();
    const setActionFrame = vi.fn((action, frame) => {
      sprite.userData.animation.action = action;
      sprite.userData.animation.frameIndex = frame;
    });
    const sprite = {
      userData: {
        animation: { action: 'run', frameIndex: 0, runStartedAt: 0 },
        atlas: {
          source: 'primary',
          texture: {
            repeat: { x: 0.1, set: repeatSet },
            offset: { x: 0.2, set: offsetSet },
          },
        },
        setActionFrame,
      },
      position: { y: 0 },
      scale: { x: 1, y: 1 },
      material: { rotation: 0 },
    };

    const result = applyPawnSlugMatthiasRunPolish(sprite, {
      running: true,
      dir: 1,
      time: 0.4,
      runFrame: 11,
    });
    const uv = pawnSlugMatthiasRunUvWindow(11, 1);

    expect(result.frameIndex).toBe(11);
    expect(setActionFrame).toHaveBeenCalledWith('run', 11);
    expect(sprite.position.y).toBe(0);
    expect(sprite.scale.x).toBeGreaterThan(1);
    expect(sprite.scale.y).toBeLessThan(1);
    expect(sprite.material.rotation).toBeLessThan(0);
    expect(repeatSet).toHaveBeenCalledWith(uv.repeatX, uv.repeatY);
    expect(offsetSet).toHaveBeenCalledWith(uv.offsetX, uv.offsetY);
  });

  it('falls back to time-derived frames when no locomotion frame is supplied', () => {
    const sprite = {
      userData: {
        animation: { action: 'run', frameIndex: 0, runStartedAt: 0 },
        setActionFrame(action, frame) {
          this.animation.action = action;
          this.animation.frameIndex = frame;
        },
      },
      position: { y: 0 },
      scale: { x: 1, y: 1 },
      material: { rotation: 0 },
    };
    const result = applyPawnSlugMatthiasRunPolish(sprite, { running: true, dir: 1, time: 0.4 });
    expect(result.frameIndex).toBe(5);
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
