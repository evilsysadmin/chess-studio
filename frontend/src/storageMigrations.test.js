import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { migratePersistentStorage, STORAGE_SCHEMA_KEY, STORAGE_SCHEMA_VERSION } from './storageMigrations.js';
import { EXPLICIT_2D_BOARD_RENDERER_VALUE } from './userPreferences.js';

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

  it('migra una preferencia 2D existente a 3D exactamente una vez', () => {
    localStorage.setItem(STORAGE_SCHEMA_KEY, '2');
    localStorage.setItem('chess-study-board-renderer', '2d');

    const result = migratePersistentStorage();

    expect(result).toMatchObject({ status: 'ok', from: 2, to: 3 });
    expect(localStorage.getItem('chess-study-board-renderer')).toBe('3d');

    // Una elección manual posterior se codifica como explícita y vuelve a ser
    // soberana: v2→v3 no la confunde con el valor 2D legado.
    localStorage.setItem('chess-study-board-renderer', EXPLICIT_2D_BOARD_RENDERER_VALUE);
    migratePersistentStorage();
    expect(localStorage.getItem('chess-study-board-renderer')).toBe(EXPLICIT_2D_BOARD_RENDERER_VALUE);
  });

  it('no marca v3 como durable si falla justo la migración 2D→3D', () => {
    localStorage.setItem(STORAGE_SCHEMA_KEY, '2');
    localStorage.setItem('chess-study-board-renderer', '2d');
    const originalSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === 'chess-study-board-renderer') throw new DOMException('full', 'QuotaExceededError');
      return originalSetItem(key, value);
    });

    const result = migratePersistentStorage();

    expect(result).toMatchObject({ status: 'degraded', from: 2, to: 2, durable: false });
    expect(localStorage.getItem(STORAGE_SCHEMA_KEY)).toBe('2');
  });

  it('conserva 3D en perfiles existentes que ya lo habían elegido', () => {
    localStorage.setItem(STORAGE_SCHEMA_KEY, '2');
    localStorage.setItem('chess-study-board-renderer', '3d');
    migratePersistentStorage();
    expect(localStorage.getItem('chess-study-board-renderer')).toBe('3d');
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
