import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  BOARD_RENDERERS,
  BOARD_RENDERER_KEY,
  EXPLICIT_2D_BOARD_RENDERER_VALUE,
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

  it('hace 3D Sala de guerra el default y mantiene 2D como fallback explícito', () => {
    expect(BOARD_RENDERERS[0]).toMatchObject({ id: '3d' });
    expect(getConfiguredBoardRendererDefault()).toBe('3d');
    expect(getBoardRenderer()).toBe('3d');

    expect(setBoardRenderer('2d')).toBe('2d');
    expect(localStorage.getItem(BOARD_RENDERER_KEY)).toBe(EXPLICIT_2D_BOARD_RENDERER_VALUE);
    expect(getBoardRenderer()).toBe('2d');

    expect(setBoardRenderer('holograma-cuántico')).toBe('3d');
    expect(localStorage.getItem(BOARD_RENDERER_KEY)).toBe('3d');
    expect(getBoardRenderer()).toBe('3d');
  });

  it('interpreta un 2D legado sincronizado como 3D pero respeta un 2D elegido después', () => {
    // Simula un perfil antiguo que llega desde Mongo después de que las
    // migraciones locales ya hayan terminado en un navegador nuevo.
    localStorage.setItem(BOARD_RENDERER_KEY, '2d');
    expect(getBoardRenderer()).toBe('3d');

    expect(setBoardRenderer('2d')).toBe('2d');
    expect(localStorage.getItem(BOARD_RENDERER_KEY)).toBe(EXPLICIT_2D_BOARD_RENDERER_VALUE);
    expect(getBoardRenderer()).toBe('2d');
  });

  it('usa 3D por defecto también en producción y staging', () => {
    vi.stubEnv('VITE_API_URL', 'https://api.chess-studio.shadowops.dpdns.org/api');
    expect(getConfiguredBoardRendererDefault()).toBe('3d');

    vi.stubEnv('VITE_API_URL', 'https://api-staging.chess-studio.shadowops.dpdns.org/api');
    expect(getConfiguredBoardRendererDefault()).toBe('3d');
  });

  it('permite un override explícito de emergencia sin cambiar el default del producto', () => {
    vi.stubEnv('VITE_DEFAULT_BOARD_RENDERER', '2d');
    expect(getConfiguredBoardRendererDefault()).toBe('2d');

    vi.stubEnv('VITE_DEFAULT_BOARD_RENDERER', '3d');
    expect(getConfiguredBoardRendererDefault()).toBe('3d');

    vi.stubEnv('VITE_DEFAULT_BOARD_RENDERER', 'holograma');
    expect(getConfiguredBoardRendererDefault()).toBe('3d');
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
