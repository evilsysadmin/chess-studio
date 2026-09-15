import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MOTION_POLISH,
  pawnSlugMatthiasLocomotion,
} from './pawnSlugMotionPolish.js';

describe('Pawn Slug locomotion polish', () => {
  it('keeps normal arcade movement on Matthias authored walk cycle instead of turning it into a sprint', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 10.04, moving: true, speedRatio: 0.2, moveStartedAt: 10 }))
      .toMatchObject({ action: 'walk', phase: 'walk' });
    expect(pawnSlugMatthiasLocomotion({ time: 10.6, moving: true, speedRatio: 0.6, moveStartedAt: 10 }))
      .toMatchObject({ action: 'walk', phase: 'walk' });
    expect(pawnSlugMatthiasLocomotion({ time: 14, moving: true, speedRatio: 1, moveStartedAt: 10 }))
      .toMatchObject({ action: 'walk', phase: 'walk' });
  });

  it('starts a fresh walk cycle from frame zero regardless of mission time', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 10, moving: true, speedRatio: 0.2, moveStartedAt: 10 })).toMatchObject({ frame: 0, phase: 'walk' });
    expect(pawnSlugMatthiasLocomotion({ time: 47.25, moving: true, speedRatio: 0.2, moveStartedAt: 47.25 })).toMatchObject({ frame: 0, phase: 'walk' });
    expect(pawnSlugMatthiasLocomotion({ time: 47.31, moving: true, speedRatio: 0.2, moveStartedAt: 47.25 }).frame).toBeGreaterThanOrEqual(0);
  });

  it('slows the walk cycle while Matthias is still accelerating', () => {
    const slow = pawnSlugMatthiasLocomotion({ time: 12.18, moving: true, speedRatio: 0.12, moveStartedAt: 12 });
    const brisk = pawnSlugMatthiasLocomotion({ time: 12.18, moving: true, speedRatio: 0.9, moveStartedAt: 12 });
    expect(slow.action).toBe('walk');
    expect(brisk.action).toBe('walk');
    expect(slow.frame).toBeLessThanOrEqual(brisk.frame);
    expect(PAWN_SLUG_MOTION_POLISH.walkRateMinScale).toBeGreaterThan(0.8);
  });

  it('uses a deliberately relaxed ten-frame cadence and a soft stop settle', () => {
    expect(PAWN_SLUG_MOTION_POLISH.walkFrames).toBe(10);
    expect(PAWN_SLUG_MOTION_POLISH.walkRate).toBeGreaterThanOrEqual(6);
    expect(PAWN_SLUG_MOTION_POLISH.walkRate).toBeLessThan(7);
    expect(PAWN_SLUG_MOTION_POLISH.settleFrames).toBeGreaterThanOrEqual(5);
    expect(PAWN_SLUG_MOTION_POLISH.settleSeconds).toBeLessThanOrEqual(0.15);
  });

  it('settles through walk frames instead of snapping directly into idle', () => {
    const settling = pawnSlugMatthiasLocomotion({ time: 20.08, moving: false, stoppedAt: 20 });
    expect(settling.action).toBe('walk');
    expect(settling.phase).toBe('settle');
    expect(settling.frame).toBeGreaterThanOrEqual(0);
    expect(settling.frame).toBeLessThan(PAWN_SLUG_MOTION_POLISH.settleFrames);
    expect(pawnSlugMatthiasLocomotion({ time: 20.16, moving: false, stoppedAt: 20 }))
      .toMatchObject({ action: 'idle', phase: 'idle' });
  });

  it('reuses immutable locomotion results instead of allocating one object per frame', () => {
    const idleA = pawnSlugMatthiasLocomotion({ time: 20.2, moving: false, stoppedAt: 20 });
    const idleB = pawnSlugMatthiasLocomotion({ time: 25, moving: false });
    expect(idleB).toBe(idleA);

    const walkA = pawnSlugMatthiasLocomotion({ time: 30, moving: true, speedRatio: 0.2, moveStartedAt: 30 });
    const walkB = pawnSlugMatthiasLocomotion({ time: 45, moving: true, speedRatio: 1, moveStartedAt: 45 });
    expect(walkB).toBe(walkA);

    const settleA = pawnSlugMatthiasLocomotion({ time: 60.01, moving: false, stoppedAt: 60 });
    const settleB = pawnSlugMatthiasLocomotion({ time: 70.01, moving: false, stoppedAt: 70 });
    expect(settleB).toBe(settleA);
  });

  it('never addresses a walk frame outside the ten-frame v5 row at sustained full speed', () => {
    for (let step = 0; step < 240; step += 1) {
      const sample = pawnSlugMatthiasLocomotion({
        time: 30 + step / 120,
        moving: true,
        speedRatio: 1,
        moveStartedAt: 30,
      });
      expect(sample.action).toBe('walk');
      expect(sample.frame).toBeGreaterThanOrEqual(0);
      expect(sample.frame).toBeLessThan(PAWN_SLUG_MOTION_POLISH.walkFrames);
    }
  });

  it('normalizes invalid speed input without selecting impossible sprint locomotion', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: Number.NaN, moveStartedAt: 0.95 }).action).toBe('walk');
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: 99, moveStartedAt: 0 }).action).toBe('walk');
  });
});
