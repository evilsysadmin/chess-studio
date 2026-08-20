import { beforeEach, describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, getAmbientThemeId, setAmbientTheme } from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => localStorage.clear());

  it('expone dieciocho temas seleccionables', () => {
    expect(AMBIENT_THEME_OPTIONS).toHaveLength(18);
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Relojería');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Final de madrugada');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Tango del rey');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Monasterio orbital');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Sala de máquinas');
  });

  it('persiste la selección y hace fallback seguro', () => {
    expect(setAmbientTheme('storm')).toBe('storm');
    expect(getAmbientThemeId()).toBe('storm');
    expect(setAmbientTheme('no-existe')).toBe('andalus');
    expect(getAmbientThemeId()).toBe('andalus');
  });
});
