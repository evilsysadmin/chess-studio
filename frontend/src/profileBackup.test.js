import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  exportProfile,
  importProfile,
  pullProfileFromServer,
  pushProfileToServer,
} from './profileBackup.js';
import { hasDirtyProfileForCurrentUser, setProfileStorageItem } from './profileKeys.js';

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('export/import', () => {
  it('exporta progreso y preferencias, pero no la partida activa', () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 100 }));
    localStorage.setItem('chess-study-muted', '1');
    localStorage.setItem('chess-study-voice-enabled', '1');
    localStorage.setItem('chess-study-active-game', 'algun-id');

    const exported = exportProfile();

    expect(exported.data['chess-study-tournament']).toBeDefined();
    expect(exported.data['chess-study-muted']).toBe('1');
    expect(exported.data['chess-study-voice-enabled']).toBe('1');
    expect(exported.data['chess-study-active-game']).toBeUndefined();
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
});

describe('pullProfileFromServer', () => {

  it('si quedó una caché sucia del mismo usuario, la salva antes de hacer pull para no perder progreso', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    setProfileStorageItem('chess-study-tournament', JSON.stringify({ points: 321 }));
    expect(hasDirtyProfileForCurrentUser()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue(response(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    const result = await pullProfileFromServer();

    expect(result.status).toBe('recovered-local');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer alice-token');
    expect(hasDirtyProfileForCurrentUser()).toBe(false);
  });

  it('Mongo pisa la caché persistente antes de montar la app', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-achievements', JSON.stringify(['old']));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, {
      data: { 'chess-study-tournament': JSON.stringify({ points: 777 }) },
    })));

    const result = await pullProfileFromServer();

    expect(result.status).toBe('loaded');
    expect(localStorage.getItem('chess-study-tournament')).toBe(JSON.stringify({ points: 777 }));
    expect(localStorage.getItem('chess-study-achievements')).toBeNull();
  });

  it('perfil remoto vacío limpia progreso pero conserva la partida activa de la misma sesión', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 999 }));
    localStorage.setItem('chess-study-active-game', 'mi-partida');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, {})));

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
});

describe('pushProfileToServer', () => {
  it('manda la foto actual con PUT y Authorization se añade desde api/auth', async () => {
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 300 }));
    const fetchMock = vi.fn().mockResolvedValue(response(200, {}));
    vi.stubGlobal('fetch', fetchMock);

    await pushProfileToServer({ throwOnError: true });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/profile');
    expect(options.method).toBe('PUT');
    expect(JSON.parse(options.body).data['chess-study-tournament']).toBe(JSON.stringify({ points: 300 }));
  });

  it('serializa dos PUT para que una foto vieja nunca termine después de la nueva', async () => {
    let releaseFirst;
    const bodies = [];
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      bodies.push(JSON.parse(options.body));
      if (bodies.length === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve(response(200, {}));
        });
      }
      return Promise.resolve(response(200, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 1 }));
    const first = pushProfileToServer({ throwOnError: true });
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 2 }));
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


  it('cada PUT conserva el token de la identidad que creó ese snapshot aunque la sesión cambie mientras espera en cola', async () => {
    let releaseFirst;
    const fetchMock = vi.fn().mockImplementation((url, options) => {
      if (fetchMock.mock.calls.length === 1) {
        return new Promise((resolve) => {
          releaseFirst = () => resolve(response(200, {}));
        });
      }
      return Promise.resolve(response(200, {}));
    });
    vi.stubGlobal('fetch', fetchMock);

    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 1 }));
    const first = pushProfileToServer({ throwOnError: true });

    localStorage.setItem('chess-study-tournament', JSON.stringify({ points: 2 }));
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
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sin conexión')));
    await expect(pushProfileToServer()).resolves.toBeNull();
    await expect(pushProfileToServer({ throwOnError: true })).rejects.toThrow('sin conexión');
  });
});
