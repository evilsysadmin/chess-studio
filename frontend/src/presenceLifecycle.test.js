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
  it('anuncia montaje, background con debounce y foreground inmediato', () => {
    const win = target();
    const doc = target();
    const touch = vi.fn();
    let intervalFn;
    let pendingTimeout;
    const release = bindPresenceLifecycle('Partida', {
      win, doc, touch,
      leave: vi.fn(),
      setIntervalFn: (fn) => { intervalFn = fn; return 7; },
      clearIntervalFn: vi.fn(),
      setTimeoutFn: (fn) => { pendingTimeout = fn; return 9; },
      clearTimeoutFn: vi.fn(),
    });

    expect(touch).toHaveBeenCalledWith('Partida', true);
    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    expect(touch).toHaveBeenCalledTimes(1);
    pendingTimeout();
    expect(touch).toHaveBeenLastCalledWith('Partida', false);

    doc.visibilityState = 'visible';
    doc.fire('visibilitychange');
    expect(touch).toHaveBeenLastCalledWith('Partida', true);
    intervalFn();
    expect(touch).toHaveBeenLastCalledWith('Partida', true);
    release();
  });

  it('pagehide cancela el touch de background pendiente y cierra la sesión', () => {
    const win = target();
    const doc = target();
    const touch = vi.fn();
    const leave = vi.fn(() => Promise.resolve(true));
    let pendingTimeout;
    const clearTimeoutFn = vi.fn();
    const release = bindPresenceLifecycle('Home', {
      win, doc, touch, leave,
      setIntervalFn: () => 1,
      clearIntervalFn: vi.fn(),
      setTimeoutFn: (fn) => { pendingTimeout = fn; return 12; },
      clearTimeoutFn,
    });

    doc.visibilityState = 'hidden';
    doc.fire('visibilitychange');
    win.fire('pagehide');
    expect(clearTimeoutFn).toHaveBeenCalledWith(12);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(touch).toHaveBeenCalledTimes(1);
    // Incluso si un scheduler de test conserva la referencia, el contrato
    // observable antes de pagehide no ha emitido otro heartbeat.
    expect(typeof pendingTimeout).toBe('function');
    win.fire('pageshow');
    expect(touch).toHaveBeenCalledTimes(2);
    expect(touch).toHaveBeenLastCalledWith('Home', true);
    release();
    expect(win.removeEventListener).toHaveBeenCalledWith('pageshow', expect.any(Function));
  });
});
