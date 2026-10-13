import { describe, expect, it } from 'vitest';
import {
  HOME_BLENDER_FIRE_FULL_INTERVAL_MS,
  HOME_BLENDER_FIRE_LITE_INTERVAL_MS,
  homeBlenderFireFrameDue,
  homeBlenderFireNextDeadline,
  homeBlenderFireFramePlan,
} from './HomeBlenderScene3D.jsx';

function countDraws(refreshHz, seconds, intervalMs) {
  let deadline = Number.NEGATIVE_INFINITY;
  let draws = 0;
  // Deterministic synthetic RAF timestamps; model the same ~60Hz desktop
  // panel and higher-refresh 120/144Hz panels without invoking WebGL.
  for (let tick = 0; tick <= refreshHz * seconds; tick += 1) {
    const timestamp = tick * 1000 / refreshHz;
    if (!homeBlenderFireFrameDue(timestamp, deadline)) continue;
    draws += 1;
    deadline = homeBlenderFireNextDeadline(timestamp, deadline, intervalMs);
  }
  return draws;
}

describe('Home Blender adaptive fire pacing', () => {
  it('targets a fluid desktop cadence and conservative lite cadence', () => {
    expect(HOME_BLENDER_FIRE_FULL_INTERVAL_MS).toBeCloseTo(1000 / 60);
    expect(HOME_BLENDER_FIRE_LITE_INTERVAL_MS).toBeCloseTo(1000 / 30);
    // A cheap scene should not inherit the previous hard 42/66ms throttle.
    expect(homeBlenderFireFramePlan({
      baseIntervalMs: HOME_BLENDER_FIRE_FULL_INTERVAL_MS,
      renderCostMs: 2,
      samples: 30,
    }).intervalMs).toBeCloseTo(1000 / 60);
  });

  it.each([60, 120, 144])('sustains about 60 rendered frames/sec on a %iHz panel', (hz) => {
    const rendered = countDraws(hz, 4, HOME_BLENDER_FIRE_FULL_INTERVAL_MS);
    expect(rendered).toBeGreaterThanOrEqual(230);
    expect(rendered).toBeLessThanOrEqual(247);
  });

  it('keeps lite animation close to 30Hz on a 60Hz panel', () => {
    const rendered = countDraws(60, 4, HOME_BLENDER_FIRE_LITE_INTERVAL_MS);
    expect(rendered).toBeGreaterThanOrEqual(116);
    expect(rendered).toBeLessThanOrEqual(124);
  });

  it('does not skip a 60Hz vsync because of fractional timestamp rounding', () => {
    expect(homeBlenderFireFrameDue(16.65, 1000 / 60)).toBe(true);
    expect(homeBlenderFireFrameDue(8.33, 1000 / 60)).toBe(false);
  });

  it('retains CPU-cost adaptation instead of forcing expensive full-room draws', () => {
    const plan = homeBlenderFireFramePlan({
      baseIntervalMs: HOME_BLENDER_FIRE_FULL_INTERVAL_MS,
      renderCostMs: 20,
      samples: 30,
    });
    expect(plan.intervalMs).toBe(60);
    expect(plan.intervalMs).toBeGreaterThan(HOME_BLENDER_FIRE_FULL_INTERVAL_MS);
  });

  it('never attempts a burst of catch-up renders after a tab pause or long hitch', () => {
    const beforePause = 1000 / 60;
    const resumed = 120_000;
    const next = homeBlenderFireNextDeadline(resumed, beforePause, 1000 / 60);
    expect(next).toBeGreaterThan(resumed);
    expect(homeBlenderFireFrameDue(resumed + 1, next)).toBe(false);
    expect(homeBlenderFireFrameDue(resumed + 1000 / 60, next)).toBe(true);
  });

  it('ignores invalid RAF stamps rather than scheduling a broken frame', () => {
    expect(homeBlenderFireFrameDue(NaN, 0)).toBe(false);
    expect(homeBlenderFireFrameDue(Infinity, 0)).toBe(false);
    expect(Number.isFinite(homeBlenderFireNextDeadline(10, -Infinity, 0))).toBe(true);
  });
});
