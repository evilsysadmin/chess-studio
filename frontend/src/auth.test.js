import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PRESENCE_DOCUMENT_OWNER_KEY, PRESENCE_SESSION_KEY, getPresenceSessionId, getToken, getUsername, isLoggedIn, logout, reportLogoutPresence, reportPageLeavePresence, register, login, authHeader, wakeBackend, fetchMe, fetchMeStatus, touchActivity, watchSessionIdentity, forgotPassword, resetPassword, updateRecoveryEmail, fetchLiveStatus } from './auth.js';
import { APP_RELEASE } from './release.js';
import { setProfileStorageItem } from './profileKeys.js';

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
    await register('nuevo', 'clave123456', 'nuevo@example.com');
    expect(getToken()).toBe('un-token-jwt');
    expect(getUsername()).toBe('nuevo');
    expect(getPresenceSessionId()).toBeTruthy();
    expect(sessionStorage.getItem(PRESENCE_SESSION_KEY)).toBeTruthy();
    expect(localStorage.getItem(PRESENCE_SESSION_KEY)).toBeNull();
  });



  it('propaga la cancelación del AbortSignal a las peticiones de autenticación', async () => {
    let fetchSignal = null;
    global.fetch = vi.fn().mockImplementation((_url, options = {}) => new Promise((_resolve, reject) => {
      fetchSignal = options.signal;
      options.signal?.addEventListener('abort', () => reject(options.signal.reason || new DOMException('Aborted', 'AbortError')), { once: true });
    }));
    const controller = new AbortController();
    const pending = login('abortable', 'clave123456', { signal: controller.signal });
    controller.abort(new DOMException('Caller cancelled', 'AbortError'));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchSignal?.aborted).toBe(true);
  });
  it('cada login inicializa un tema musical para esa sesión', async () => {
    mockFetchOnce(200, { token: 'music-token', username: 'melomano' });
    await login('melomano', 'clave123456');
    expect(sessionStorage.getItem('chess-study-ambient-theme-session')).toBeTruthy();
  });

  it('envía el código de invitación cuando se registra', async () => {
    mockFetchOnce(201, { token: 'invite-token', username: 'invitado' });
    await register('invitado', 'clave123456', 'invitado@example.com', 'codigo-secreto');
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual(expect.objectContaining({ inviteCode: 'codigo-secreto', email: 'invitado@example.com' }));
  });

  it('conserva el idioma elegido al crear la cuenta', async () => {
    mockFetchOnce(201, { token: 'english-token', username: 'english' });
    await register('english', 'clave123456', 'english@example.com', '', 'en');
    expect(localStorage.getItem('chess-study-ui-language')).toBe('en');
  });

  it('crear Bob en el mismo navegador no hereda la caché de Alice', async () => {
    localStorage.setItem('chess-study-auth-token', 'alice-token');
    localStorage.setItem('chess-study-auth-username', 'alice');
    localStorage.setItem('chess-study-tournament', '{"points":999}');
    localStorage.setItem('chess-study-combat-roster', '{"combatXp":8000}');
    localStorage.setItem('chess-study-active-game', 'alice-game');
    localStorage.setItem('chess-study-active-game-session-v1', '{"version":1,"route":"game","gameId":"alice-game"}');
    localStorage.setItem('chess-study-clock:alice-game', '{"version":1}');

    mockFetchOnce(201, { token: 'bob-token', username: 'bob' });
    await register('bob', 'clave123456', 'bob@example.com');

    expect(getUsername()).toBe('bob');
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-combat-roster')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
    expect(localStorage.getItem('chess-study-clock:alice-game')).toBeNull();
  });

  it('limpia la caché del usuario anterior solo después de un login correcto', async () => {
    localStorage.setItem('chess-study-tournament', '{"points":999}');
    localStorage.setItem('chess-study-active-game', 'alice-game');

    mockFetchOnce(200, { token: 'bob-token', username: 'bob' });
    await login('bob', 'clave123456');

    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game-session-v1')).toBeNull();
    expect(getUsername()).toBe('bob');
  });

  it('no borra la caché si el login falla', async () => {
    localStorage.setItem('chess-study-tournament', '{"points":42}');
    mockFetchOnce(401, { detail: 'Usuario o contraseña incorrectos.' });

    await expect(login('juan', 'mal')).rejects.toThrow('Usuario o contraseña incorrectos.');
    expect(localStorage.getItem('chess-study-tournament')).toBe('{"points":42}');
    expect(isLoggedIn()).toBe(false);
  });

  it('una pestaña ligada a Alice no puede escribir progreso después de que otra cambie la sesión a Bob', async () => {
    mockFetchOnce(200, { token: 'alice-token', username: 'alice' });
    await login('alice', 'clave123456');
    setProfileStorageItem('chess-study-tournament', '{"points":42}');

    // Simula el storage event de otra pestaña antes de que ésta se recargue.
    localStorage.setItem('chess-study-auth-token', 'bob-token');
    localStorage.setItem('chess-study-auth-username', 'bob');

    expect(setProfileStorageItem('chess-study-tournament', '{"points":999}')).toBe(false);
    expect(localStorage.getItem('chess-study-tournament')).toBe('{"points":42}');
  });
});

describe('presence session identity', () => {
  it('repara una id de presencia corrupta antes de enviarla al backend', () => {
    localStorage.setItem('chess-study-auth-token', 'legacy-token');
    sessionStorage.setItem(PRESENCE_SESSION_KEY, 'valor.con.puntos$no-valido');
    const repaired = getPresenceSessionId();
    expect(repaired).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(repaired).not.toBe('valor.con.puntos$no-valido');
  });
  it('la id de presencia vive en sessionStorage pero queda ligada al documento actual', () => {
    localStorage.setItem('chess-study-auth-token', 'tab-token');
    const id = getPresenceSessionId();
    expect(id).toBeTruthy();
    expect(sessionStorage.getItem(PRESENCE_SESSION_KEY)).toBe(id);
    expect(sessionStorage.getItem(PRESENCE_DOCUMENT_OWNER_KEY)).toBeTruthy();
    expect(localStorage.getItem(PRESENCE_SESSION_KEY)).toBeNull();
  });

  it('no adopta una id clonada desde otra pestaña/opener', () => {
    localStorage.setItem('chess-study-auth-token', 'clone-token');
    sessionStorage.setItem(PRESENCE_DOCUMENT_OWNER_KEY, 'owner-de-otra-pestana');
    sessionStorage.setItem(PRESENCE_SESSION_KEY, 'copied_session_12345');
    const id = getPresenceSessionId();
    expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
    expect(id).not.toBe('copied_session_12345');
    expect(sessionStorage.getItem(PRESENCE_SESSION_KEY)).toBe(id);
    expect(sessionStorage.getItem(PRESENCE_DOCUMENT_OWNER_KEY)).not.toBe('owner-de-otra-pestana');
  });

  it('mantiene una id de presencia estable durante el mismo login y la rota al volver a autenticarse', async () => {
    mockFetchOnce(200, { token: 'first-token', username: 'ana' });
    await login('ana', 'clave123456');
    const first = getPresenceSessionId();
    expect(first).toBeTruthy();
    expect(getPresenceSessionId()).toBe(first);

    mockFetchOnce(200, { token: 'second-token', username: 'ana' });
    await login('ana', 'clave123456');
    expect(getPresenceSessionId()).toBeTruthy();
    expect(getPresenceSessionId()).not.toBe(first);
  });
});

describe('logout presence', () => {
  it('avisa al backend antes de borrar la sesión local', async () => {
    localStorage.setItem('chess-study-auth-token', 'logout-token');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(reportLogoutPresence()).resolves.toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer logout-token', 'X-Presence-Session': expect.any(String) }),
        keepalive: true,
      }),
    );
  });


  it('pagehide cierra la id vieja y rota antes de que un reload vuelva a anunciar presencia', async () => {
    localStorage.setItem('chess-study-auth-token', 'reload-token');
    const before = getPresenceSessionId();
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(reportPageLeavePresence()).resolves.toBe(true);
    const after = getPresenceSessionId();
    expect(after).not.toBe(before);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/logout'),
      expect.objectContaining({ headers: expect.objectContaining({ 'X-Presence-Session': before }) }),
    );
  });
});

describe('logout', () => {
  it('borra sesión, progreso y partida activa para que otra cuenta no herede nada', async () => {
    mockFetchOnce(200, { token: 'x', username: 'juan' });
    await login('juan', 'clave123456');
    localStorage.setItem('chess-study-tournament', '{"points":42}');
    localStorage.setItem('chess-study-muted', '1');
    localStorage.setItem('chess-study-active-game', 'game');
    localStorage.setItem('chess-study-active-game-session-v1', '{"version":1,"route":"game","gameId":"game"}');
    localStorage.setItem('chess-study-clock:game', '{"version":1}');

    logout();

    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBeNull();
    expect(getUsername()).toBeNull();
    expect(localStorage.getItem('chess-study-tournament')).toBeNull();
    expect(localStorage.getItem('chess-study-muted')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game')).toBeNull();
    expect(localStorage.getItem('chess-study-active-game-session-v1')).toBeNull();
    expect(localStorage.getItem('chess-study-clock:game')).toBeNull();
    expect(sessionStorage.getItem(PRESENCE_SESSION_KEY)).toBeNull();
    expect(sessionStorage.getItem(PRESENCE_DOCUMENT_OWNER_KEY)).toBeNull();
  });
});

describe('fetchMe/authHeader/wakeBackend', () => {
  it('fetchMe devuelve username e isAdmin', async () => {
    mockFetchOnce(200, { username: 'stan', isAdmin: true });
    expect(await fetchMe()).toEqual({ username: 'stan', isAdmin: true });
  });

  it('fetchMe mantiene compatibilidad y fetchMeStatus distingue 401 de indisponibilidad', async () => {
    mockFetchOnce(401, { detail: 'no autorizado' });
    expect(await fetchMe()).toBeNull();

    mockFetchOnce(401, { detail: 'no autorizado' });
    expect(await fetchMeStatus()).toMatchObject({ status: 'unauthorized', user: null });

    global.fetch = vi.fn().mockRejectedValue(new Error('network error'));
    expect(await fetchMeStatus()).toMatchObject({ status: 'unavailable', user: null });
  });

  it('authHeader manda Bearer tras login', async () => {
    mockFetchOnce(200, { token: 'mi-token', username: 'ana' });
    await login('ana', 'clave123456');
    expect(authHeader()).toEqual(expect.objectContaining({ Authorization: 'Bearer mi-token', 'X-Presence-Session': expect.any(String) }));
  });

  it('wakeBackend pega a /api/health sin propagar errores', () => {
    mockFetchOnce(200, { ok: true });
    wakeBackend();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/health'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Request-ID': expect.any(String) }),
      }),
    );

    global.fetch = vi.fn().mockRejectedValue(new Error('timeout'));
    expect(() => wakeBackend()).not.toThrow();
  });

  it('fetchLiveStatus informa backend y presencia agregada usando sesión autenticada', async () => {
    localStorage.setItem('chess-study-auth-token', 'status-token');
    mockFetchOnce(200, { ok: true, onlineUsers: 3, presenceAvailable: true });
    expect(await fetchLiveStatus()).toMatchObject({ backend: 'up', onlineUsers: 3, presenceAvailable: true });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/status'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Request-ID': expect.any(String),
          Authorization: 'Bearer status-token',
        }),
      }),
    );

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(await fetchLiveStatus()).toMatchObject({ backend: 'down', onlineUsers: null, presenceAvailable: false });
  });

  it('touchActivity manda un heartbeat autenticado y no propaga errores', async () => {
    mockFetchOnce(200, { token: 'heartbeat-token', username: 'vivo' });
    await login('vivo', 'clave123456');

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    expect(() => touchActivity()).not.toThrow();
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/activity'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer heartbeat-token', 'X-Presence-Session': expect.any(String) }),
      }),
    );

    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    touchActivity('Partida', true);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/auth/activity'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ activity: 'Partida', foreground: true, release: APP_RELEASE }),
      }),
    );

    touchActivity('Partida', false, { keepalive: true });
    expect(global.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/auth/activity'),
      expect.objectContaining({ keepalive: true, body: JSON.stringify({ activity: 'Partida', foreground: false, release: APP_RELEASE }) }),
    );

    global.fetch = vi.fn().mockRejectedValue(new Error('offline'));
    expect(() => touchActivity()).not.toThrow();
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

    // Rotar el token del MISMO usuario no cambia la identidad y no debe
    // recargar una batalla de Combat Chess que esté en curso.
    localStorage.setItem('chess-study-auth-token', 'alice-token-rotated');
    listeners.get('storage')({ key: 'chess-study-auth-token' });
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


describe('recuperación por email', () => {
  it('manda el email al endpoint de forgot password', async () => {
    mockFetchOnce(200, { ok: true, message: 'Si ese email está registrado, recibirás un enlace de recuperación.' });
    await forgotPassword('recover@example.com');
    const [, options] = global.fetch.mock.calls[0];
    expect(JSON.parse(options.body)).toEqual({ email: 'recover@example.com' });
  });

  it('guarda sesión al restablecer la contraseña', async () => {
    mockFetchOnce(200, { token: 'reset-token-session', username: 'recuperado' });
    await resetPassword('signed-reset-token', 'clave-nueva');
    expect(getUsername()).toBe('recuperado');
    expect(getToken()).toBe('reset-token-session');
  });

  it('actualiza el email enviando contraseña actual y bearer', async () => {
    mockFetchOnce(200, { token: 'mail-token', username: 'ana' });
    await login('ana', 'clave123456');
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ username: 'ana', email: 'new@example.com' }) });
    await updateRecoveryEmail('new@example.com', 'clave123456');
    const [, options] = global.fetch.mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer mail-token');
    expect(JSON.parse(options.body)).toEqual({ email: 'new@example.com', password: 'clave123456' });
  });
});
