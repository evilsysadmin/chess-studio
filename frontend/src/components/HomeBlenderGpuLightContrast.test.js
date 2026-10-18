import { describe, expect, it } from 'vitest';
import { summarizeHomeGpuLightContrast } from './HomeBlenderGpuLightContrast.js';

const board = [
  { lightProbe: 'normal', gpuMedianMs: 28.9, cpuP95MedianMs: 10.5 },
  { lightProbe: 'aux-board-off', gpuMedianMs: 28.01, cpuP95MedianMs: 10.05 },
  { lightProbe: 'aux-board-off', gpuMedianMs: 23.35, cpuP95MedianMs: 10.2 },
  { lightProbe: 'normal', gpuMedianMs: 28.31, cpuP95MedianMs: 10.3 },
];

describe('physical Home GPU A/B/B/A family contrast', () => {
  it('aggregates each selected family rather than hardcoding the all-off label', () => {
    const result = summarizeHomeGpuLightContrast(board, 'aux-board-off');
    expect(result.gpuMedianMs.normal).toBeCloseTo(28.605, 6);
    expect(result.gpuMedianMs.auxOff).toBeCloseTo(25.68, 6);
    expect(result.gpuDifferenceMs).toBeCloseTo(2.925, 6);
    expect(result.gpuContrastPct).toBeCloseTo(10.2255, 3);
    expect(result.cpuP95MedianMs.normal).toBeCloseTo(10.4, 6);
    expect(result.cpuP95MedianMs.auxOff).toBeCloseTo(10.125, 6);
    expect(result.gpuContrastPct).toBeLessThan(100);
  });

  it('preserves the original all-aux-off mode and accepts every supported family', () => {
    for (const mode of ['aux-off', 'aux-wall-off', 'aux-board-off',
      'aux-stairs-off', 'aux-accent-off']) {
      const visits = board.map((visit, i) => ({
        ...visit, lightProbe: (i === 0 || i === 3) ? 'normal' : mode,
      }));
      const result = summarizeHomeGpuLightContrast(visits, mode);
      expect(result.gpuMedianMs.auxOff).toBeCloseTo(25.68, 6);
    }
  });

  it('fails closed on a missing B group, not a fabricated 100% saving', () => {
    expect(() => summarizeHomeGpuLightContrast(board, 'aux-off'))
      .toThrow(/unexpected light mode/);
    expect(() => summarizeHomeGpuLightContrast([], 'aux-board-off'))
      .toThrow(/four visits/);
    expect(() => summarizeHomeGpuLightContrast(board, 'aux-unknown-off'))
      .toThrow(/known light-off mode/);
  });

  it('rejects null/NaN, zero or missing GPU and CPU medians', () => {
    for (const key of ['gpuMedianMs', 'cpuP95MedianMs']) {
      for (const value of [null, undefined, NaN, Infinity]) {
        const visits = board.map((visit, i) => i === 2
          ? { ...visit, [key]: value } : visit);
        expect(() => summarizeHomeGpuLightContrast(visits, 'aux-board-off'))
          .toThrow(/incomplete timing samples/);
      }
    }
    const zero = board.map((visit, i) => i === 1 ? { ...visit, gpuMedianMs: 0 } : visit);
    expect(() => summarizeHomeGpuLightContrast(zero, 'aux-board-off'))
      .toThrow(/incomplete timing samples/);
  });

  it('reports a regression rather than clipping negative savings', () => {
    const slower = board.map((visit, i) => (i === 1 || i === 2)
      ? { ...visit, gpuMedianMs: 35 } : visit);
    expect(summarizeHomeGpuLightContrast(slower, 'aux-board-off').gpuContrastPct)
      .toBeLessThan(0);
  });
});
