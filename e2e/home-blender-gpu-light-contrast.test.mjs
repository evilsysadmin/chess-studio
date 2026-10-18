import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeHomeGpuLightContrast } from './home-blender-gpu-light-contrast.mjs';

const board = [
  { lightProbe: 'normal', gpuMedianMs: 28.9, cpuP95MedianMs: 10.5 },
  { lightProbe: 'aux-board-off', gpuMedianMs: 28.01, cpuP95MedianMs: 10.05 },
  { lightProbe: 'aux-board-off', gpuMedianMs: 23.35, cpuP95MedianMs: 10.2 },
  { lightProbe: 'normal', gpuMedianMs: 28.31, cpuP95MedianMs: 10.3 },
];
const close = (actual, expected) => assert.ok(
  Math.abs(actual - expected) < 0.0001,
  `expected ${actual} to be within 0.0001 of ${expected}`,
);

describe('physical Home GPU lighting contrast aggregator', () => {
  it('uses actual selected family labels and real Intel visit medians', () => {
    const result = summarizeHomeGpuLightContrast(board, 'aux-board-off');
    close(result.gpuMedianMs.normal, 28.605);
    close(result.gpuMedianMs.auxOff, 25.68);
    close(result.gpuDifferenceMs, 2.925);
    close(result.gpuContrastPct, 100 * 2.925 / 28.605);
    close(result.cpuP95MedianMs.normal, 10.4);
    close(result.cpuP95MedianMs.auxOff, 10.125);
    assert.ok(result.gpuContrastPct < 100);
  });

  it('supports legacy aux-off and every new family without special arithmetic', () => {
    for (const mode of ['aux-off', 'aux-wall-off', 'aux-board-off',
      'aux-stairs-off', 'aux-accent-off']) {
      const visits = board.map((visit, index) => ({
        ...visit, lightProbe: index === 0 || index === 3 ? 'normal' : mode,
      }));
      close(summarizeHomeGpuLightContrast(visits, mode).gpuMedianMs.auxOff, 25.68);
    }
  });

  it('fails closed when the requested B mode is missing', () => {
    assert.throws(() => summarizeHomeGpuLightContrast(board, 'aux-off'), /unexpected light mode/);
    assert.throws(() => summarizeHomeGpuLightContrast([], 'aux-board-off'), /four visits/);
    assert.throws(() => summarizeHomeGpuLightContrast(board, 'aux-unknown-off'), /known light-off mode/);
  });

  it('rejects all nonfinite, missing, or zero GPU aggregates', () => {
    for (const key of ['gpuMedianMs', 'cpuP95MedianMs']) {
      for (const value of [null, undefined, NaN, Infinity]) {
        const visits = board.map((visit, index) => index === 2
          ? { ...visit, [key]: value } : visit);
        assert.throws(
          () => summarizeHomeGpuLightContrast(visits, 'aux-board-off'),
          /incomplete timing samples/,
        );
      }
    }
    const zero = board.map((visit, i) => i === 1
      ? { ...visit, gpuMedianMs: 0 } : visit);
    assert.throws(() => summarizeHomeGpuLightContrast(zero, 'aux-board-off'),
      /incomplete timing samples/);
  });

  it('reports a negative contrast when the experimental lights-off mode is slower', () => {
    const visits = board.map((visit, i) => i === 1 || i === 2
      ? { ...visit, gpuMedianMs: 35 } : visit);
    assert.ok(summarizeHomeGpuLightContrast(visits, 'aux-board-off').gpuContrastPct < 0);
  });
});
