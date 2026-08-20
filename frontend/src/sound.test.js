import { beforeEach, describe, expect, it } from 'vitest';
import { AMBIENT_THEME_OPTIONS, getAmbientThemeId, getAmbientThemeVariationDurationMs, resetAmbientThemeForSession, setAmbientTheme } from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('expone treinta y dos temas seleccionables', () => {
    expect(AMBIENT_THEME_OPTIONS).toHaveLength(32);
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Relojería');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Final de madrugada');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Tango del rey');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Monasterio orbital');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Sala de máquinas');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Alejandría 02:41');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Cairo 00:47');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Beirut 01:13');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Damasco · hora azul');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Estambul 03:26');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Tánger · humo');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Bósforo bajo la lluvia');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Beirut rooftop 04:12');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Casablanca · Last Call');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Cairo · Quiet Hours');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Nilo · balcón 01:52');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Alepo · después de la lluvia');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Amán · habitación de terciopelo');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Medina · humo azul');
  });

  it('los temas estructurados tardan al menos dos minutos en repetir su forma larga', () => {
    const structured = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus');
    expect(structured.length).toBe(31);
    for (const theme of structured) {
      expect(getAmbientThemeVariationDurationMs(theme.id)).toBeGreaterThanOrEqual(120000);
    }
    expect(getAmbientThemeVariationDurationMs('andalus')).toBeNull();
  });

  it('mantiene la selección durante la sesión y hace fallback seguro', () => {
    expect(setAmbientTheme('storm')).toBe('storm');
    expect(getAmbientThemeId()).toBe('storm');
    expect(setAmbientTheme('no-existe')).toBe('andalus');
    expect(getAmbientThemeId()).toBe('andalus');
  });

  it('puede sortear un tema nuevo para una sesión nueva', () => {
    const first = resetAmbientThemeForSession();
    expect(AMBIENT_THEME_OPTIONS.some((theme) => theme.id === first)).toBe(true);
    expect(getAmbientThemeId()).toBe(first);
  });
});
