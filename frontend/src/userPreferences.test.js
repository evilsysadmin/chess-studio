import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  getBoardCoordinates,
  getBoardRenderer,
  getConfiguredBoardRendererDefault,
  getDefaultTimeControlId,
  getEffectiveReducedMotion,
  getReducedMotion,
  getReducedMotionPreference,
  getUiLanguage,
  reducedMotionStatus,
  setBoardCoordinates,
  setBoardRenderer,
  setDefaultTimeControlId,
  setReducedMotion,
  setUiLanguage,
} from './userPreferences.js';

describe('user preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStorageMemoryFallback();
    vi.unstubAllEnvs();
  });
  it('guarda un control de tiempo válido y rechaza basura', () => {
    expect(getDefaultTimeControlId()).toBe('none');
    expect(setDefaultTimeControlId('5+0')).toBe('5+0');
    expect(getDefaultTimeControlId()).toBe('5+0');
    expect(setDefaultTimeControlId('42+69')).toBe('none');
  });
  it('mantiene idioma en valores realmente soportados', () => {
    expect(getUiLanguage()).toBe('es');
    expect(setUiLanguage('en')).toBe('en');
    expect(getUiLanguage()).toBe('en');
  });
  it('guarda preferencias explícitas de accesibilidad del tablero', () => {
    expect(getBoardCoordinates()).toBe(true);
    expect(setBoardCoordinates(false)).toBe(false);
    expect(getBoardCoordinates()).toBe(false);
    expect(getReducedMotion()).toBe(false);
    expect(setReducedMotion(true)).toBe(true);
    expect(getReducedMotion()).toBe(true);
  });

  it('mantiene 2D por defecto y persiste una elección 3D válida', () => {
    expect(getConfiguredBoardRendererDefault()).toBe('2d');
    expect(getBoardRenderer()).toBe('2d');
    expect(setBoardRenderer('3d')).toBe('3d');
    expect(getBoardRenderer()).toBe('3d');
    expect(setBoardRenderer('holograma-cuántico')).toBe('2d');
    expect(getBoardRenderer()).toBe('2d');
  });

  it('permite que staging proponga 3D sólo cuando el usuario aún no eligió renderer', () => {
    vi.stubEnv('VITE_DEFAULT_BOARD_RENDERER', '3d');
    expect(getConfiguredBoardRendererDefault()).toBe('3d');
    expect(getBoardRenderer()).toBe('3d');

    setBoardRenderer('2d');
    expect(getBoardRenderer()).toBe('2d');

    localStorage.clear();
    clearStorageMemoryFallback();
    vi.stubEnv('VITE_DEFAULT_BOARD_RENDERER', 'holograma');
    expect(getConfiguredBoardRendererDefault()).toBe('2d');
    expect(getBoardRenderer()).toBe('2d');
  });

  it('honra el sistema por defecto pero una elección explícita puede permitir movimiento', () => {
    expect(getReducedMotionPreference()).toBe('system');
    expect(reducedMotionStatus({ systemReduced: true })).toMatchObject({ effective: true, source: 'system', preference: 'system' });
    expect(getEffectiveReducedMotion({ systemReduced: true })).toBe(true);

    setReducedMotion(false);
    expect(getReducedMotionPreference()).toBe('allow');
    expect(reducedMotionStatus({ systemReduced: true })).toMatchObject({ effective: false, source: 'app', preference: 'allow' });
    expect(getEffectiveReducedMotion({ systemReduced: true })).toBe(false);

    setReducedMotion(true);
    expect(getReducedMotionPreference()).toBe('reduce');
    expect(reducedMotionStatus({ systemReduced: false })).toMatchObject({ effective: true, source: 'app', preference: 'reduce' });
  });
});
