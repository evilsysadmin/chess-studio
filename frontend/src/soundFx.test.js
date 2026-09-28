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
  resume() { return Promise.resolve(); }
}

describe('premium piece sound', () => {
  beforeEach(() => {
    state.muted = false;
    state.ctx = new FakeAudioContext();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('builds a layered move impact instead of a single oscillator beep', () => {
    playMoveSound();

    const oscillators = state.ctx.nodes.filter((node) => node.kind === 'oscillator');
    const noise = state.ctx.nodes.filter((node) => node.kind === 'buffer-source');
    const filters = state.ctx.nodes.filter((node) => node.kind === 'filter');

    expect(oscillators).toHaveLength(3);
    expect(noise).toHaveLength(1);
    expect(filters).toHaveLength(1);
    expect(oscillators.map((node) => Math.round(node.frequency.value))).toEqual([205, 690, 168]);
  });

  it('gives captures a lower, heavier body than ordinary moves', () => {
    playCaptureSound();

    const oscillators = state.ctx.nodes.filter((node) => node.kind === 'oscillator');
    expect(oscillators).toHaveLength(3);
    expect(Math.round(oscillators[0].frequency.value)).toBe(155);
    expect(Math.round(oscillators[2].frequency.value)).toBe(118);
  });

  it('does not allocate audio nodes when effects are muted', () => {
    state.muted = true;
    playMoveSound();
    playCaptureSound();
    expect(state.ctx.nodes).toHaveLength(0);
  });
});
