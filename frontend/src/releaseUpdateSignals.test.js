import { describe, expect, it, vi } from 'vitest';
import { bindReleaseUpdateSignals } from './releaseUpdate.js';

function fakeEventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener: vi.fn((type, handler) => listeners.set(type, handler)),
    removeEventListener: vi.fn((type, handler) => {
      if (listeners.get(type) === handler) listeners.delete(type);
    }),
    emit(type) {
      return listeners.get(type)?.();
    },
    has(type) {
      return listeners.has(type);
    },
  };
}

describe('release update signals', () => {
  it('rechecks immediately when a visible app regains window focus', () => {
    let intervalCallback = null;
    const windowObj = fakeEventTarget({
      setInterval: vi.fn((callback) => {
        intervalCallback = callback;
        return 42;
      }),
      clearInterval: vi.fn(),
    });
    const documentObj = fakeEventTarget({ visibilityState: 'visible' });
    const check = vi.fn();

    const cleanup = bindReleaseUpdateSignals({
      check,
      windowObj,
      documentObj,
      intervalMs: 1234,
    });

    expect(windowObj.addEventListener).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(documentObj.addEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(windowObj.setInterval).toHaveBeenCalledWith(expect.any(Function), 1234);

    windowObj.emit('focus');
    expect(check).toHaveBeenCalledTimes(1);

    documentObj.visibilityState = 'hidden';
    windowObj.emit('focus');
    intervalCallback();
    expect(check).toHaveBeenCalledTimes(1);

    documentObj.visibilityState = 'visible';
    documentObj.emit('visibilitychange');
    intervalCallback();
    expect(check).toHaveBeenCalledTimes(3);

    cleanup();
    expect(windowObj.clearInterval).toHaveBeenCalledWith(42);
    expect(windowObj.has('focus')).toBe(false);
    expect(documentObj.has('visibilitychange')).toBe(false);
  });

  it('is a no-op outside a browser-like environment', () => {
    expect(() => bindReleaseUpdateSignals({ check: vi.fn(), windowObj: null, documentObj: null })()).not.toThrow();
  });
});
