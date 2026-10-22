import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeGpuBenchmarkRevision } from './home-gpu-revision.mjs';

const sha = 'a1b2c3d4'.repeat(5);

describe('Home physical GPU benchmark revision provenance', () => {
  it('accepts and normalizes an exact full SHA', () => {
    assert.equal(homeGpuBenchmarkRevision(sha, { hardware: true }), sha);
    assert.equal(homeGpuBenchmarkRevision('  ' + sha.toUpperCase() + '  ', { hardware: true }), sha);
  });

  it('fails before hardware browser visits when Make omitted shell SHA expansion', () => {
    for (const value of [undefined, null, '', ' \n ']) {
      assert.throws(() => homeGpuBenchmarkRevision(value, { hardware: true }), /require CHESS_HOME_GPU_REVISION/);
    }
  });

  it('rejects abbreviated, malformed and forged revisions', () => {
    for (const value of ['deadbee', sha.slice(0, 39), sha + 'f', 'g'.repeat(40), '$(git rev-parse HEAD)', '0x' + sha]) {
      assert.throws(() => homeGpuBenchmarkRevision(value, { hardware: true }), /exact 40-character/);
    }
  });

  it('retains opt-in software diagnostics without inventing a revision', () => {
    assert.equal(homeGpuBenchmarkRevision(undefined), null);
    assert.equal(homeGpuBenchmarkRevision(''), null);
    assert.equal(homeGpuBenchmarkRevision(sha), sha);
  });
});
