import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWarRoomAmbientController } from './WarRoomAmbientController.js';

function target() {
  const events = new Map();
  return {
    dataset: {},
    addEventListener: (name, handler) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(handler);
    },
    removeEventListener: (name, handler) => events.get(name)?.delete(handler),
    emit: (name) => { for (const handler of events.get(name) || []) handler(); },
    listeners: () => [...events.values()].reduce((sum, handlers) => sum + handlers.size, 0),
  };
}

function fixture({ intersectionSupported = true, softwareRenderer = false } = {}) {
  let time = 0;
  let nextId = 1;
  let paints = 0;
  let observer = null;
  const timers = new Map();
  const frames = new Map();
  const host = target();
  const canvas = target();
  const doc = { ...target(), hidden: false };
  const media = target();
  const win = {
    ...target(),
    matchMedia: () => media,
    setTimeout(callback, delay) { const id = nextId++; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    requestAnimationFrame(callback) { const id = nextId++; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
  };
  if (intersectionSupported) {
    win.IntersectionObserver = class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observer = this; }
      observe(element) { this.target = element; }
      disconnect() { this.disconnected = true; }
    };
  }
  const controller = createWarRoomAmbientController({
    host, canvas, doc, win, softwareRenderer,
    now: () => time,
    reducedMotion: () => false,
    onPaint: () => { paints += 1; },
  });
  return {
    controller, canvas, host, doc, win, media, timers, frames,
    observer: () => observer, paints: () => paints,
    setTime(value) { time = value; },
    runTimer() {
      const [id, task] = [...timers.entries()][0] || [];
      timers.delete(id);
      task?.callback();
    },
    runFrame(value = time) {
      const [id, callback] = [...frames.entries()][0] || [];
      frames.delete(id);
      callback?.(value);
    },
  };
}

describe('War Room ambient visibility lifecycle', () => {
  // The injected clock owns the tested deadlines, but real browser timers
  // must remain mocked if any lifecycle callback gains scheduling work.
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('cancels offscreen work, repaints on re-entry and releases observers/listeners', () => {
    const f = fixture();
    expect(f.observer()?.target).toBe(f.host);
    expect(f.canvas.dataset.warRoomAmbientScheduler).toBe('deadline-v1');
    f.controller.start();
    expect(f.timers.size).toBe(1);

    f.observer().callback([{ isIntersecting: false }]);
    expect(f.timers.size).toBe(0);
    expect(f.frames.size).toBe(0);

    f.setTime(500);
    f.observer().callback([{ isIntersecting: true }]);
    expect(f.frames.size).toBe(1);
    f.runFrame();
    expect(f.paints()).toBe(1);

    f.doc.hidden = true;
    f.doc.emit('visibilitychange');
    expect(f.timers.size).toBe(0);
    expect(f.frames.size).toBe(0);

    f.controller.dispose();
    expect(f.observer().disconnected).toBe(true);
    expect(f.canvas.listeners()).toBe(0);
    expect(f.doc.listeners()).toBe(0);
    expect(f.win.listeners()).toBe(0);
    expect(f.media.listeners()).toBe(0);
  });

  it('deep-sleeps with no GPU frames and wakes on pointer or keyboard interaction', () => {
    const f = fixture();
    f.controller.start();
    f.setTime(29_999);
    f.runTimer();
    f.runFrame();
    expect(f.paints()).toBe(1);
    expect(f.timers.size).toBe(1);

    f.setTime(30_250);
    f.runTimer();
    f.runFrame();
    expect(f.paints()).toBe(1);
    expect(f.timers.size).toBe(0);
    expect(f.frames.size).toBe(0);

    f.canvas.emit('pointermove');
    expect(f.frames.size).toBe(1);
    f.runFrame();
    expect(f.paints()).toBe(2);
    f.controller.dispose();
    expect(f.canvas.listeners()).toBe(0);
  });

  it('wakes from 30-second deep sleep when the tab becomes visible without mouse input', () => {
    const f = fixture();
    f.controller.start();
    f.setTime(30_200);
    f.runTimer();
    f.runFrame();
    expect(f.paints()).toBe(0);
    expect(f.frames.size).toBe(0);
    expect(f.timers.size).toBe(0);

    f.doc.hidden = true;
    f.doc.emit('visibilitychange');
    f.setTime(31_000);
    f.doc.hidden = false;
    f.doc.emit('visibilitychange');

    expect(f.controller.getDebugState().deepSleeping).toBe(false);
    expect(f.frames.size).toBe(1);
    f.runFrame();
    expect(f.paints()).toBe(1);
    f.controller.dispose();
    expect(f.doc.listeners()).toBe(0);
  });

  it('wakes on viewport re-entry after deep sleep without synthesizing pointer events', () => {
    const f = fixture();
    f.controller.start();
    f.observer().callback([{ isIntersecting: false }]);
    expect(f.timers.size).toBe(0);

    f.setTime(31_000);
    f.observer().callback([{ isIntersecting: true }]);
    expect(f.frames.size).toBe(1);
    expect(f.controller.getDebugState().deepSleeping).toBe(false);
    f.runFrame();
    expect(f.paints()).toBe(1);
    f.controller.dispose();
  });

  it('preserves visibility fallback when IntersectionObserver is unavailable', () => {
    const f = fixture({ intersectionSupported: false });
    expect(f.observer()).toBeNull();
    f.controller.start();
    expect(f.timers.size).toBe(1);
    f.controller.dispose();
    expect(f.timers.size).toBe(0);
  });

  it('does not attach listeners or schedule ambience for the software renderer', () => {
    const f = fixture({ softwareRenderer: true });
    expect(f.controller).toBeNull();
    expect(f.canvas.listeners()).toBe(0);
    expect(f.doc.listeners()).toBe(0);
    expect(f.observer()).toBeNull();
  });
});
