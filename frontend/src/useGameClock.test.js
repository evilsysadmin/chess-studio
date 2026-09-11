import { describe, expect, it } from 'vitest';
import { activeClockColor, createVisibleClockTicker, fallenClockColor } from './useGameClock.js';

describe('game clock orchestration', () => {
  it('durante la espera de CPU cobra tiempo al bando contrario al humano', () => {
    expect(activeClockColor({ busy: true, humanColor: 'w', turn: 'w' })).toBe('b');
    expect(activeClockColor({ busy: false, humanColor: 'w', turn: 'b' })).toBe('b');
  });

  it('la bandera identifica el primer reloj agotado sin inventar caída si ambos siguen vivos', () => {
    expect(fallenClockColor(0, 12)).toBe('w');
    expect(fallenClockColor(20, -0.1)).toBe('b');
    expect(fallenClockColor(20, 12)).toBeNull();
  });

  it('detiene el ticker al ocultarse, reconcilia al volver y limpia listeners', () => {
    const listeners = new Map();
    const doc = {
      visibilityState: 'visible',
      addEventListener: (name, listener) => listeners.set(name, listener),
      removeEventListener: (name, listener) => {
        if (listeners.get(name) === listener) listeners.delete(name);
      },
    };
    const activeIntervals = new Map();
    const cleared = [];
    let nextIntervalId = 1;
    let ticks = 0;

    const stop = createVisibleClockTicker({
      tick: () => { ticks += 1; },
      doc,
      setIntervalFn: (callback, delay) => {
        const id = nextIntervalId;
        nextIntervalId += 1;
        activeIntervals.set(id, { callback, delay });
        return id;
      },
      clearIntervalFn: (id) => {
        cleared.push(id);
        activeIntervals.delete(id);
      },
    });

    expect(activeIntervals.size).toBe(1);
    expect([...activeIntervals.values()][0].delay).toBe(200);

    doc.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    expect(activeIntervals.size).toBe(0);
    expect(cleared).toEqual([1]);
    expect(ticks).toBe(0);

    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    expect(ticks).toBe(1);
    expect(activeIntervals.size).toBe(1);

    stop();
    expect(activeIntervals.size).toBe(0);
    expect(cleared).toEqual([1, 2]);
    expect(listeners.has('visibilitychange')).toBe(false);
  });
});
