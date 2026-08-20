import { beforeEach, describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, getAmbientThemeId, getAmbientThemeVariationDurationMs, setAmbientTheme } from './sound.js';

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

  it('los temas estructurados tardan al menos dos minutos en repetir su forma larga', () => {
    const structured = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus');
    expect(structured.length).toBe(17);
    for (const theme of structured) {
      expect(getAmbientThemeVariationDurationMs(theme.id)).toBeGreaterThanOrEqual(120000);
    }
    expect(getAmbientThemeVariationDurationMs('andalus')).toBeNull();
  });

  it('persiste la selección y hace fallback seguro', () => {
    expect(setAmbientTheme('storm')).toBe('storm');
    expect(getAmbientThemeId()).toBe('storm');
    expect(setAmbientTheme('no-existe')).toBe('andalus');
    expect(getAmbientThemeId()).toBe('andalus');
  });
});
