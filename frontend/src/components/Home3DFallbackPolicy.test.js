import { describe, expect, it } from 'vitest';
import { home3DColdStartWatchdogShouldFallback } from './Home3DFallbackPolicy.js';

describe('Home 3D cold-start watchdog vs post-ready WebGL recovery', () => {
  it('retains initial safety fallback after 30 seconds if no real WebGL frame ever composed', () => {
    expect(home3DColdStartWatchdogShouldFallback()).toBe(true);
    expect(home3DColdStartWatchdogShouldFallback({
      currentlyVisible: false,
      everPresented3D: false,
    })).toBe(true);
  });

  it('never abandons Blender on transient or prolonged loss after real 3D was shown', () => {
    expect(home3DColdStartWatchdogShouldFallback({
      currentlyVisible: false,
      everPresented3D: true,
    })).toBe(false);
    expect(home3DColdStartWatchdogShouldFallback({
      currentlyVisible: true,
      everPresented3D: true,
    })).toBe(false);
  });

  it('does not replace an already-ready renderer at the watchdog deadline', () => {
    expect(home3DColdStartWatchdogShouldFallback({
      currentlyVisible: true,
      everPresented3D: false,
    })).toBe(false);
  });
});
