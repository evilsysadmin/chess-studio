import { describe, expect, it } from 'vitest';
import { activeClockColor, createVisibleClockTicker, elapsedClockSeconds, fallenClockColor } from './useGameClock.js';

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

  it('usa tiempo monotónico durante juego visible y wall-clock sólo al reanudar de sleep', () => {
    expect(elapsedClockSeconds({
      resumed: false,
      previousPerf: 1000,
      currentPerf: 1200,
      previousWall: 50_000,
      currentWall: 3_650_000,
    })).toBeCloseTo(0.2, 6);

    // Simula un dispositivo donde performance.now() queda prácticamente
    // congelado durante una hora de suspensión profunda.
    expect(elapsedClockSeconds({
      resumed: true,
      previousPerf: 1200,
      currentPerf: 1201,
      previousWall: 50_000,
      currentWall: 3_650_000,
    })).toBeCloseTo(3600, 6);

    // Un reloj de sistema que retrocede nunca puede regalar tiempo negativo.
    expect(elapsedClockSeconds({
      resumed: true,
      previousPerf: 1200,
      currentPerf: 1400,
      previousWall: 50_000,
      currentWall: 49_000,
    })).toBe(0);
  });

  it('detiene el ticker al ocultarse, marca la reconciliación al volver y limpia listeners', () => {
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
    const tickEvents = [];
    let nextIntervalId = 1;

    const stop = createVisibleClockTicker({
      tick: (event) => { tickEvents.push(event); },
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
    [...activeIntervals.values()][0].callback();
    expect(tickEvents).toEqual([{ resumed: false }]);

    doc.visibilityState = 'hidden';
    listeners.get('visibilitychange')();
    expect(activeIntervals.size).toBe(0);
    expect(cleared).toEqual([1]);

    doc.visibilityState = 'visible';
    listeners.get('visibilitychange')();
    expect(tickEvents).toEqual([{ resumed: false }, { resumed: true }]);
    expect(activeIntervals.size).toBe(1);

    stop();
    expect(activeIntervals.size).toBe(0);
    expect(cleared).toEqual([1, 2]);
    expect(listeners.has('visibilitychange')).toBe(false);
  });
});
