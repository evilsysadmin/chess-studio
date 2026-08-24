import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_LOCAL,
  clearStorageMemoryFallback,
  getStorageItem,
  listStorageKeys,
  readJsonStorage,
  removeStorageItem,
  setStorageItem,
  writeJsonStorage,
} from './safeStorage.js';

const originalLocalStorage = global.localStorage;

beforeEach(() => {
  clearStorageMemoryFallback();
  localStorage.clear();
  originalLocalStorage.clear();
  global.localStorage = originalLocalStorage;
});

afterEach(() => {
  global.localStorage = originalLocalStorage;
  clearStorageMemoryFallback();
  vi.restoreAllMocks();
});

describe('safeStorage', () => {
  it('lee/escribe/retira normalmente y enumera por prefijo', () => {
    expect(setStorageItem(STORAGE_LOCAL, 'chess:a', '1')).toBe(true);
    expect(setStorageItem(STORAGE_LOCAL, 'other', '2')).toBe(true);
    expect(getStorageItem(STORAGE_LOCAL, 'chess:a')).toBe('1');
    expect(listStorageKeys(STORAGE_LOCAL, { prefix: 'chess:' })).toEqual(['chess:a']);
    expect(removeStorageItem(STORAGE_LOCAL, 'chess:a')).toBe(true);
    expect(getStorageItem(STORAGE_LOCAL, 'chess:a')).toBeNull();
  });

  it('sobrevive a SecurityError/QuotaExceededError usando respaldo de memoria', () => {
    global.localStorage = {
      getItem() { throw new DOMException('blocked', 'SecurityError'); },
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem() { throw new DOMException('blocked', 'SecurityError'); },
      key() { throw new DOMException('blocked', 'SecurityError'); },
      get length() { throw new DOMException('blocked', 'SecurityError'); },
    };

    expect(setStorageItem(STORAGE_LOCAL, 'x', 'alive')).toBe(false);
    expect(getStorageItem(STORAGE_LOCAL, 'x')).toBe('alive');
    expect(listStorageKeys(STORAGE_LOCAL)).toContain('x');
    expect(removeStorageItem(STORAGE_LOCAL, 'x')).toBe(false);
    expect(getStorageItem(STORAGE_LOCAL, 'x')).toBeNull();
  });


  it('un setItem fallido sigue ganando aunque getItem nativo funcione y devuelva un valor viejo', () => {
    originalLocalStorage.setItem('quota-key', 'viejo');
    global.localStorage = {
      getItem(key) { return originalLocalStorage.getItem(key); },
      setItem() { throw new DOMException('full', 'QuotaExceededError'); },
      removeItem(key) { originalLocalStorage.removeItem(key); },
      key(index) { return originalLocalStorage.key(index); },
      get length() { return originalLocalStorage.length; },
    };

    expect(setStorageItem(STORAGE_LOCAL, 'quota-key', 'nuevo')).toBe(false);
    expect(getStorageItem(STORAGE_LOCAL, 'quota-key')).toBe('nuevo');
    expect(originalLocalStorage.getItem('quota-key')).toBe('viejo');
  });

  it('un removeItem fallido no deja reaparecer el valor nativo antiguo en la pestaña', () => {
    originalLocalStorage.setItem('blocked-delete', 'fantasma');
    global.localStorage = {
      getItem(key) { return originalLocalStorage.getItem(key); },
      setItem(key, value) { originalLocalStorage.setItem(key, value); },
      removeItem() { throw new DOMException('blocked', 'SecurityError'); },
      key(index) { return originalLocalStorage.key(index); },
      get length() { return originalLocalStorage.length; },
    };

    expect(removeStorageItem(STORAGE_LOCAL, 'blocked-delete')).toBe(false);
    expect(getStorageItem(STORAGE_LOCAL, 'blocked-delete')).toBeNull();
    expect(listStorageKeys(STORAGE_LOCAL)).not.toContain('blocked-delete');
    expect(originalLocalStorage.getItem('blocked-delete')).toBe('fantasma');
  });

  it('ignora JSON corrupto y puede retirarlo sin lanzar', () => {
    originalLocalStorage.setItem('broken', '{nope');
    expect(readJsonStorage(STORAGE_LOCAL, 'broken', { fallback: { ok: false }, removeMalformed: true })).toEqual({ ok: false });
    expect(originalLocalStorage.getItem('broken')).toBeNull();
  });

  it('serializa JSON y conserva el valor aun si el storage nativo falla', () => {
    global.localStorage = { getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); } };
    expect(writeJsonStorage(STORAGE_LOCAL, 'state', { n: 7 })).toBe(false);
    expect(readJsonStorage(STORAGE_LOCAL, 'state')).toEqual({ n: 7 });
  });
});
