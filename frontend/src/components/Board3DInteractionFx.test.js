import { describe, expect, it } from 'vitest';
import {
  board3DCaptureWarmBoost,
  board3DCaptureWarmBoostValue,
  board3DHighlightPulse,
  board3DPieceInteractionPose,
  writeBoard3DHighlightPulse,
} from './Board3DInteractionFx.js';

describe('War Room premium interaction FX', () => {
  it('keeps selection and check pulses slow, bounded and reduced-motion safe', () => {
    const selected = board3DHighlightPulse({ kind: 'selected', nowMs: 1200 });
    const check = board3DHighlightPulse({ kind: 'check', nowMs: 875 });
    const reduced = board3DHighlightPulse({ kind: 'check', nowMs: 875, reducedMotion: true });

    expect(selected.opacityFactor).toBeGreaterThanOrEqual(0.92);
    expect(selected.scaleFactor).toBeLessThanOrEqual(1.018);
    expect(check.opacityFactor).toBeGreaterThanOrEqual(0.89);
    expect(check.scaleFactor).toBeLessThanOrEqual(1.026);
    expect(reduced).toEqual({ opacityFactor: 1, scaleFactor: 1 });
  });

  it('writes highlight pulse output into one reusable object for render hot paths', () => {
    const scratch = { opacityFactor: 0, scaleFactor: 0 };
    const first = writeBoard3DHighlightPulse(scratch, 'selected', 1200, false, false);
    const firstSnapshot = { ...scratch };
    const second = writeBoard3DHighlightPulse(scratch, 'check', 875, false, true);

    expect(first).toBe(scratch);
    expect(second).toBe(scratch);
    expect(firstSnapshot).toEqual(board3DHighlightPulse({ kind: 'selected', nowMs: 1200 }));
    expect(scratch).toEqual(board3DHighlightPulse({ kind: 'check', nowMs: 875, coarsePointer: true }));

    writeBoard3DHighlightPulse(scratch, 'legal', 999, false, false);
    expect(scratch).toEqual({ opacityFactor: 1, scaleFactor: 1 });
  });

  it('tones pulses down on coarse pointers instead of adding a mobile-only animation loop', () => {
    const desktop = board3DHighlightPulse({ kind: 'check', nowMs: 875 });
    const compact = board3DHighlightPulse({ kind: 'check', nowMs: 875, coarsePointer: true });
    expect(Math.abs(compact.scaleFactor - 1)).toBeLessThanOrEqual(Math.abs(desktop.scaleFactor - 1));
    expect(Math.abs(compact.opacityFactor - 1)).toBeLessThanOrEqual(Math.abs(desktop.opacityFactor - 1));
  });

  it('lifts selected pieces more than hover and keeps coarse hover inert', () => {
    const selected = board3DPieceInteractionPose({ selected: true });
    const hovered = board3DPieceInteractionPose({ hovered: true });
    const coarseHover = board3DPieceInteractionPose({ hovered: true, coarsePointer: true });
    expect(selected.yOffset).toBeGreaterThan(hovered.yOffset);
    expect(selected.scaleFactor).toBeGreaterThan(hovered.scaleFactor);
    expect(coarseHover).toEqual({ yOffset: 0, scaleFactor: 1 });
  });

  it('uses one bounded warm-light impact for captures and returns to baseline at the ends', () => {
    expect(board3DCaptureWarmBoost({ progress: 0 })).toBe(0);
    expect(board3DCaptureWarmBoost({ progress: 0.34 })).toBe(0);
    expect(board3DCaptureWarmBoost({ progress: 1 })).toBe(0);
    const desktop = board3DCaptureWarmBoost({ progress: 0.67 });
    const compact = board3DCaptureWarmBoost({ progress: 0.67, coarsePointer: true });
    expect(desktop).toBeGreaterThan(0);
    expect(desktop).toBeLessThanOrEqual(1.55);
    expect(compact).toBeLessThan(desktop);
    expect(board3DCaptureWarmBoostValue(0.67, false)).toBe(desktop);
    expect(board3DCaptureWarmBoostValue(0.67, true)).toBe(compact);
  });
});
