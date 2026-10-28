import { describe, expect, it } from 'vitest';
import { createWarRoomAmbientScheduler } from './WarRoomAmbientScheduler.js';

function makeClock({ active = true, intervalMs = 100, ambientMarksPaint = false, keepAmbientAwake = false } = {}) {
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
    keepAmbientAwake,
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
    onFrame: () => { paints += 1; if (ambientMarksPaint) scheduler.markPaint(nowMs); },
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

  it('halves only the settled ambient heartbeat and restores it after a real paint', () => {
    const clock = makeClock({ intervalMs: 100, ambientMarksPaint: true });
    clock.scheduler.start();

    // Jump past the quiet threshold to demonstrate that ambient renderNow()
    // calls to markPaint() do not accidentally reset the inactivity timer.
    clock.setNow(12_000);
    clock.runTimer();
    clock.runFrame(12_000);
    expect(clock.paints()).toBe(1);
    expect([...clock.timers.values()][0].delay).toBeCloseTo(200, 6);
    expect(clock.scheduler.getDebugState().lastNonAmbientPaintAt).toBe(0);

    // A genuine state change renders outside the ambient callback: wake and
    // return to 100 ms cadence without sacrificing that state-change paint.
    clock.setNow(12_020);
    clock.scheduler.markPaint(12_020);
    expect(clock.frames.size).toBe(0);
    expect(clock.timers.size).toBe(1);
    expect([...clock.timers.values()][0].delay).toBeCloseTo(100, 6);
    expect(clock.scheduler.getDebugState().lastNonAmbientPaintAt).toBe(12_020);

    // Mobile's 150 ms idle interval scales proportionally; direct 16 ms
    // camera/animation work must never be slowed by the settled policy.
    const mobile = makeClock({ intervalMs: 150 });
    mobile.scheduler.start();
    mobile.setNow(12_000);
    mobile.runTimer();
    mobile.runFrame(12_000);
    expect([...mobile.timers.values()][0].delay).toBeCloseTo(300, 6);

    const narrative = makeClock({ intervalMs: 100, keepAmbientAwake: true });
    narrative.scheduler.start();
    narrative.setNow(12_000);
    narrative.runTimer();
    narrative.runFrame(12_000);
    expect([...narrative.timers.values()][0].delay).toBeCloseTo(100, 6);
    expect(narrative.scheduler.getDebugState().narrativeAwake).toBe(true);

    const fast = makeClock({ intervalMs: 16 });
    fast.scheduler.start();
    fast.setNow(12_000);
    fast.runFrame(12_000);
    expect(fast.frames.size).toBe(1);
    expect(fast.timers.size).toBe(0);
  });

  it('restores full cadence on first input after 12s without rescheduling every pointer move', () => {
    const clock = makeClock({ intervalMs: 100, ambientMarksPaint: true });
    clock.scheduler.start();
    clock.setNow(12_000);
    clock.runTimer();
    clock.runFrame();
    expect([...clock.timers.values()][0].delay).toBeCloseTo(200, 6);

    clock.setNow(12_020);
    clock.scheduler.markInteraction();
    const nextTimer = [...clock.timers.entries()][0];
    expect(nextTimer[1].delay).toBeCloseTo(80, 6);
    expect(clock.scheduler.getDebugState().lastNonAmbientPaintAt).toBe(12_020);

    clock.setNow(12_030);
    clock.scheduler.markInteraction();
    expect([...clock.timers.keys()]).toEqual([nextTimer[0]]);
    clock.scheduler.dispose();
    expect(clock.timers.size).toBe(0);
  });

  it('enters zero-WebGL deep sleep after 30 seconds and wakes on real interaction', () => {
    const clock = makeClock({ intervalMs: 100, ambientMarksPaint: true });
    clock.scheduler.start();

    clock.setNow(29_999);
    clock.runTimer();
    clock.runFrame(29_999);
    expect(clock.paints()).toBe(1);
    expect(clock.timers.size).toBe(1);

    clock.setNow(30_250);
    clock.runTimer();
    clock.runFrame(30_250);
    expect(clock.paints()).toBe(1);
    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(0);
    expect(clock.scheduler.getDebugState().deepSleeping).toBe(true);

    clock.setNow(30_260);
    clock.scheduler.markInteraction(30_260);
    expect(clock.scheduler.getDebugState().deepSleeping).toBe(false);
    expect(clock.frames.size).toBe(1);
    clock.runFrame(30_260);
    expect(clock.paints()).toBe(2);
    expect(clock.timers.size).toBe(1);
    clock.scheduler.dispose();
    expect(clock.timers.size).toBe(0);
  });

  it('keeps narrative ambience alive past the deep-sleep threshold', () => {
    const clock = makeClock({ intervalMs: 100, keepAmbientAwake: true });
    clock.scheduler.start();
    clock.setNow(30_000);
    clock.runTimer();
    clock.runFrame(30_000);
    expect(clock.paints()).toBe(1);
    expect(clock.timers.size).toBe(1);
  });

  it('does not falsely report deep sleep while a long Hans narrative is still painting', () => {
    const narrative = makeClock({ intervalMs: 100, keepAmbientAwake: true });
    narrative.scheduler.start();
    narrative.setNow(32_000);
    narrative.runTimer();
    narrative.runFrame();
    const state = narrative.scheduler.getDebugState();
    expect(state).toMatchObject({
      inactive: false, narrativeAwake: true, deepSleeping: false, timerPending: true,
    });
    expect(narrative.paints()).toBe(1);
    narrative.scheduler.dispose();
  });

  it('reports a hidden/offscreen surface as inactive, not as a deep-sleep measurement', () => {
    const clock = makeClock({ active: false });
    clock.scheduler.start();
    clock.setNow(33_000);
    expect(clock.scheduler.getDebugState()).toMatchObject({
      inactive: true, narrativeAwake: false, deepSleeping: false,
      timerPending: false, rafPending: false,
    });
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

  it('cancels an existing idle deadline when scrolled away and paints again on re-entry', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    expect(clock.timers.size).toBe(1);

    clock.setNow(40);
    clock.setActive(false);
    clock.scheduler.wake();
    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(0);

    clock.setNow(500);
    clock.setActive(true);
    clock.scheduler.wake();
    expect(clock.frames.size).toBe(1);
    clock.runFrame(500);
    expect(clock.paints()).toBe(1);
    expect(clock.timers.size).toBe(1);

    clock.scheduler.dispose();
    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(0);
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

  it('dispose is idempotent and wake/start stay inert afterwards', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    clock.scheduler.dispose();
    clock.scheduler.dispose();
    clock.scheduler.wake();
    clock.scheduler.start();

    expect(clock.timers.size).toBe(0);
    expect(clock.frames.size).toBe(0);
    expect(clock.paints()).toBe(0);
    expect(clock.scheduler.getDebugState().disposed).toBe(true);
  });

  it('ignores stale timer and RAF callbacks that arrive after disposal', () => {
    const clock = makeClock({ intervalMs: 100 });
    clock.scheduler.start();
    const staleTimer = [...clock.timers.values()][0]?.callback;

    clock.scheduler.dispose();
    staleTimer?.();
    expect(clock.frames.size).toBe(0);
    expect(clock.timers.size).toBe(0);
    expect(clock.paints()).toBe(0);

    const fast = makeClock({ intervalMs: 16 });
    fast.scheduler.start();
    const staleFrame = [...fast.frames.values()][0];
    fast.scheduler.dispose();
    staleFrame?.(16);
    expect(fast.frames.size).toBe(0);
    expect(fast.timers.size).toBe(0);
    expect(fast.paints()).toBe(0);
  });

  it('survives repeated mount-like start/dispose cycles without pending work', () => {
    for (let index = 0; index < 50; index += 1) {
      const clock = makeClock({ intervalMs: index % 2 ? 16 : 100 });
      clock.scheduler.start();
      clock.scheduler.dispose();
      expect(clock.frames.size).toBe(0);
      expect(clock.timers.size).toBe(0);
      expect(clock.paints()).toBe(0);
    }
  });
});
