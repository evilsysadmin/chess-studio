import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  muted: false,
  ctx: null,
}));

vi.mock('./soundPreferences.js', () => ({
  isFxMuted: () => state.muted,
}));

vi.mock('./audioContext.js', () => ({
  getAudioContext: () => state.ctx,
}));

import { playCaptureSound, playMoveSound } from './soundFx.js';

class FakeParam {
  constructor() { this.value = 0; }
  setValueAtTime(value) { this.value = value; }
  linearRampToValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.value = value; }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.gain = new FakeParam();
    this.frequency = new FakeParam();
    this.Q = new FakeParam();
    this.type = '';
    this.buffer = null;
    this.threshold = new FakeParam();
    this.knee = new FakeParam();
    this.ratio = new FakeParam();
    this.attack = new FakeParam();
    this.release = new FakeParam();
  }
  connect() { return this; }
  start() {}
  stop() {}
}

class FakeAudioContext {
  constructor({ withNoise = true } = {}) {
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 48_000;
    this.destination = new FakeNode('destination');
    this.nodes = [];
    this.withNoise = withNoise;
  }
  createGain() {
    const node = new FakeNode('gain');
    this.nodes.push(node);
    return node;
  }
  createOscillator() {
    const node = new FakeNode('oscillator');
    this.nodes.push(node);
    return node;
  }
  createBiquadFilter() {
    if (!this.withNoise) return undefined;
    const node = new FakeNode('filter');
    this.nodes.push(node);
    return node;
  }
  createBuffer(channels, frames, sampleRate) {
    if (!this.withNoise) return undefined;
    return {
      channels,
      frames,
      sampleRate,
      getChannelData: () => new Float32Array(frames),
    };
  }
  createBufferSource() {
    if (!this.withNoise) return undefined;
    const node = new FakeNode('buffer-source');
    this.nodes.push(node);
    return node;
  }
  createDynamicsCompressor() {
    const node = new FakeNode('compressor');
    this.nodes.push(node);
    return node;
  }
  resume() { return Promise.resolve(); }
}

describe('premium piece sound', () => {
  beforeEach(() => {
    state.muted = false;
    state.ctx = new FakeAudioContext();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('builds a material-first move impact instead of a single oscillator beep', () => {
    playMoveSound();

    const oscillators = state.ctx.nodes.filter((node) => node.kind === 'oscillator');
    const noise = state.ctx.nodes.filter((node) => node.kind === 'buffer-source');
    const filters = state.ctx.nodes.filter((node) => node.kind === 'filter');
    const compressors = state.ctx.nodes.filter((node) => node.kind === 'compressor');

    expect(oscillators).toHaveLength(3);
    expect(noise).toHaveLength(3);
    expect(filters).toHaveLength(4);
    expect(compressors).toHaveLength(1);
  });

  it('keeps the mastered move present instead of over-drying the bus', () => {
    playMoveSound();

    const gains = state.ctx.nodes.filter((node) => node.kind === 'gain');
    const compressor = state.ctx.nodes.find((node) => node.kind === 'compressor');

    expect(gains[0].gain.value).toBeGreaterThan(0.8);
    expect(gains[1].gain.value).toBeGreaterThan(1);
    expect(compressor.ratio.value).toBeLessThan(2);
    expect(compressor.release.value).toBeGreaterThan(0.08);
  });

  it('gives captures an extra physical contact and a lower resonant body', () => {
    playMoveSound();
    const moveOscillators = state.ctx.nodes.filter((node) => node.kind === 'oscillator');
    const moveBodyFrequency = moveOscillators[0].frequency.value;

    state.ctx = new FakeAudioContext();
    playCaptureSound();

    const captureOscillators = state.ctx.nodes.filter((node) => node.kind === 'oscillator');
    const captureNoise = state.ctx.nodes.filter((node) => node.kind === 'buffer-source');
    const captureCompressors = state.ctx.nodes.filter((node) => node.kind === 'compressor');

    expect(captureOscillators).toHaveLength(3);
    expect(captureNoise).toHaveLength(4);
    expect(captureCompressors).toHaveLength(1);
    expect(captureOscillators[0].frequency.value).toBeLessThan(moveBodyFrequency);
  });

  it('does not allocate audio nodes when effects are muted', () => {
    state.muted = true;
    playMoveSound();
    playCaptureSound();
    expect(state.ctx.nodes).toHaveLength(0);
  });
});
