import { describe, expect, it } from 'vitest';
import { createClockRuntime } from './clockRuntime.js';
import { createVisibleClockTicker, fallenClockColor } from './useGameClock.js';

describe('clock sleep/resume resilience', () => {
  it.each([
    ['5 minutes', 5 * 60],
    ['1 hour', 60 * 60],
    ['1 day', 24 * 60 * 60],
  ])('reconciles a %s hidden gap exactly once on foreground', (_label, hiddenSeconds) => {
    const listeners = new Map();
    const doc = {
      visibilityState: 'visible',
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => {
        if (listeners.get(name) === listener) listeners.delete(name);
      },
    };
    const intervals = new Map();
    let nextIntervalId = 1;
    let monotonicSeconds = 100;
    let lastTickSeconds = monotonicSeconds;
    let reconcileCount = 0;
    const runtime = createClockRuntime({ whiteTime: 600, blackTime: 600, tickingColor: 'w' });

    const tick = () => {
      const elapsed = Math.max(0, monotonicSeconds - lastTickSeconds);
      lastTickSeconds = monotonicSeconds;
      runtime.advance('w', elapsed);
      reconcileCount += 1;
    };

    const stop = createVisibleClockTicker({
      tick,
      doc,
      setIntervalFn: (callback, delay) => {
        const id = nextIntervalId++;
        intervals.set(id, { callback, delay });
        return id;
      },
      clearIntervalFn: (id) => intervals.delete(id),
    });

    expect(intervals.size).toBe(1);
    doc.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    expect(intervals.size).toBe(0);

    monotonicSeconds += hiddenSeconds;
    expect(runtime.getTime('w')).toBe(600);

    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')();

    expect(reconcileCount).toBe(1);
    expect(runtime.getTime('w')).toBe(Math.max(0, 600 - hiddenSeconds));
    expect(fallenClockColor(runtime.getTime('w'), runtime.getTime('b'))).toBe(hiddenSeconds >= 600 ? 'w' : null);
    expect(intervals.size).toBe(1);

    // Un visibilitychange visible redundante no crea otro interval ni vuelve a
    // cobrar el mismo hueco, porque el marcador monotónico ya fue reconciliado.
    listeners.get('visibilitychange')();
    expect(reconcileCount).toBe(2);
    expect(runtime.getTime('w')).toBe(Math.max(0, 600 - hiddenSeconds));
    expect(intervals.size).toBe(1);

    stop();
    expect(intervals.size).toBe(0);
    expect(listeners.size).toBe(0);
  });
});
