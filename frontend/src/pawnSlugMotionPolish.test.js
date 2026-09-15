import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MOTION_POLISH,
  pawnSlugMatthiasLocomotion,
  pawnSlugMatthiasVisualY,
} from './pawnSlugMotionPolish.js';

describe('Pawn Slug locomotion polish', () => {
  it('uses Matthias full authored run cycle for ordinary ground traversal', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 10.04, moving: true, speedRatio: 0.2, moveStartedAt: 10 }))
      .toMatchObject({ action: 'run', phase: 'run' });
    expect(pawnSlugMatthiasLocomotion({ time: 10.6, moving: true, speedRatio: 0.6, moveStartedAt: 10 }))
      .toMatchObject({ action: 'run', phase: 'run' });
    expect(pawnSlugMatthiasLocomotion({ time: 14, moving: true, speedRatio: 1, moveStartedAt: 10 }))
      .toMatchObject({ action: 'run', phase: 'run' });
  });

  it('starts a fresh run cycle from frame zero regardless of mission time', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 10, moving: true, speedRatio: 0.2, moveStartedAt: 10 })).toMatchObject({ frame: 0, phase: 'run' });
    expect(pawnSlugMatthiasLocomotion({ time: 47.25, moving: true, speedRatio: 0.2, moveStartedAt: 47.25 })).toMatchObject({ frame: 0, phase: 'run' });
  });

  it('keeps a near-constant smooth cadence while velocity ramps up', () => {
    const slow = pawnSlugMatthiasLocomotion({ time: 12.18, moving: true, speedRatio: 0.12, moveStartedAt: 12 });
    const fast = pawnSlugMatthiasLocomotion({ time: 12.18, moving: true, speedRatio: 0.9, moveStartedAt: 12 });
    expect(slow.action).toBe('run');
    expect(fast.action).toBe('run');
    expect(slow.frame).toBeLessThanOrEqual(fast.frame);
    expect(PAWN_SLUG_MOTION_POLISH.runRateMinScale).toBeGreaterThanOrEqual(0.9);
  });

  it('addresses all sixteen run cells at a fluid but controlled cadence', () => {
    expect(PAWN_SLUG_MOTION_POLISH.runFrames).toBe(16);
    expect(PAWN_SLUG_MOTION_POLISH.runRate).toBe(14);
    const seen = new Set();
    for (let step = 0; step < 240; step += 1) {
      const sample = pawnSlugMatthiasLocomotion({
        time: 30 + step / 120,
        moving: true,
        speedRatio: 1,
        moveStartedAt: 30,
      });
      expect(sample.frame).toBeGreaterThanOrEqual(0);
      expect(sample.frame).toBeLessThan(16);
      seen.add(sample.frame);
    }
    expect(seen.size).toBe(16);
  });

  it('returns straight to idle once movement is actually finished', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 20.1, moving: false }))
      .toMatchObject({ action: 'idle', phase: 'idle', frame: 0 });
  });

  it('reuses immutable locomotion results instead of allocating every frame', () => {
    const idleA = pawnSlugMatthiasLocomotion({ time: 20.2, moving: false });
    const idleB = pawnSlugMatthiasLocomotion({ time: 25, moving: false });
    expect(idleB).toBe(idleA);

    const runA = pawnSlugMatthiasLocomotion({ time: 30, moving: true, speedRatio: 0.2, moveStartedAt: 30 });
    const runB = pawnSlugMatthiasLocomotion({ time: 45, moving: true, speedRatio: 1, moveStartedAt: 45 });
    expect(runB).toBe(runA);
  });

  it('normalizes invalid speed input while staying on the valid run row', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: Number.NaN, moveStartedAt: 0.95 }).action).toBe('run');
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: 99, moveStartedAt: 0 }).action).toBe('run');
  });

  it('plants Matthias visual baseline below the physics origin without changing physics coordinates', () => {
    expect(PAWN_SLUG_MOTION_POLISH.visualBaselineOffsetY).toBeCloseTo(-0.12, 8);
    expect(pawnSlugMatthiasVisualY(2)).toBeCloseTo(1.88, 8);
    expect(pawnSlugMatthiasVisualY(0)).toBeCloseTo(-0.12, 8);
  });
});
