import { describe, expect, it, vi } from 'vitest';
import { startVisiblePolling } from './useAdminFeedbackInbox.js';

function fakeDocument(visibilityState = 'visible') {
  const listeners = new Map();
  return {
    visibilityState,
    addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
    removeEventListener: vi.fn((name, listener) => {
      if (listeners.get(name) === listener) listeners.delete(name);
    }),
    emit(name) {
      listeners.get(name)?.();
    },
  };
}

describe('admin feedback inbox polling', () => {
  it('detiene el intervalo al ocultarse y refresca inmediatamente al volver', () => {
    const doc = fakeDocument('visible');
    const refresh = vi.fn();
    const setIntervalFn = vi.fn()
      .mockReturnValueOnce(11)
      .mockReturnValueOnce(22);
    const clearIntervalFn = vi.fn();

    const cleanup = startVisiblePolling({
      refresh,
      doc,
      setIntervalFn,
      clearIntervalFn,
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).toHaveBeenCalledTimes(1);

    doc.visibilityState = 'hidden';
    doc.emit('visibilitychange');
    expect(clearIntervalFn).toHaveBeenCalledWith(11);

    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(setIntervalFn).toHaveBeenCalledTimes(2);

    cleanup();
    expect(clearIntervalFn).toHaveBeenLastCalledWith(22);
    expect(doc.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });

  it('no hace polling si monta ya oculto hasta recuperar visibilidad', () => {
    const doc = fakeDocument('hidden');
    const refresh = vi.fn();
    const setIntervalFn = vi.fn(() => 31);
    const clearIntervalFn = vi.fn();

    const cleanup = startVisiblePolling({ refresh, doc, setIntervalFn, clearIntervalFn });

    expect(refresh).not.toHaveBeenCalled();
    expect(setIntervalFn).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(setIntervalFn).toHaveBeenCalledTimes(1);

    cleanup();
    expect(clearIntervalFn).toHaveBeenCalledWith(31);
  });
});
