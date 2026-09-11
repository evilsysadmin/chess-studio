import { describe, expect, it, vi } from 'vitest';
import { bindPresenceLifecycle } from './presenceLifecycle.js';

function target(visibilityState = 'visible') {
  const handlers = new Map();
  return {
    visibilityState,
    addEventListener: vi.fn((type, fn) => handlers.set(type, fn)),
    removeEventListener: vi.fn((type, fn) => { if (handlers.get(type) === fn) handlers.delete(type); }),
    fire(type) { handlers.get(type)?.(); },
  };
}

describe('ciclo de presencia por pestaña', () => {
  it('anuncia montaje, pausa heartbeat en background y lo rearma al volver', () => {
    const win = target();
    const doc = target();
    const touch = vi.fn();
    let intervalFn;
    let nextIntervalId = 7;
    let pendingTimeout;
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn((fn) => {
      intervalFn = fn;
      const id = nextIntervalId;
      nextIntervalId += 1;
      return id;
    });
    const release = bindPresenceLifecycle('Partida', {
      win, doc, touch,
      leave: vi.fn(),
      setIntervalFn,
      clearIntervalFn,
      setTimeoutFn: (fn) => { pendingTimeout = fn; return 9; },
      clearTimeoutFn: vi.fn(),
    });

    expect(touch).toHaveBeenCalledWith('Partida', true);
    expect(setIntervalFn).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(clearIntervalFn).toHaveBeenCalledWith(7);
    expect(touch).toHaveBeenCalledTimes(1);
    pendingTimeout();
    expect(touch).toHaveBeenLastCalledWith('Partida', false);

    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(touch).toHaveBeenLastCalledWith('Partida', true);
    expect(setIntervalFn).toHaveBeenCalledTimes(2);
    intervalFn();
    expect(touch).toHaveBeenLastCalledWith('Partida', true);

    release();
    expect(clearIntervalFn).toHaveBeenLastCalledWith(8);
  });

  it('pagehide cancela el touch de background pendiente, para heartbeat y cierra la sesión', () => {
    const win = target();
    const doc = target();
    const touch = vi.fn();
    const leave = vi.fn(() => Promise.resolve(true));
    let pendingTimeout;
    let nextIntervalId = 1;
    const clearTimeoutFn = vi.fn();
    const clearIntervalFn = vi.fn();
    const setIntervalFn = vi.fn(() => {
      const id = nextIntervalId;
      nextIntervalId += 1;
      return id;
    });
    const release = bindPresenceLifecycle('Home', {
      win, doc, touch, leave,
      setIntervalFn,
      clearIntervalFn,
      setTimeoutFn: (fn) => { pendingTimeout = fn; return 12; },
      clearTimeoutFn,
    });

    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    win.fire('pagehide');
    expect(clearTimeoutFn).toHaveBeenCalledWith(12);
    expect(clearIntervalFn).toHaveBeenCalledWith(1);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledTimes(1);
    // Incluso si un scheduler de test conserva la referencia, el contrato
    // observable antes de pagehide no ha emitido otro heartbeat.
    expect(typeof pendingTimeout).toBe('function');
    // Un pageshow mientras el documento sigue oculto no debe resucitar la
    // presencia como foreground. En una restauración bfcache real el
    // documento vuelve a visible antes (o junto) al pageshow relevante.
    win.fire('pageshow');
    expect(touch).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'visible';
    win.fire('pageshow');
    expect(touch).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenLastCalledWith('Home', true);
    expect(setIntervalFn).toHaveBeenCalledTimes(2);

    release();
    expect(clearIntervalFn).toHaveBeenLastCalledWith(2);
    expect(win.removeEventListener).toHaveBeenCalledWith('pageshow', expect.any(Function));
  });
});
