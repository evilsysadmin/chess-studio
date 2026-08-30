import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import {
  getBoardCoordinates,
  getDefaultTimeControlId,
  getEffectiveReducedMotion,
  getReducedMotion,
  getReducedMotionPreference,
  getUiLanguage,
  reducedMotionStatus,
  setBoardCoordinates,
  setDefaultTimeControlId,
  setReducedMotion,
  setReducedMotionPreference,
  setUiLanguage,
} from './userPreferences.js';

describe('user preferences', () => {
  beforeEach(() => { localStorage.clear(); clearStorageMemoryFallback(); });
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

  it('permite volver a Sistema después de un override explícito', () => {
    expect(setReducedMotionPreference('allow')).toBe('allow');
    expect(getReducedMotionPreference()).toBe('allow');
    expect(reducedMotionStatus({ systemReduced: true }).effective).toBe(false);

    expect(setReducedMotionPreference('system')).toBe('system');
    expect(getReducedMotionPreference()).toBe('system');
    expect(reducedMotionStatus({ systemReduced: true })).toMatchObject({
      effective: true,
      source: 'system',
      preference: 'system',
    });

    expect(setReducedMotionPreference('reduce')).toBe('reduce');
    expect(getReducedMotionPreference()).toBe('reduce');
    expect(setReducedMotionPreference('basura')).toBe('system');
    expect(getReducedMotionPreference()).toBe('system');
  });
});
