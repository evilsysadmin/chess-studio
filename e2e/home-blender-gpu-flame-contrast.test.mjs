import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyHomeFlamePassContrast } from './home-blender-gpu-flame-contrast.mjs';

const evidence = (overrides = {}) => ({
  savedMainDrawCalls: 28,
  gpuDifferenceMs: 1.2,
  pairedDifferencesMs: [1.1, 1.3],
  baseDriftMs: 0.2,
  variantDriftMs: 0.3,
  flags: [],
  ...overrides,
});

describe('Home physical flame GPU A/B/B/A interpretation', () => {
  it('never approves production even for consistent measured improvements', () => {
    const result = classifyHomeFlamePassContrast(evidence());
    assert.equal(result.verdict, 'candidate-repeat-and-review-pngs');
    assert.equal(result.observedSpreadMs, 0.3);
    assert.equal(result.productionApproved, false);
    assert.equal(result.repeatHardwareRunRequired, true);
    assert.equal(result.visualReviewRequired, true);
  });

  it('rejects apparent timer wins without any observed main draw savings', () => {
    for (const savedMainDrawCalls of [0, -1]) {
      assert.equal(classifyHomeFlamePassContrast(evidence({ savedMainDrawCalls })).verdict,
        'no-observed-draw-reduction');
    }
  });

  it('separates contradictory pairs and thermal drift from a repeatable win', () => {
    const disagreement = evidence({
      pairedDifferencesMs: [2.0, -0.1], flags: ['paired-direction-disagrees'],
    });
    assert.equal(classifyHomeFlamePassContrast(disagreement).verdict,
      'inconclusive-unstable-paired-timings');
    assert.equal(classifyHomeFlamePassContrast(evidence({
      flags: ['normal-drift-over-15pct'],
    })).verdict, 'inconclusive-unstable-paired-timings');
  });

  it('does not call a smaller-than-drift positive GPU delta a promising result', () => {
    assert.equal(classifyHomeFlamePassContrast(evidence({
      gpuDifferenceMs: 0.12, baseDriftMs: 0.4,
    })).verdict, 'inconclusive-effect-within-observed-spread');
    assert.equal(classifyHomeFlamePassContrast(evidence({
      gpuDifferenceMs: 0.4, baseDriftMs: 0.4,
    })).verdict, 'inconclusive-effect-within-observed-spread');
  });

  it('reports no consistent speed improvement for negative/zero paired savings', () => {
    assert.equal(classifyHomeFlamePassContrast(evidence({
      gpuDifferenceMs: -0.5, pairedDifferencesMs: [-0.5, -0.5],
    })).verdict, 'no-consistent-gpu-time-improvement');
    assert.equal(classifyHomeFlamePassContrast(evidence({
      pairedDifferencesMs: [1, 0],
    })).verdict, 'no-consistent-gpu-time-improvement');
  });

  it('fails closed on missing or nonfinite data, not false-zero measurements', () => {
    for (const patch of [
      { gpuDifferenceMs: null }, { savedMainDrawCalls: null },
      { savedMainDrawCalls: 0.5 }, { pairedDifferencesMs: [1] },
      { pairedDifferencesMs: [1, NaN] },
      { baseDriftMs: -1 }, { variantDriftMs: undefined },
      { flags: null },
    ]) {
      assert.throws(() => classifyHomeFlamePassContrast(evidence(patch)), /finite physical/);
    }
  });
});
