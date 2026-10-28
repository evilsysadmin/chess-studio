import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startWarRoomSpatialAmbience } from './useWarRoomSpatialAmbience.js';

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(name, handler) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(handler);
    },
    removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
    emit(name, event = {}) { for (const listener of listeners.get(name) || []) listener(event); },
    listenerCount() { return [...listeners.values()].reduce((sum, set) => sum + set.size, 0); },
  };
}

function fakeAudio() {
  const oscillators = [];
  const buffers = [];
  function node(properties = {}) {
    return {
      ...properties,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
  }
  const context = {
    state: 'running',
    sampleRate: 44100,
    currentTime: 1,
    destination: {},
    createGain: () => node({ gain: { value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), cancelScheduledValues: vi.fn() } }),
    createStereoPanner: () => node({ pan: { value: 0 } }),
    createBiquadFilter: () => node({ frequency: { value: 0 }, Q: { value: 0 } }),
    createBuffer: vi.fn(() => ({ getChannelData: () => new Float32Array(8) })),
    createOscillator: () => {
      const oscillator = node({
        frequency: { value: 0, setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
        start: vi.fn(), stop: vi.fn(), type: 'sine',
      });
      oscillators.push(oscillator);
      return oscillator;
    },
    createBufferSource: () => {
      const source = node({ start: vi.fn(), stop: vi.fn(), loop: false, buffer: null });
      buffers.push(source);
      return source;
    },
  };
  return { context, oscillators, buffers };
}

function harness(hidden = false) {
  const win = eventTarget();
  win.setTimeout = (callback, ms) => setTimeout(callback, ms);
  win.clearTimeout = (id) => clearTimeout(id);
  const doc = eventTarget();
  doc.hidden = hidden;
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  const audio = fakeAudio();
  const dispose = startWarRoomSpatialAmbience({
    context: audio.context,
    atmosphere: { weather: 'rain', phase: 'night' },
    random: () => 0,
  });
  return { win, doc, dispose, ...audio };
}

describe('War Room spatial audio hidden-tab lifecycle', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it('stops room oscillators and rare tick timers while hidden, resumes exactly once', () => {
    const f = harness();
    expect(f.oscillators).toHaveLength(2);
    expect(f.context.createBuffer).not.toHaveBeenCalled();
    expect(f.oscillators.every((o) => o.start.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    f.doc.hidden = true;
    f.doc.emit('visibilitychange');
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(80_000);
    expect(f.oscillators).toHaveLength(2);

    f.doc.hidden = false;
    f.doc.emit('visibilitychange');
    f.doc.emit('visibilitychange');
    expect(f.oscillators).toHaveLength(4);
    expect(vi.getTimerCount()).toBe(1);
    f.dispose();
    expect(f.oscillators.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.doc.listenerCount()).toBe(0);
    expect(f.win.listenerCount()).toBe(0);
  });

  it('starts with no spatial sound or timer if the page is already hidden', () => {
    const f = harness(true);
    expect(f.oscillators).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
    f.doc.hidden = false;
    f.doc.emit('visibilitychange');
    expect(f.oscillators).toHaveLength(2);
    f.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allocates weather noise only on first inner-window hover and reuses it', () => {
    const f = harness();
    const canvas = {
      classList: { contains: (name) => name === 'board3d-main-canvas' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      dataset: { warRoomWeatherWindowHitbox: '0.7200,0.1200,0.8800,0.6200' },
    };
    const listen = { target: canvas, pointerType: 'mouse', clientX: 800, clientY: 300 };
    const leave = { target: canvas, pointerType: 'mouse', clientX: 100, clientY: 300 };
    expect(f.context.createBuffer).not.toHaveBeenCalled();
    f.win.emit('pointermove', listen);
    expect(f.context.createBuffer).toHaveBeenCalledTimes(1);
    expect(f.buffers).toHaveLength(2);
    f.win.emit('pointermove', leave);
    expect(f.buffers.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    f.win.emit('pointermove', listen);
    expect(f.context.createBuffer).toHaveBeenCalledTimes(1);
    expect(f.buffers).toHaveLength(4);
    f.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('never restarts window weather audio from pointer events while hidden', () => {
    const f = harness();
    const canvas = {
      classList: { contains: (name) => name === 'board3d-main-canvas' },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1000 }),
      dataset: { warRoomWeatherWindowHitbox: '0.7200,0.1200,0.8800,0.6200' },
    };
    const event = { target: canvas, pointerType: 'mouse', clientX: 800, clientY: 300 };
    expect(f.context.createBuffer).not.toHaveBeenCalled();
    f.win.emit('pointermove', event);
    expect(f.context.createBuffer).toHaveBeenCalledTimes(1);
    expect(f.buffers).toHaveLength(2);
    f.doc.hidden = true;
    f.doc.emit('visibilitychange');
    expect(f.buffers.every((o) => o.stop.mock.calls.length === 1)).toBe(true);
    f.win.emit('pointermove', event);
    expect(f.context.createBuffer).toHaveBeenCalledTimes(1);
    expect(f.buffers).toHaveLength(2);
    expect(vi.getTimerCount()).toBe(0);
    f.dispose();
  });
});
