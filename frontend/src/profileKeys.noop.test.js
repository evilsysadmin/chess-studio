import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindProfileStorageIdentity,
  removeProfileStorageItem,
  setProfileStorageItem,
} from './profileKeys.js';

const USER_KEY = 'chess-study-auth-username';
const DIRTY_USER_KEY = 'chess-study-profile-dirty-user';
const DIRTY_KEYS_KEY = 'chess-study-profile-dirty-keys';
const PROFILE_KEY = 'chess-study-board-theme';

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(USER_KEY, 'alice');
  bindProfileStorageIdentity('alice');
});

describe('profile storage no-op writes', () => {
  it('no marca dirty si el valor ya es idéntico', () => {
    localStorage.setItem(PROFILE_KEY, 'classic');

    expect(setProfileStorageItem(PROFILE_KEY, 'classic')).toBe(true);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('classic');
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBeNull();
    expect(localStorage.getItem(DIRTY_KEYS_KEY)).toBeNull();
  });

  it('no marca dirty al borrar una clave ya ausente', () => {
    expect(removeProfileStorageItem(PROFILE_KEY)).toBe(true);
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBeNull();
    expect(localStorage.getItem(DIRTY_KEYS_KEY)).toBeNull();
  });

  it('mantiene el journal dirty cuando el valor sí cambia', () => {
    localStorage.setItem(PROFILE_KEY, 'classic');

    expect(setProfileStorageItem(PROFILE_KEY, 'nocturne')).toBe(true);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('nocturne');
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBe('alice');
    expect(JSON.parse(localStorage.getItem(DIRTY_KEYS_KEY))).toEqual([PROFILE_KEY]);
  });
});
