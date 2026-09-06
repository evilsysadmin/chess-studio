import { describe, expect, it } from 'vitest';
import { createWarRoomAmbientScheduler } from './WarRoomAmbientScheduler.js';

function makeClock({ active = true, intervalMs = 100 } = {}) {
  let nowMs = 0;
  let nextId = 1;
  const timers = new Map();
  const frames = new Map();
  let paints = 0;

  const planFrame = (elapsedMs) => ({
    active,
    intervalMs,
    shouldRender: active && elapsedMs >= intervalMs,
    updateCamera: intervalMs <= 34,
  });

  const scheduler = createWarRoomAmbientScheduler({
    requestFrame: (callback) => {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame: (id) => frames.delete(id),
    setTimer: (callback, delay) => {
      const id = nextId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    now: () => nowMs,
    planFrame,
    onFrame: () => { paints += 1; },
  });

  return {
    scheduler,
    timers,
    frames,
    paints: () => paints,
    setNow: (value) => { nowMs = value; },
    setActive: (value) => { active = value; },
    changeInterval: (value) => { intervalMs = value; },
    runTimer: (id = [...timers.keys()][0]) => {
      const timer = timers.get(id);
      timers.delete(id);
      timer?.callback();
    },
    runFrame: (timestamp = nowMs, id = [...frames.keys()][0]) => {
      const frame = frames.get(id);
      frames.delete(id);
      frame?.(timestamp);
    },
  };
}

describe('War Room ambient deadline scheduler', () => {
  it('sleeps the 100 ms idle budget instead of polling RAF at display cadence', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();

    expect(clock.frames.size).toBe(0);
    expect(clock.timers.size).toBe(1);
    expect([...clock.timers.values()][0].delay).toBeCloseTo(100, 6);

    clock.setNow(100);
    clock.runTimer();
    expect(clock.frames.size).toBe(1);
    clock.runFrame(100);

    expect(clock.paints()).toBe(1);
    expect(clock.frames.size).toBe(0);
    expect(clock.timers.size).toBe(1);
  });

  it('stops completely while inactive and restarts only when explicitly woken', () => {
    const clock = makeClock({ active: false, intervalMs: 100 });
    clock.scheduler.start();
    expect(clock.frames.size).toBe(0);
    expect(clock.timers.size).toBe(0);

    clock.setNow(500);
    clock.setActive(true);
    clock.scheduler.wake();
    expect(clock.frames.size).toBe(1);
    expect(clock.timers.size).toBe(0);
  });

  it('treats any explicit WebGL paint as fresh idle budget without rescheduling on every paint', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    const originalTimer = [...clock.timers.keys()][0];

    clock.setNow(60);
    clock.scheduler.markPaint(60);
    expect([...clock.timers.keys()]).toEqual([originalTimer]);

    clock.setNow(100);
    clock.runTimer(originalTimer);
    clock.runFrame(100);
    expect(clock.paints()).toBe(0);
    expect(clock.timers.size).toBe(1);
    expect([...clock.timers.values()][0].delay).toBeCloseTo(60, 6);
  });

  it('switches to RAF cadence only for a dirty fast camera deadline', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    expect(clock.timers.size).toBe(1);

    clock.setNow(20);
    clock.changeInterval(16);
    clock.scheduler.wake();
    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(1);

    clock.runFrame(20);
    expect(clock.paints()).toBe(1);
  });

  it('disposes both pending timer and RAF work', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    expect(clock.timers.size).toBe(1);
    clock.scheduler.dispose();
    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(0);
    expect(clock.scheduler.getDebugState().disposed).toBe(true);
  });
});
