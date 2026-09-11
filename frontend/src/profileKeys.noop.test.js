import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PROFILE_CHANGED_EVENT,
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
  it('no marca dirty ni emite cambios si el valor ya es idéntico', () => {
    localStorage.setItem(PROFILE_KEY, 'classic');
    const changed = vi.fn();
    window.addEventListener(PROFILE_CHANGED_EVENT, changed);

    expect(setProfileStorageItem(PROFILE_KEY, 'classic')).toBe(true);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('classic');
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBeNull();
    expect(localStorage.getItem(DIRTY_KEYS_KEY)).toBeNull();
    expect(changed).not.toHaveBeenCalled();

    window.removeEventListener(PROFILE_CHANGED_EVENT, changed);
  });

  it('no marca dirty ni emite cambios al borrar una clave ya ausente', () => {
    const changed = vi.fn();
    window.addEventListener(PROFILE_CHANGED_EVENT, changed);

    expect(removeProfileStorageItem(PROFILE_KEY)).toBe(true);
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBeNull();
    expect(localStorage.getItem(DIRTY_KEYS_KEY)).toBeNull();
    expect(changed).not.toHaveBeenCalled();

    window.removeEventListener(PROFILE_CHANGED_EVENT, changed);
  });

  it('mantiene journal dirty y evento cuando el valor sí cambia', () => {
    localStorage.setItem(PROFILE_KEY, 'classic');
    const changed = vi.fn();
    window.addEventListener(PROFILE_CHANGED_EVENT, changed);

    expect(setProfileStorageItem(PROFILE_KEY, 'nocturne')).toBe(true);
    expect(localStorage.getItem(PROFILE_KEY)).toBe('nocturne');
    expect(localStorage.getItem(DIRTY_USER_KEY)).toBe('alice');
    expect(JSON.parse(localStorage.getItem(DIRTY_KEYS_KEY))).toEqual([PROFILE_KEY]);
    expect(changed).toHaveBeenCalledTimes(1);

    window.removeEventListener(PROFILE_CHANGED_EVENT, changed);
  });
});
