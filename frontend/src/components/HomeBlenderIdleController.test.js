import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHomeBlenderIdleController, HOME_BLENDER_IDLE_SLEEP_MS } from './HomeBlenderIdleController.js';

function fixture() {
  const handlers = new Map();
  const host = {
    addEventListener: (event, callback) => handlers.set(event, callback),
    removeEventListener: (event, callback) => {
      if (handlers.get(event) === callback) handlers.delete(event);
    },
  };
  const win = { setTimeout: vi.fn(setTimeout), clearTimeout: vi.fn(clearTimeout) };
  const onSleep = vi.fn();
  const onWake = vi.fn();
  const controller = createHomeBlenderIdleController({ host, win, onSleep, onWake, now: () => vi.getMockedSystemTime().getTime() });
  return { controller, win, onSleep, onWake, handlers, emit: (event) => handlers.get(event)?.() };
}

describe('Home ambient idle lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => vi.useRealTimers());

  it('does no work before readiness and sleeps without leaving polling timers', () => {
    const f = fixture();
    f.emit('pointermove');
    expect(vi.getTimerCount()).toBe(0);
    f.controller.setEnabled(true);
    vi.advanceTimersByTime(HOME_BLENDER_IDLE_SLEEP_MS - 1);
    expect(f.onSleep).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.controller.sleeping).toBe(true);
    expect(f.onSleep).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(120_000);
    expect(f.onSleep).toHaveBeenCalledTimes(1);
    expect(f.onWake).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it('extends the deadline without allocating a timer on every pointer event', () => {
    const f = fixture();
    f.controller.setEnabled(true);
    vi.advanceTimersByTime(5_000);
    for (let i = 0; i < 500; i += 1) f.emit('pointermove');
    expect(f.win.setTimeout).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(25_000);
    expect(f.onSleep).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(5_000);
    expect(f.onSleep).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    f.controller.dispose();
  });

  it.each(['pointermove', 'pointerdown', 'wheel', 'keydown', 'focusin'])('wakes once on %s and keeps one deadline', (event) => {
    const f = fixture();
    f.controller.setEnabled(true);
    vi.advanceTimersByTime(HOME_BLENDER_IDLE_SLEEP_MS);
    f.emit(event);
    f.emit(event);
    expect(f.controller.sleeping).toBe(false);
    expect(f.onWake).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(HOME_BLENDER_IDLE_SLEEP_MS);
    expect(f.onSleep).toHaveBeenCalledTimes(2);
    f.controller.dispose();
  });

  it('stays disabled offscreen/reduced/software and starts a fresh budget on return', () => {
    const f = fixture();
    f.controller.setEnabled(true);
    vi.advanceTimersByTime(20_000);
    f.controller.setEnabled(false);
    f.emit('keydown');
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.onSleep).not.toHaveBeenCalled();
    expect(f.onWake).not.toHaveBeenCalled();
    f.controller.setEnabled(true);
    vi.advanceTimersByTime(20_000);
    f.controller.setEnabled(true); // repeat visibility/layout notification
    vi.advanceTimersByTime(10_000);
    expect(f.onSleep).toHaveBeenCalledTimes(1);
    f.controller.dispose();
  });

  it('cleans listeners, pending work and stale callbacks on unmount', () => {
    const f = fixture();
    f.controller.setEnabled(true);
    const staleInput = f.handlers.get('pointerdown');
    const staleDeadline = f.win.setTimeout.mock.calls[0][0];
    f.controller.dispose();
    expect(f.handlers.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    staleInput();
    staleDeadline();
    f.controller.setEnabled(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.onWake).not.toHaveBeenCalled();
    expect(f.onSleep).not.toHaveBeenCalled();
  });
});
