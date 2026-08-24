import { describe, expect, it } from 'vitest';
import { resolveAuthenticatedBootstrap } from './useAuthenticatedApp.js';
import { sortUnifiedHistory } from './useReplayLibrary.js';

describe('App lifecycle extraction', () => {
  it('no monta la app con caché local cuando el perfil remoto está offline', () => {
    expect(resolveAuthenticatedBootstrap({ status: 'offline' }, { isAdmin: true })).toMatchObject({ action: 'wait', ready: false, isAdminUser: false });
    expect(resolveAuthenticatedBootstrap({ status: 'loaded' }, { isAdmin: true })).toMatchObject({ action: 'ready', ready: true, isAdminUser: true });
  });

  it('historial unificado conserva orden descendente sin distinguir normal/Combat', () => {
    const result = sortUnifiedHistory([{ id: 'old', date: '2026-01-01T00:00:00Z' }], [{ id: 'new', date: '2026-02-01T00:00:00Z' }]);
    expect(result.map((item) => item.id)).toEqual(['new', 'old']);
  });
});
