import { describe, expect, it } from 'vitest';
import { ADMIN_IDENTITY_RETRY_DELAYS_MS, PROFILE_BOOTSTRAP_RETRY_DELAYS_MS, resolveAuthenticatedBootstrap } from './useAuthenticatedApp.js';
import { sortUnifiedHistory } from './useReplayLibrary.js';

describe('App lifecycle extraction', () => {
  it('no monta la app con caché local cuando el perfil remoto está offline', () => {
    expect(resolveAuthenticatedBootstrap({ status: 'offline' }, { isAdmin: true })).toMatchObject({ action: 'wait', ready: false, isAdminUser: false });
    expect(resolveAuthenticatedBootstrap({ status: 'loaded' }, { isAdmin: true })).toMatchObject({ action: 'ready', ready: true, isAdminUser: true });
  });

  it('distingue Mongo 503 de un backend transitorio sin culpar a Mongo por cualquier error', () => {
    const mongo = resolveAuthenticatedBootstrap({ status: 'offline', httpStatus: 503, detail: 'MongoDB no está lista.' }, null);
    const deploy = resolveAuthenticatedBootstrap({ status: 'offline', httpStatus: 502, detail: 'Bad gateway' }, null);
    expect(mongo.syncError).toMatch(/MongoDB/);
    expect(deploy.syncError).toMatch(/desplegándose|temporalmente/);
    expect(deploy.syncError).not.toMatch(/MongoDB no está disponible/);
  });

  it('reintenta bootstrap transitorio durante aproximadamente un minuto antes de rendirse', () => {
    expect(PROFILE_BOOTSTRAP_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 15000, 30000]);
    expect(PROFILE_BOOTSTRAP_RETRY_DELAYS_MS.reduce((sum, value) => sum + value, 0)).toBe(60000);
  });

  it('recupera identidad admin en segundo plano sin bloquear el perfil ya cargado', () => {
    expect(ADMIN_IDENTITY_RETRY_DELAYS_MS).toEqual([2000, 5000, 15000, 30000]);
    expect(resolveAuthenticatedBootstrap({ status: 'loaded' }, null)).toMatchObject({ action: 'ready', ready: true, isAdminUser: false });
  });

  it('historial unificado conserva orden descendente sin distinguir normal/Combat', () => {
    const result = sortUnifiedHistory([{ id: 'old', date: '2026-01-01T00:00:00Z' }], [{ id: 'new', date: '2026-02-01T00:00:00Z' }]);
    expect(result.map((item) => item.id)).toEqual(['new', 'old']);
  });
});
