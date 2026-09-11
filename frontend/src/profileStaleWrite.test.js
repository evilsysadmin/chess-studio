import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  bindProfileStorageIdentity,
  profileStorageIdentityMatchesCurrentUser,
  setProfileStorageItem,
} from './profileKeys.js';

const AUTH_USERNAME_KEY = 'chess-study-auth-username';
const PROFILE_KEY = 'chess-study-player-rating';

describe('stale async profile writes', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
    bindProfileStorageIdentity(null);
  });

  it('rejects a late Alice write after the browser identity has switched to Bob', async () => {
    localStorage.setItem(AUTH_USERNAME_KEY, 'alice');
    bindProfileStorageIdentity('alice');
    expect(profileStorageIdentityMatchesCurrentUser()).toBe(true);
    expect(setProfileStorageItem(PROFILE_KEY, '1200')).toBe(true);

    let releaseLateResponse;
    const lateResponse = new Promise((resolve) => { releaseLateResponse = resolve; });
    const pending = lateResponse.then(() => setProfileStorageItem(PROFILE_KEY, '1999'));

    // La callback pendiente pertenece al documento/sesión ligado a Alice.
    // Simulamos que otra transición de auth ya cambió la identidad visible a Bob
    // antes de que llegue la respuesta antigua.
    localStorage.setItem(AUTH_USERNAME_KEY, 'bob');
    expect(profileStorageIdentityMatchesCurrentUser()).toBe(false);

    releaseLateResponse();
    await expect(pending).resolves.toBe(false);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('1200');
  });

  it('permite de nuevo escrituras sólo después de ligar explícitamente el documento a la nueva identidad', () => {
    localStorage.setItem(AUTH_USERNAME_KEY, 'alice');
    bindProfileStorageIdentity('alice');
    expect(setProfileStorageItem(PROFILE_KEY, '1200')).toBe(true);

    localStorage.setItem(AUTH_USERNAME_KEY, 'bob');
    expect(setProfileStorageItem(PROFILE_KEY, '1999')).toBe(false);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('1200');

    bindProfileStorageIdentity('bob');
    expect(profileStorageIdentityMatchesCurrentUser()).toBe(true);
    expect(setProfileStorageItem(PROFILE_KEY, '1350')).toBe(true);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('1350');
  });
});
