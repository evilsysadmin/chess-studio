import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getToken, getUsername, isLoggedIn, logout, register, login, authHeader, wakeBackend, fetchMe, watchSessionIdentity } from './auth.js';

function mockFetchOnce(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

describe('estado de sesión', () => {
  it('no hay sesión por defecto', () => {
    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBeNull();
    expect(getUsername()).toBeNull();
  });

  it('authHeader da un objeto vacío sin sesión', () => {
    expect(authHeader()).toEqual({});
  });
});

describe('register/login', () => {
  it('guarda token y username al registrarse', async () => {
    mockFetchOnce(201, { token: 'un-token-jwt', username: 'nuevo' });
    await register('nuevo', 'clave123456');
    expect(getToken()).toBe('un-token-jwt');
    expect(getUsername()).toBe('nuevo');
  });

  it('cada login inicializa un tema musical para esa sesión', async () => {
    mockFetchOnce(200, { token: 'music-token', username: 'melomano' });
    await login('melomano', 'clave123456');
    expect(sessionStorage.getItem('chess-study-ambient-theme-session')).toBeTruthy();
  });

  it('envía el código de invitación cuando se registra', async () => {
    mockFetchOnce(201, { token: 'invite-token', username: 'invitado' });
    await register('invitado', 'clave123456', 'codigo-secreto');
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body).inviteCode).toBe('codigo-secreto');
  });

  it('crear Bob en el mismo navegador no hereda la caché de Alice', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', '{"points":999}');
    localStorage.setItem('chess-study-combat-roster', '{"combatXp":8000}');
    localStorage.setItem('chess-study-active-game', 'alice-game');

    mockFetchOnce(201, { token: 'bob-token', username: 'bob' });
    await register('bob', 'clave123456');

    expect(getUsername()).toBe('bob');
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-combat-roster')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
  });

  it('limpia la caché del usuario anterior solo después de un login correcto', async () => {
    localStorage.setItem('chess-study-tournament', '{"points":999}');
    localStorage.setItem('chess-study-active-game', 'alice-game');

    mockFetchOnce(200, { token: 'bob-token', username: 'bob' });
    await login('bob', 'clave123456');

    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
    expect(getUsername()).toBe('bob');
  });

  it('no borra la caché si el login falla', async () => {
    localStorage.setItem('chess-study-tournament', '{"points":42}');
    mockFetchOnce(401, { detail: 'Usuario o contraseña incorrectos.' });

    await expect(login('juan', 'mal')).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(localStorage.getItem('chess-study-tournament')).toBe('{"points":42}');
    expect(isLoggedIn()).toBe(false);
  });
});

describe('logout', () => {
  it('borra sesión, progreso y partida activa para que otra cuenta no herede nada', async () => {
    mockFetchOnce(200, { token: 'x', username: 'juan' });
    await login('juan', 'clave123456');
    localStorage.setItem('chess-study-tournament', '{"points":42}');
    localStorage.setItem('chess-study-muted', '1');
    localStorage.setItem('chess-study-active-game', 'game');

    logout();

    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBeNull();
    expect(getUsername()).toBeNull();
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-muted')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
  });
});

describe('fetchMe/authHeader/wakeBackend', () => {
  it('fetchMe devuelve username e isAdmin', async () => {
    mockFetchOnce(200, { username: 'stan', isAdmin: true });
    expect(await fetchMe()).toEqual({ username: 'stan', isAdmin: true });
  });

  it('fetchMe devuelve null ante 401 o fallo de red', async () => {
    mockFetchOnce(401, { detail: 'no autorizado' });
    expect(await fetchMe()).toBeNull();

    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    expect(await fetchMe()).toBeNull();
  });

  it('authHeader manda Bearer tras login', async () => {
    mockFetchOnce(200, { token: 'mi-token', username: 'ana' });
    await login('ana', 'clave123456');
    expect(authHeader()).toEqual({ Authorization: 'Bearer mi-token' });
  });

  it('wakeBackend pega a /api/health sin propagar errores', () => {
    mockFetchOnce(200, { ok: true });
    wakeBackend();
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/health'));

    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    expect(() => wakeBackend()).not.toThrow();
  });
});

describe('sincronización de sesión entre pestañas', () => {
  it('detecta cuando otra pestaña cambia la identidad autenticada', async () => {
    const listeners = new Map();
    vi.stubGlobal('window', {
      addEventListener: vi.fn((name, fn) => listeners.set(name, fn)),
      removeEventListener: vi.fn((name) => listeners.delete(name)),
    });

    mockFetchOnce(200, { token: 'alice-token', username: 'alice' });
    await login('alice', 'clave123456');

    const changed = vi.fn();
    const stop = watchSessionIdentity(changed);

    // Una preferencia/progreso de otra pestaña no implica cambio de identidad.
    listeners.get('storage')({ key: 'chess-study-tournament' });
    expect(changed).toHaveBeenCalledTimes(0);

    // localStorage ya refleja el valor de la otra pestaña cuando llega storage.
    localStorage.setItem('chess-study-auth-token', 'bob-token');
    localStorage.setItem('chess-study-auth-username', 'bob');
    listeners.get('storage')({ key: 'chess-study-auth-token' });
    expect(changed).toHaveBeenCalledTimes(1);

    stop();
    expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    expect(window.removeEventListener.mock.calls[0][0]).toBe('storage');
  });
});
