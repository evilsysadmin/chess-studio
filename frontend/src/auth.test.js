import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getToken, getUsername, isLoggedIn, logout, register, login, authHeader } from './auth.js';

function mockFetchOnce(status, body) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

beforeEach(() => {
  localStorage.clear();
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

describe('register', () => {
  it('guarda el token y el username al registrarse bien', async () => {
    mockFetchOnce(201, { token: 'un-token-jwt', username: 'nuevo' });
    await register('nuevo', 'clave123456');
    expect(isLoggedIn()).toBe(true);
    expect(getToken()).toBe('un-token-jwt');
    expect(getUsername()).toBe('nuevo');
  });

  it('tira el mensaje de error del backend si el registro falla', async () => {
    mockFetchOnce(409, { detail: 'Ese usuario ya existe.' });
    await expect(register('repetido', 'clave123456')).rejects.toThrow('Ese usuario ya existe.');
    expect(isLoggedIn()).toBe(false); // no queda sesión a medias si falló
  });
});

describe('login', () => {
  it('guarda el token y el username al loguearse bien', async () => {
    mockFetchOnce(200, { token: 'otro-token', username: 'juan' });
    await login('juan', 'clave123456');
    expect(isLoggedIn()).toBe(true);
    expect(getToken()).toBe('otro-token');
  });

  it('tira el mensaje de error del backend si el login falla', async () => {
    mockFetchOnce(401, { detail: 'Usuario o contraseña incorrectos.' });
    await expect(login('juan', 'clave-mala')).rejects.toThrow('Usuario o contraseña incorrectos.');
  });
});

describe('logout', () => {
  it('borra el token y el username', async () => {
    mockFetchOnce(200, { token: 'x', username: 'juan' });
    await login('juan', 'clave123456');
    expect(isLoggedIn()).toBe(true);

    logout();
    expect(isLoggedIn()).toBe(false);
    expect(getToken()).toBeNull();
    expect(getUsername()).toBeNull();
  });
});

describe('authHeader', () => {
  it('manda el token como Bearer una vez logueado', async () => {
    mockFetchOnce(200, { token: 'mi-token', username: 'ana' });
    await login('ana', 'clave123456');
    expect(authHeader()).toEqual({ Authorization: 'Bearer mi-token' });
  });
});
