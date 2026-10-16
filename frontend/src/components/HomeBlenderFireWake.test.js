import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_FIRE_SLEEP_THRESHOLD_MS,
  homeBlenderFireWakeDelay,
} from './HomeBlenderScene3D.jsx';

describe('Blender Home idle RAF scheduling', () => {
  it('does not sleep the smooth full- and lite-refresh render paths', () => {
    expect(homeBlenderFireWakeDelay(100, 100 + 1000 / 60)).toBe(0);
    expect(homeBlenderFireWakeDelay(100, 100 + 1000 / 30)).toBeGreaterThan(0);
    // At 30 Hz the following probe consumes one vsync, so the scheduler
    // skips the timeout and continues with RAF alone.
    expect(homeBlenderFireWakeDelay(100 + 1000 / 60, 100 + 1000 / 30)).toBe(0);
  });

  it('skips unused vsyncs only when enough time remains', () => {
    expect(HOME_BLENDER_FIRE_SLEEP_THRESHOLD_MS).toBe(32);
    const delay = homeBlenderFireWakeDelay(1000, 1200, 1000 / 60);
    expect(delay).toBeGreaterThan(160);
    expect(delay).toBeLessThan(200);
    expect(homeBlenderFireWakeDelay(1190, 1200)).toBe(0);
  });

  it('keeps the next RAF deadline in the future and never schedules invalid timers', () => {
    expect(homeBlenderFireWakeDelay(100, 160, 1000 / 60)).toBeGreaterThan(0);
    expect(homeBlenderFireWakeDelay(500, 160)).toBe(0);
    expect(homeBlenderFireWakeDelay(NaN, 500)).toBe(0);
    expect(homeBlenderFireWakeDelay(0, Infinity)).toBe(0);
  });
});
