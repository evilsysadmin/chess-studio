import { describe, expect, it } from 'vitest';
import { createHomeCastle3DPerformanceGovernor } from './HomeCastle3DPerformanceGovernor.js';

function feed(governor, deltas) {
  let timestamp = 0;
  let signal = governor.observe(timestamp);
  for (const delta of deltas) {
    timestamp += delta;
    signal = governor.observe(timestamp) || signal;
  }
  return signal;
}

function repeated(value, count) {
  return Array.from({ length: count }, () => value);
}

describe('HomeCastle3DPerformanceGovernor', () => {
  it('keeps a healthy full renderer at full quality', () => {
    const governor = createHomeCastle3DPerformanceGovernor('full');
    expect(feed(governor, repeated(16.7, 240))).toBeNull();
  });

  it('degrades sustained 30fps full rendering to lite', () => {
    const governor = createHomeCastle3DPerformanceGovernor('full');
    expect(feed(governor, repeated(33.4, 140))).toBe('lite');
  });

  it('ignores one isolated full-renderer hitch', () => {
    const governor = createHomeCastle3DPerformanceGovernor('full');
    const deltas = [
      ...repeated(16.7, 70),
      120,
      ...repeated(16.7, 120),
    ];
    expect(feed(governor, deltas)).toBeNull();
  });

  it('ignores suspension-sized gaps instead of treating tab resume as jank', () => {
    const governor = createHomeCastle3DPerformanceGovernor('full');
    const deltas = [
      ...repeated(16.7, 70),
      2_000,
      ...repeated(16.7, 120),
    ];
    expect(feed(governor, deltas)).toBeNull();
  });

  it('keeps healthy lite rendering enabled', () => {
    const governor = createHomeCastle3DPerformanceGovernor('lite');
    expect(feed(governor, repeated(33.4, 180))).toBeNull();
  });

  it('falls back from persistently slow lite rendering to canonical 2D', () => {
    const governor = createHomeCastle3DPerformanceGovernor('lite');
    expect(feed(governor, repeated(70, 100))).toBe('2d');
  });

  it('does nothing for the 2D tier or an unknown tier', () => {
    expect(feed(createHomeCastle3DPerformanceGovernor('2d'), repeated(80, 200))).toBeNull();
    expect(feed(createHomeCastle3DPerformanceGovernor('unknown'), repeated(80, 200))).toBeNull();
  });
});
