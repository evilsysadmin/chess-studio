import { describe, expect, it, vi } from 'vitest';
import { installReleaseContinuity, isChunkLoadFailure, requestReleaseReload } from './releaseContinuity.js';

function fakeStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
  };
}

function fakeWindow() {
  const handlers = new Map();
  return {
    addEventListener(type, fn) { handlers.set(type, fn); },
    removeEventListener(type, fn) { if (handlers.get(type) === fn) handlers.delete(type); },
    emit(type, event) { handlers.get(type)?.(event); },
  };
}

describe('continuidad entre releases', () => {
  it('reconoce los errores típicos de chunks viejos de Vite', () => {
    expect(isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/Game.js'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading chunk 42 failed'))).toBe(true);
    expect(isChunkLoadFailure(new Error('movimiento ilegal'))).toBe(false);
  });

  it('recarga una vez y aplica cooldown para evitar bucles', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    expect(requestReleaseReload({ storage, reload, now: 10_000 })).toBe(true);
    expect(requestReleaseReload({ storage, reload, now: 11_000 })).toBe(false);
    expect(requestReleaseReload({ storage, reload, now: 26_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('vite:preloadError fuerza refresh y un rechazo normal no', () => {
    const windowObj = fakeWindow();
    const storage = fakeStorage();
    const reload = vi.fn();
    const preventDefault = vi.fn();
    const uninstall = installReleaseContinuity({ windowObj, storage, reload, now: () => 20_000 });

    windowObj.emit('unhandledrejection', { reason: new Error('otra cosa'), preventDefault });
    expect(reload).not.toHaveBeenCalled();

    windowObj.emit('vite:preloadError', { preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    uninstall();
  });
});
