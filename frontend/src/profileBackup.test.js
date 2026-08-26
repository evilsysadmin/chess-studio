import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  exportProfile,
  importProfile,
  pullProfileFromServer,
  pushProfileToServer,
  resetProfileSyncStateForTests,
} from './profileBackup.js';
import {
  hasDirtyProfileForCurrentUser,
  profileDirtyStateForCurrentUser,
  setProfileStorageItem,
} from './profileKeys.js';

function response(status, body, requestId = null) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => requestId },
    json: async () => body,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetProfileSyncStateForTests();
});
afterEach(() => vi.unstubAllGlobals());

describe('export/import', () => {
  it('exporta progreso y preferencias, pero no la partida activa', () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 100 }));
    localStorage.setItem('chess-study-muted', '1');
    localStorage.setItem('chess-study-music-muted', '1');
    localStorage.setItem('chess-study-fx-muted', '0');
    localStorage.setItem('chess-study-voice-enabled', '1');
    localStorage.setItem('chess-study-active-game', 'algun-id');

    const exported = exportProfile();

    expect(exported.data['chess-study-tournament']).toBeDefined();
    expect(exported.data['chess-study-muted']).toBe('1');
    expect(exported.data['chess-study-music-muted']).toBe('1');
    expect(exported.data['chess-study-fx-muted']).toBe('0');
    expect(exported.data['chess-study-voice-enabled']).toBe('1');
    expect(exported.data['chess-study-active-game']).toBeUndefined();
  });

  it('incluye metadatos de trazabilidad sin exportar secretos de sesión', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-auth-token', 'jwt-secreto');
    const exported = exportProfile();
    expect(exported).toMatchObject({ app: 'estudio-de-ajedrez', version: 2, username: 'alice' });
    expect(exported.exportedAt).toEqual(expect.any(String));
    expect(exported.build).toEqual(expect.any(String));
    expect(JSON.stringify(exported)).not.toContain('jwt-secreto');
  });

  it('replace=true elimina claves viejas que no vienen en el backup', () => {
    localStorage.setItem('chess-study-achievements', JSON.stringify(['old']));
    const backup = { data: { 'chess-study-tournament': JSON.stringify({ points: 12 }) } };

    const restored = importProfile(backup, { replace: true });

    expect(restored).toBe(1);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 12 }));
    expect(localStorage.getItem('chess-study-achievements')).toBeNull();
  });

  it('rechaza JSON inválido y formatos ajenos', () => {
    expect(() => importProfile('no es json')).toThrow('JSON válido');
    expect(() => importProfile(JSON.stringify({ foo: 'bar' }))).toThrow('formato esperado');
  });

  it('una importación iniciada por el usuario queda dirty hasta que Mongo la confirme', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    const backup = { data: { 'chess-study-tournament': JSON.stringify({ points: 88 }) } };

    importProfile(backup, { replace: true, markDirty: true });

    expect(hasDirtyProfileForCurrentUser()).toBe(true);
  });

  it('una nueva escritura no hereda claves dirty de otra identidad', () => {
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-profile-dirty-user', 'bob');
    localStorage.setItem('chess-study-profile-dirty-keys', JSON.stringify(['chess-study-board-theme']));

    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 7 }));

    expect(profileDirtyStateForCurrentUser()).toEqual({
      dirty: true,
      valid: true,
      keys: ['chess-study-tournament'],
    });
  });
});

describe('pullProfileFromServer', () => {
  it('autorrepara un journal dirty corrupto usando Mongo sin intentar PATCH', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-profile-dirty-user', 'alice');
    localStorage.setItem('chess-study-profile-dirty-keys', '{esto-no-es-json');

    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      data: { 'chess-study-tournament': JSON.stringify({ points: 777 }) },
      revisions: { 'chess-study-tournament': 4 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('repaired-dirty');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 777 }));
    expect(hasDirtyProfileForCurrentUser()).toBe(false);
  });

  it('autorrepara una marca dirty incompleta sólo después de leer Mongo correctamente', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-profile-dirty-user', 'alice');

    const fetchMock = vi.fn().mockResolvedValue(response(200, { data: {}, revisions: {} }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('repaired-dirty-empty');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(hasDirtyProfileForCurrentUser()).toBe(false);
  });

  it('si Mongo falla no borra un journal dirty corrupto ni la caché local', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-profile-dirty-user', 'alice');
    localStorage.setItem('chess-study-profile-dirty-keys', 'roto');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(503, { detail: 'Mongo no disponible' })));

    const result = await pullProfileFromServer();

    expect(result.status).toBe('offline');
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 999 }));
    expect(localStorage.getItem('chess-study-profile-dirty-user')).toBe('alice');
    expect(localStorage.getItem('chess-study-profile-dirty-keys')).toBe('roto');
  });

  it('una marca dirty de otra identidad no se fusiona con la cuenta actual', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-profile-dirty-user', 'bob');
    localStorage.setItem('chess-study-profile-dirty-keys', JSON.stringify(['chess-study-tournament']));
    const fetchMock = vi.fn().mockResolvedValue(response(200, {
      data: { 'chess-study-tournament': JSON.stringify({ points: 111 }) },
      revisions: { 'chess-study-tournament': 2 },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('loaded');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 111 }));
    expect(localStorage.getItem('chess-study-profile-dirty-user')).toBeNull();
    expect(localStorage.getItem('chess-study-profile-dirty-keys')).toBeNull();
  });

  it('si quedó una caché sucia del mismo usuario, hace GET + PATCH para no perder progreso ni pisar claves ajenas', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 321 }));
    expect(hasDirtyProfileForCurrentUser()).toBe(true);

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, { data: {}, revisions: {} }))
      .mockResolvedValueOnce(response(200, {
        data: { 'chess-study-tournament': JSON.stringify({ points: 321 }) },
        revisions: { 'chess-study-tournament': 1 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('recovered-local');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][1].method).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].method).toBe('PATCH');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer alice-token');
    expect(hasDirtyProfileForCurrentUser()).toBe(false);
  });

  it('recuperar una clave dirty importa también cambios remotos independientes y no los revierte en el siguiente flush', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-board-theme', 'classic');
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 321 }));

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(200, {
        data: {
          'chess-study-tournament': JSON.stringify({ points: 300 }),
          'chess-study-board-theme': 'night',
        },
        revisions: { 'chess-study-tournament': 4, 'chess-study-board-theme': 8 },
      }))
      .mockResolvedValueOnce(response(200, {
        data: {
          'chess-study-tournament': JSON.stringify({ points: 321 }),
          'chess-study-board-theme': 'night',
        },
        revisions: { 'chess-study-tournament': 5, 'chess-study-board-theme': 8 },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('recovered-local');
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 321 }));
    expect(localStorage.getItem('chess-study-board-theme')).toBe('night');
    expect(hasDirtyProfileForCurrentUser()).toBe(false);

    // La caché ya coincide con la foto fusionada: el flush de cambio de vista
    // no debe volver a escribir el tema antiguo ni emitir otro PATCH.
    await pushProfileToServer({ throwOnError: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Mongo pisa la caché persistente antes de montar la app', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-achievements', JSON.stringify(['old']));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, {
      data: { 'chess-study-tournament': JSON.stringify({ points: 777 }) },
      revisions: { 'chess-study-tournament': 4 },
    })));

    const result = await pullProfileFromServer();

    expect(result.status).toBe('loaded');
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 777 }));
    expect(localStorage.getItem('chess-study-achievements')).toBeNull();
  });

  it('perfil remoto vacío limpia progreso pero conserva la partida activa de la misma sesión', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-active-game', 'mi-partida');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { data: {}, revisions: {} })));

    const result = await pullProfileFromServer();

    expect(result.status).toBe('empty');
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBe('mi-partida');
  });

  it('503/red caída se distingue de usuario nuevo y no toca la caché', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 123 }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(503, { detail: 'Mongo no disponible' })));

    const result = await pullProfileFromServer();

    expect(result.status).toBe('offline');
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 123 }));
  });

  it('401 se distingue para poder volver a la pantalla de login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { detail: 'Sesión expirada' })));
    expect((await pullProfileFromServer()).status).toBe('unauthorized');
  });

  it('una respuesta tardía de Alice no rehidrata su historial después de autenticar a Bob', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');

    let resolveProfile;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { resolveProfile = resolve; })));
    const pending = pullProfileFromServer();
    await Promise.resolve();

    localStorage.setItem('chess-study-auth-token', 'bob-token');
    localStorage.setItem('chess-study-auth-username', 'bob');
    localStorage.setItem('chess-study-game-history', '[{"id":"bob-only"}]');
    resolveProfile(response(200, {
      data: { 'chess-study-game-history': '[{"id":"alice-secret"}]' },
      revisions: { 'chess-study-game-history': 4 },
    }));

    await expect(pending).resolves.toMatchObject({ status: 'superseded', restored: 0 });
    expect(localStorage.getItem('chess-study-game-history')).toBe('[{"id":"bob-only"}]');
  });
});

describe('pushProfileToServer', () => {
  async function primeRemote(fetchMock, data = {}, revisions = {}) {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    fetchMock.mockResolvedValueOnce(response(200, { data, revisions }));
    await pullProfileFromServer();
    fetchMock.mockClear();
  }

  it('manda sólo el delta con PATCH y revisión esperada', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await primeRemote(fetchMock, { 'chess-study-tournament': JSON.stringify({ points: 200 }) }, { 'chess-study-tournament': 3 });
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 300 }));
    fetchMock.mockResolvedValueOnce(response(200, {
      data: { 'chess-study-tournament': JSON.stringify({ points: 300 }) },
      revisions: { 'chess-study-tournament': 4 },
    }));

    await pushProfileToServer({ throwOnError: true });

    const [url, options] = fetchMock.mock.calls[0];
    const body = JSON.parse(options.body);
    expect(url).toContain('/profile');
    expect(options.method).toBe('PATCH');
    expect(JSON.parse(body.data['chess-study-tournament']).points).toBe(300);
    expect(body.revisions['chess-study-tournament']).toBe(3);
  });

  it('serializa dos PATCH para que una foto vieja nunca termine después de la nueva', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await primeRemote(fetchMock);

    let releaseFirst;
    const bodies = [];
    fetchMock.mockImplementation((url, options) => {
      const body = JSON.parse(options.body);
      bodies.push(body);
      const value = body.data['chess-study-tournament'];
      const result = {
        data: value == null ? {} : { 'chess-study-tournament': value },
        revisions: { 'chess-study-tournament': bodies.length },
      };
      if (bodies.length === 1) {
        return new Promise((resolve) => { releaseFirst = () => resolve(response(200, result)); });
      }
      return Promise.resolve(response(200, result));
    });

    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 1 }));
    const first = pushProfileToServer({ throwOnError: true });
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 2 }));
    const second = pushProfileToServer({ throwOnError: true });

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    releaseFirst();
    await first;
    await second;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(bodies[0].data['chess-study-tournament']).points).toBe(1);
    expect(JSON.parse(bodies[1].data['chess-study-tournament']).points).toBe(2);
  });

  it('cada PATCH conserva el token de la identidad que creó ese snapshot aunque la sesión cambie mientras espera en cola', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await primeRemote(fetchMock);

    let releaseFirst;
    let patchCount = 0;
    fetchMock.mockImplementation((url, options) => {
      patchCount += 1;
      const body = JSON.parse(options.body);
      const result = { data: { ...body.data }, revisions: { 'chess-study-tournament': patchCount } };
      if (patchCount === 1) return new Promise((resolve) => { releaseFirst = () => resolve(response(200, result)); });
      return Promise.resolve(response(200, result));
    });

    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 1 }));
    const first = pushProfileToServer({ throwOnError: true });
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 2 }));
    const second = pushProfileToServer({ throwOnError: true });

    await Promise.resolve();
    localStorage.setItem('chess-study-auth-token', 'bob-token');
    localStorage.setItem('chess-study-auth-username', 'bob');
    releaseFirst();
    await first;
    await second;

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer alice-token');
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer alice-token');
  });

  it('en background no propaga un fallo de red, pero el modo explícito sí', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin conexión')));
    await expect(pushProfileToServer()).resolves.toBeNull();
    resetProfileSyncStateForTests();
    await expect(pushProfileToServer({ throwOnError: true })).rejects.toThrow('sin conexión');
  });

  it('409 relee la foto remota y reintenta el delta local con la revisión fresca', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const oldValue = JSON.stringify({ points: 10 });
    const localValue = JSON.stringify({ points: 11 });
    await primeRemote(fetchMock, { 'chess-study-tournament': oldValue, 'chess-study-board-theme': 'classic' }, {
      'chess-study-tournament': 2,
      'chess-study-board-theme': 7,
    });
    setProfileStorageItem('chess-study-tournament', localValue);

    fetchMock
      .mockResolvedValueOnce(response(409, { detail: {
        message: 'conflicto',
        profile: { data: { 'chess-study-tournament': JSON.stringify({ points: 10.5 }), 'chess-study-board-theme': 'night' } },
        revisions: { 'chess-study-tournament': 3, 'chess-study-board-theme': 8 },
      }}))
      .mockResolvedValueOnce(response(200, {
        data: { 'chess-study-tournament': localValue, 'chess-study-board-theme': 'night' },
        revisions: { 'chess-study-tournament': 4, 'chess-study-board-theme': 8 },
      }));

    await pushProfileToServer({ throwOnError: true });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retry = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(retry.data).toEqual({ 'chess-study-tournament': localValue });
    expect(retry.revisions['chess-study-tournament']).toBe(3);
  });
});
