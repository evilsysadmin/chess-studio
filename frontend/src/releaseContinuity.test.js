import { describe, expect, it, vi } from 'vitest';
import { installReleaseContinuity, isChunkLoadFailure, requestReleaseReload, shouldDeferReleaseReload } from './releaseContinuity.js';

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
  it('ofrece actualizar sólo desde Home y nunca interrumpe un modo nuevo o embebido', () => {
    expect(shouldDeferReleaseReload('menu')).toBe(false);
    expect(shouldDeferReleaseReload('menu', { combatBattleUiActive: true })).toBe(true);
    for (const view of ['game', 'tournamentGame', 'pvpGame', 'combat', 'puzzle',
      'chronicles', 'tactics', 'football', 'chesscom', 'pawnSlug', 'training', 'futureMode',
      'replay', 'lab', null]) {
      expect(shouldDeferReleaseReload(view)).toBe(true);
    }
  });


  it('reconoce los errores típicos de chunks viejos de Vite y React.lazy', () => {
    expect(isChunkLoadFailure(new TypeError('Failed to fetch dynamically imported module: /assets/Game.js'))).toBe(true);
    expect(isChunkLoadFailure(new Error('Loading chunk 42 failed'))).toBe(true);
    expect(isChunkLoadFailure(new TypeError("Cannot read properties of undefined (reading 'default')"))).toBe(true);
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
