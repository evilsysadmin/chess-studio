import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeGpuBenchmarkRevision, homeGpuPhysicalCheckoutProvenance } from './home-gpu-revision.mjs';

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

describe('Physical Home GPU checkout reproducibility', () => {
  it('accepts full matching SHA only with no staged or tracked edits', () => {
    assert.equal(homeGpuPhysicalCheckoutProvenance(sha.toUpperCase(), sha, ''), sha);
    assert.equal(homeGpuPhysicalCheckoutProvenance('  ' + sha, sha.toUpperCase(), '   '), sha);
  });

  it('rejects a clean worktree from the wrong commit', () => {
    assert.throws(() => homeGpuPhysicalCheckoutProvenance(sha, 'b'.repeat(40), ''), /does not match checkout HEAD/);
    assert.throws(() => homeGpuPhysicalCheckoutProvenance('', sha, ''), /require CHESS_HOME_GPU_REVISION/);
    assert.throws(() => homeGpuPhysicalCheckoutProvenance(sha, sha.slice(0, 7), ''), /exact 40-character/);
  });

  it('rejects staged, unstaged, renamed or deleted tracked files', () => {
    for (const status of [' M frontend/src/components/HomeBlenderScene3D.jsx',
      'M  e2e/home-3d-flame-pass-benchmark.spec.js',
      'R  old.js -> new.js',
      ' D Makefile',
      'UU frontend/src/index.css']) {
      assert.throws(() => homeGpuPhysicalCheckoutProvenance(sha, sha, status), /clean tracked Git worktree/);
    }
  });

  it('fails closed if git status was unavailable', () => {
    for (const status of [undefined, null, 0, [], {}]) {
      assert.throws(() => homeGpuPhysicalCheckoutProvenance(sha, sha, status), /clean tracked Git worktree/);
    }
  });
});
