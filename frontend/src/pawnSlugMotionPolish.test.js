import { describe, expect, it } from 'vitest';
import {
  PAWN_SLUG_MOTION_POLISH,
  pawnSlugMatthiasLocomotion,
} from './pawnSlugMotionPolish.js';

describe('Pawn Slug locomotion polish', () => {
  it('uses the real walk phase before Matthias reaches a full run', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 10.1, moving: true, speedRatio: 0.35, moveStartedAt: 10 })).toMatchObject({ action: 'walk', phase: 'walk' });
    expect(pawnSlugMatthiasLocomotion({ time: 10.4, moving: true, speedRatio: 0.9, moveStartedAt: 10 })).toMatchObject({ action: 'run', phase: 'run' });
    expect(PAWN_SLUG_MOTION_POLISH.runSpeedThreshold).toBeGreaterThan(0.5);
    expect(PAWN_SLUG_MOTION_POLISH.walkToRunSeconds).toBeGreaterThan(0.15);
  });

  it('settles through walk frames instead of snapping directly into idle', () => {
    const settling = pawnSlugMatthiasLocomotion({ time: 20.04, moving: false, stoppedAt: 20 });
    expect(settling.action).toBe('walk');
    expect(settling.phase).toBe('settle');
    expect(settling.frame).toBeGreaterThanOrEqual(0);
    expect(settling.frame).toBeLessThan(PAWN_SLUG_MOTION_POLISH.settleFrames);
    expect(pawnSlugMatthiasLocomotion({ time: 20.2, moving: false, stoppedAt: 20 })).toMatchObject({ action: 'idle', phase: 'idle' });
  });

  it('normalizes invalid speed input instead of selecting impossible locomotion', () => {
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: Number.NaN, moveStartedAt: 0.9 }).action).toBe('walk');
    expect(pawnSlugMatthiasLocomotion({ time: 1, moving: true, speedRatio: 99, moveStartedAt: 0 }).action).toBe('run');
  });
});
