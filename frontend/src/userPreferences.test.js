import { beforeEach, describe, expect, it } from 'vitest';
import { clearStorageMemoryFallback } from './safeStorage.js';
import { getDefaultTimeControlId, getUiLanguage, setDefaultTimeControlId, setUiLanguage } from './userPreferences.js';

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
});
