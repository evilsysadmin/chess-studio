import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { homeGpuBenchmarkAmbientHour } from './home-gpu-ambient-clock.mjs';

describe('Home GPU physical benchmark ambient clock', () => {
  it('freezes both controlled light trials and draw census to the same requested period', () => {
    for (const [ambient, hour] of [['dawn', 7], ['day', 13], ['dusk', 19], ['night', 23]]) {
      assert.equal(homeGpuBenchmarkAmbientHour({ lightProbe: true, ambient }), hour);
      assert.equal(homeGpuBenchmarkAmbientHour({ drawCensus: true, ambient }), hour);
      assert.equal(homeGpuBenchmarkAmbientHour({ drawCensus: true, lightProbe: true, ambient }), hour);
    }
  });
  it('does not override real time in normal or ad-hoc diagnostic sessions', () => {
    assert.equal(homeGpuBenchmarkAmbientHour(), null);
    assert.equal(homeGpuBenchmarkAmbientHour({ ambient: 'invalid' }), null);
  });
  it('refuses invalid controlled trial periods instead of silently comparing different scenes', () => {
    for (const ambient of ['other', '', '3am', '__proto__']) {
      assert.throws(() => homeGpuBenchmarkAmbientHour({ drawCensus: true, ambient }), /Unknown CHESS_HOME_GPU_AMBIENT/);
      assert.throws(() => homeGpuBenchmarkAmbientHour({ lightProbe: true, ambient }), /Unknown CHESS_HOME_GPU_AMBIENT/);
    }
  });
});
