import { describe, expect, it } from 'vitest';
import { homeCastleEntranceFrame } from './HomeCastle3DEntrance.js';

describe('homeCastleEntranceFrame', () => {
  it('starts with only a restrained offset and sub-one-percent zoom-out', () => {
    const frame = homeCastleEntranceFrame(0);
    expect(frame.cameraY).toBeCloseTo(0.012, 6);
    expect(frame.zoom).toBeCloseTo(0.994, 6);
    expect(frame.progress).toBe(0);
  });

  it('settles exactly on the canonical framing', () => {
    const frame = homeCastleEntranceFrame(1000);
    expect(frame.cameraY).toBe(0);
    expect(frame.zoom).toBe(1);
    expect(frame.progress).toBe(1);
  });

  it('skips motion completely for reduced motion', () => {
    expect(homeCastleEntranceFrame(0, true)).toEqual({ progress: 1, cameraY: 0, zoom: 1 });
  });
});
