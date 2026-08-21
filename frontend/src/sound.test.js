import { beforeEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_INTER_TRACK_SILENCE_MS,
  AMBIENT_THEME_OPTIONS,
  getAmbientThemeId,
  getAmbientThemeSoundProfile,
  getAmbientThemeVariationDurationMs,
  getAmbientTrackDurationMs,
  getAmbientVolume,
  pickRandomAmbientThemeId,
  resetAmbientThemeForSession,
  setAmbientTheme,
  setAmbientVolume,
} from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('expone cuarenta y ocho temas seleccionables', () => {
    expect(AMBIENT_THEME_OPTIONS).toHaveLength(48);
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Relojería');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Gambito del rey');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Vals del zugzwang');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Blues del alfil');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Biblioteca bajo nieve');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Búnker analógico');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Réquiem para una dama');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Mercancías 04:12');
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
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Cairo · farol rojo 01:37');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Beirut · taxi nocturno 02:18');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Tánger · mesa roja');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Estambul · tavla 03:08');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Costa andalusí · tarde clara');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Granada · patio encendido');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Cádiz · faroles al viento');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Luciérnagas en la terraza');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Café · luces pequeñas');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Málaga · último tranvía');
  });


  it('da identidades compositivas realmente distintas a los prototipos mediterráneos', () => {
    const alexandria = getAmbientThemeSoundProfile('alexandria241');
    const beirut = getAmbientThemeSoundProfile('beirut0113');
    const cairo = getAmbientThemeSoundProfile('cairo0047');
    const damascus = getAmbientThemeSoundProfile('damascusBlueHour');
    const istanbul = getAmbientThemeSoundProfile('istanbul0326');
    const tangier = getAmbientThemeSoundProfile('tangierSmoke');
    const granada = getAmbientThemeSoundProfile('granadaPatio');
    const prototypes = [alexandria, beirut, cairo, damascus, istanbul, tangier, granada];

    expect(prototypes.every((profile) => profile.preserveSectionOrder)).toBe(true);
    expect(new Set(prototypes.map((profile) => profile.family)).size).toBe(7);
    expect(new Set(prototypes.map((profile) => profile.signatureInstrument)).size).toBeGreaterThanOrEqual(6);
    expect(prototypes.every((profile) => profile.signatureSteps >= 3)).toBe(true);

    expect(alexandria.percussionPeriod).toBe(16);
    expect(beirut.percussionPeriod).toBe(12);
    expect(istanbul.percussionPeriod).toBe(18);
    expect(tangier.percussionPeriod).toBe(12);
    expect(damascus.drumMode).toBe('none');

    expect(alexandria.chordInstrument).toBe('felt');
    expect(cairo.chordInstrument).toBe('rhodesWarm');
    expect(granada.bassInstrument).toBe('pizz');

    // Las familias ya no se distinguen solo por presets: también por las capas
    // que deliberadamente NO existen en cada arreglo.
    expect(alexandria.enabledLayers).toEqual(expect.arrayContaining(['chords', 'bass', 'drums', 'signature']));
    expect(alexandria.enabledLayers).not.toContain('lead');
    expect(alexandria.enabledLayers).not.toContain('counter');
    expect(beirut.enabledLayers).not.toContain('chords');
    expect(istanbul.enabledLayers).not.toContain('chords');
    expect(damascus.enabledLayers).not.toContain('drums');
    expect(granada.enabledLayers).not.toContain('drums');
    expect(new Set(prototypes.map((profile) => profile.signatureRepeatPeriod)).size).toBeGreaterThanOrEqual(5);

    expect(beirut.percussionKit).toBe('darbuka');
    expect(istanbul.percussionKit).toBe('istanbul-frame');
    expect(tangier.percussionKit).toBe('maghreb-hand');
    expect(beirut.percussionPunch).toBeGreaterThan(1.25);
    expect(damascus.space).toBeGreaterThan(cairo.space);
  });

  it('añade estilos no mediterráneos con siluetas claramente distintas', () => {
    const ids = ['zugzwangWaltz', 'bishopBlues', 'winterLibrary', 'analogBunker', 'queenRequiem', 'nightFreight'];
    const profiles = ids.map(getAmbientThemeSoundProfile);
    expect(new Set(profiles.map((p) => p.family)).size).toBe(6);
    expect(getAmbientThemeSoundProfile('winterLibrary').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('queenRequiem').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('bishopBlues').swing).toBeGreaterThan(0.2);
    expect(getAmbientThemeSoundProfile('analogBunker').enabledLayers).not.toContain('chords');
    expect(getAmbientThemeSoundProfile('nightFreight').percussionPeriod).toBe(24);
  });

  it('los temas estructurados tardan al menos dos minutos en repetir su forma larga', () => {
    const structured = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus');
    expect(structured.length).toBe(47);
    for (const theme of structured) {
      expect(getAmbientThemeVariationDurationMs(theme.id)).toBeGreaterThanOrEqual(120000);
    }
    expect(getAmbientThemeVariationDurationMs('andalus')).toBeNull();
  });

  it('todas las pistas tienen una duración finita para poder encadenarse', () => {
    for (const theme of AMBIENT_THEME_OPTIONS) {
      expect(getAmbientTrackDurationMs(theme.id)).toBeGreaterThanOrEqual(120000);
    }
  });

  it('sortea la pista siguiente sin repetir la que acaba de sonar', () => {
    for (const theme of AMBIENT_THEME_OPTIONS) {
      expect(pickRandomAmbientThemeId(theme.id)).not.toBe(theme.id);
    }
  });

  it('deja una pausa breve y deliberada entre pistas', () => {
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeGreaterThanOrEqual(1500);
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeLessThanOrEqual(5000);
  });

  it('mantiene la selección durante la sesión y hace fallback seguro', () => {
    expect(setAmbientTheme('storm')).toBe('storm');
    expect(getAmbientThemeId()).toBe('storm');
    expect(setAmbientTheme('no-existe')).toBe('andalus');
    expect(getAmbientThemeId()).toBe('andalus');
  });

  it('el volumen arranca al 100%, se persiste y se acota entre 0 y 1', () => {
    expect(getAmbientVolume()).toBe(1);
    expect(setAmbientVolume(0.42)).toBeCloseTo(0.42, 8);
    expect(getAmbientVolume()).toBeCloseTo(0.42, 8);
    expect(localStorage.getItem('chess-study-music-volume')).toBe('0.42');
    setAmbientVolume(9);
    expect(getAmbientVolume()).toBe(1);
    setAmbientVolume(-3);
    expect(getAmbientVolume()).toBe(0);
  });

  it('puede sortear un tema nuevo para una sesión nueva', () => {
    const first = resetAmbientThemeForSession();
    expect(AMBIENT_THEME_OPTIONS.some((theme) => theme.id === first)).toBe(true);
    expect(getAmbientThemeId()).toBe(first);
  });
});
