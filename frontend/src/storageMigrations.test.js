import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { migratePersistentStorage, STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION } from './storageMigrations.js';

beforeEach(() => {
  localStorage.clear();
  clearStorageMemoryFallback();
});

afterEach(() => {
  clearStorageMemoryFallback();
  vi.restoreAllMocks();
});

describe('migraciones de persistencia', () => {
  it('migra el mute global antiguo a música/SFX sin perder la preferencia', () => {
    localStorage.setItem('chess-study-muted', '1');
    const result = migratePersistentStorage();
    expect(result).toMatchObject({ status: 'ok', from: 0, to: STORAGE_SCHEMA_VERSION });
    expect(localStorage.getItem('chess-study-music-muted')).toBe('1');
    expect(localStorage.getItem('chess-study-fx-muted')).toBe('1');
    expect(localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe(String(STORAGE_SCHEMA_VERSION));
  });

  it('no pisa preferencias modernas y retira sólo claves realmente obsoletas', () => {
    localStorage.setItem('chess-study-muted', '1');
    localStorage.setItem('chess-study-music-muted', '0');
    localStorage.setItem('chess-study-cpu-personality', 'legacy');
    localStorage.setItem('chess-study-ambient-theme', 'legacy-track');
    migratePersistentStorage();
    expect(localStorage.getItem('chess-study-music-muted')).toBe('0');
    expect(localStorage.getItem('chess-study-fx-muted')).toBe('1');
    expect(localStorage.getItem('chess-study-cpu-personality')).toBeNull();
    expect(localStorage.getItem('chess-study-ambient-theme')).toBeNull();
  });

  it('arranca degradado pero sin lanzar si Web Storage no acepta escrituras', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('full', 'QuotaExceededError'); });
    let result;
    expect(() => { result = migratePersistentStorage(); }).not.toThrow();
    expect(result.status).toBe('degraded');
  });

  it('trata una versión de esquema corrupta como instalación antigua recuperable', () => {
    localStorage.setItem(STORAGE_SCHEMA_KEY, 'esto-no-es-un-numero');
    const result = migratePersistentStorage();
    expect(result).toMatchObject({ status: 'ok', from: 0, to: STORAGE_SCHEMA_VERSION });
    expect(localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe(String(STORAGE_SCHEMA_VERSION));
  });

  it('no degrada ni modifica una versión futura que este cliente no entiende', () => {
    localStorage.setItem(STORAGE_SCHEMA_KEY, String(STORAGE_SCHEMA_VERSION + 5));
    localStorage.setItem('chess-study-cpu-personality', 'future-data');
    const result = migratePersistentStorage();
    expect(result.status).toBe('future');
    expect(localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe(String(STORAGE_SCHEMA_VERSION + 5));
    expect(localStorage.getItem('chess-study-cpu-personality')).toBe('future-data');
  });
});
