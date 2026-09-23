import { describe, expect, it } from 'vitest';
import { clampReplayStep } from './ReplayTimelineControls.jsx';

describe('Replay timeline controls', () => {
  it('clamps navigation to the available frame range', () => {
    expect(clampReplayStep(-4, 5)).toBe(0);
    expect(clampReplayStep(0, 5)).toBe(0);
    expect(clampReplayStep(2, 5)).toBe(2);
    expect(clampReplayStep(99, 5)).toBe(4);
  });

  it('fails closed to the initial frame for empty or invalid timelines', () => {
    expect(clampReplayStep(3, 0)).toBe(0);
    expect(clampReplayStep(3, undefined)).toBe(0);
    expect(clampReplayStep(Number.NaN, 4)).toBe(0);
  });
});
