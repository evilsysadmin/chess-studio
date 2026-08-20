import { beforeEach, describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, getAmbientThemeId, setAmbientTheme } from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => localStorage.clear());

  it('expone doce temas seleccionables', () => {
    expect(AMBIENT_THEME_OPTIONS).toHaveLength(12);
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Relojería');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Final de madrugada');
  });

  it('persiste la selección y hace fallback seguro', () => {
    expect(setAmbientTheme('storm')).toBe('storm');
    expect(getAmbientThemeId()).toBe('storm');
    expect(setAmbientTheme('no-existe')).toBe('andalus');
    expect(getAmbientThemeId()).toBe('andalus');
  });
});
