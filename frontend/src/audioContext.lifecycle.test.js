import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sound.js', () => ({
  duckAmbientMusic: vi.fn(),
}));

vi.mock('./soundPreferences.js', () => ({
  getAmbientVolume: () => 1,
  isFxMuted: () => false,
  isMusicMuted: () => false,
}));

import { createChesscomAudio } from './chesscomAudio.js';

class FakeAudioParam {
  setValueAtTime() {}
  exponentialRampToValueAtTime() {}
}

class FakeNode {
  constructor() {
    this.gain = new FakeAudioParam();
    this.frequency = new FakeAudioParam();
  }

  connect() { return this; }
  disconnect() {}
  start() {}
  stop() {}
}

class FakeAudioContext {
  static created = 0;
  static closed = 0;

  constructor() {
    FakeAudioContext.created += 1;
    this.state = 'running';
    this.currentTime = 0;
    this.sampleRate = 48_000;
    this.destination = new FakeNode();
  }

  createGain() { return new FakeNode(); }
  createOscillator() { return new FakeNode(); }
  createBuffer() {
    return { getChannelData: () => new Float32Array(8) };
  }
  createBufferSource() { return new FakeNode(); }
  createBiquadFilter() { return new FakeNode(); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  close() {
    FakeAudioContext.closed += 1;
    this.state = 'closed';
    return Promise.resolve();
  }
}

describe('audio context lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeAudioContext.created = 0;
    FakeAudioContext.closed = 0;
    window.AudioContext = FakeAudioContext;
    window.webkitAudioContext = undefined;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    delete window.AudioContext;
    delete window.webkitAudioContext;
  });

  it('keeps the shared audio context as a singleton across repeated consumers', async () => {
    vi.resetModules();
    const audio = await import('./audioContext.js');

    const first = audio.getAudioContext();
    for (let index = 0; index < 500; index += 1) {
      expect(audio.getAudioContext()).toBe(first);
    }

    expect(FakeAudioContext.created).toBe(1);
    expect(audio.getAudioContextState()).toBe('running');
  });

  it('closes every local Chesscom AudioContext and leaves no scheduled score timer', async () => {
    for (let index = 0; index < 100; index += 1) {
      const audio = createChesscomAudio();
      audio.arm();
      audio.destroy();
      audio.destroy();
    }

    await Promise.resolve();

    expect(FakeAudioContext.created).toBe(100);
    expect(FakeAudioContext.closed).toBe(100);
    expect(vi.getTimerCount()).toBe(0);
  });
});
