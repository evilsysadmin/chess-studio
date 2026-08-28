import { describe, expect, it, vi } from 'vitest';
import { runLogoutLifecycle } from './logoutLifecycle.js';

describe('logout lifecycle', () => {
  it('cierra presencia antes de esperar al guardado y luego limpia sesión', async () => {
    const order = [];
    let releaseSave;
    const saveProfile = vi.fn(() => new Promise((resolve) => { releaseSave = () => { order.push('saved'); resolve(); }; }));
    const closePresence = vi.fn(() => { order.push('presence'); return Promise.resolve(true); });
    const clearSession = vi.fn(() => order.push('cleared'));

    const pending = runLogoutLifecycle({ saveProfile, closePresence, clearSession });
    expect(order).toEqual(['presence']);
    releaseSave();
    await pending;
    expect(order).toEqual(['presence', 'saved', 'cleared']);
  });

  it('si guardar falla, mantiene la sesión y reanuncia presencia', async () => {
    const clearSession = vi.fn();
    const restorePresence = vi.fn();
    await expect(runLogoutLifecycle({
      saveProfile: () => Promise.reject(Object.assign(new Error('offline'), { status: 503 })),
      closePresence: () => Promise.resolve(true),
      restorePresence,
      clearSession,
    })).rejects.toThrow('offline');
    expect(clearSession).not.toHaveBeenCalled();
    expect(restorePresence).toHaveBeenCalledTimes(1);
  });

  it('un 401 termina el logout aunque ya no se pueda guardar', async () => {
    const clearSession = vi.fn();
    const result = await runLogoutLifecycle({
      saveProfile: () => Promise.reject(Object.assign(new Error('expired'), { status: 401 })),
      closePresence: () => Promise.resolve(true),
      restorePresence: vi.fn(),
      clearSession,
    });
    expect(result).toEqual({ loggedOut: true, reason: 'unauthorized' });
    expect(clearSession).toHaveBeenCalledTimes(1);
  });
});
