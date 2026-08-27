import { beforeEach, describe, expect, it } from 'vitest';
import {
  AMBIENT_INTER_TRACK_SILENCE_MS,
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  getAmbientThemeId,
  getAmbientRadioMode,
  ambientRadioThemeIds,
  isAmbientFavorite,
  isAmbientExcluded,
  getAmbientThemeSoundProfile,
  getPercussionHumanizationPreview,
  getPercussionVoiceKit,
  structuredPercussionPatternStep,
  getAmbientThemeVariationDurationMs,
  getAmbientTrackDurationMs,
  getAmbientVolume,
  duckAmbientMusic,
  pickRandomAmbientThemeId,
  resetAmbientThemeForSession,
  seekAmbientMusic,
  getAmbientPlaybackState,
  setAmbientTheme,
  setAmbientRadioMode,
  selectAmbientRadioModeTheme,
  toggleAmbientFavorite,
  toggleAmbientExcluded,
  setAmbientVolume,
  startAmbientMusic,
  stopAmbientMusic,
} from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('empieza en radio Aleatorio y conserva cualquier cambio explícito del perfil', () => {
    expect(getAmbientRadioMode()).toBe('all');
    setAmbientRadioMode('genre:Clásica');
    expect(getAmbientRadioMode()).toBe('genre:Clásica');
  });

  it('valida dinámicamente todo el catálogo seleccionable y puede resolver cada pista', () => {
    expect(AMBIENT_THEME_OPTIONS.length).toBeGreaterThan(0);

    const ids = AMBIENT_THEME_OPTIONS.map((theme) => theme.id);
    const labels = AMBIENT_THEME_OPTIONS.map((theme) => theme.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);

    for (const theme of AMBIENT_THEME_OPTIONS) {
      expect(theme.id).toEqual(expect.any(String));
      expect(theme.id.trim()).not.toBe('');
      expect(theme.label).toEqual(expect.any(String));
      expect(theme.label.trim()).not.toBe('');
      expect(theme.genre).toEqual(expect.any(String));
      expect(theme.genre.trim()).not.toBe('');

      // Esto recorre el mismo camino de selección que usa el reproductor. Si
      // una opción apunta a un id inexistente/oculto o deja de poder resolverse,
      // el test falla sin mantener un número mágico de pistas.
      expect(setAmbientTheme(theme.id)).toBe(theme.id);
      expect(getAmbientThemeId()).toBe(theme.id);
      expect(getAmbientTrackDurationMs(theme.id)).toBeGreaterThan(0);
      // Smoke real del transporte: cada pista debe poder entrar por el mismo
      // camino de Play que usa el mini-reproductor y detenerse sin excepción.
      startAmbientMusic();
      expect(getAmbientPlaybackState().status).toBe('playing');
      expect(getAmbientPlaybackState().themeId).toBe(theme.id);
      stopAmbientMusic();
      expect(getAmbientPlaybackState().status).toBe('stopped');

      if (theme.id !== 'andalus') {
        const profile = getAmbientThemeSoundProfile(theme.id);
        expect(profile).toBeTruthy();
        expect(profile.leadInstrument).toBeTruthy();
        expect(profile.chordInstrument).toBeTruthy();
        expect(profile.bassInstrument).toBeTruthy();
      }
    }

    // Protegemos las familias añadidas por producto, no un cardinal que cambia
    // legítimamente cada vez que entra una canción nueva.
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Smooth Jazz')?.themes.length).toBeGreaterThanOrEqual(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Tropical House')?.themes.length).toBeGreaterThanOrEqual(2);
  });

  it('expulsa de una sesión antigua los temas retirados de la curación', () => {
    sessionStorage.setItem('chess-study-ambient-theme-session', 'abyssalArchive');
    const chosen = getAmbientThemeId();
    expect(chosen).not.toBe('abyssalArchive');
    expect(AMBIENT_THEME_OPTIONS.some((theme) => theme.id === chosen)).toBe(true);

    expect(setAmbientTheme('redVault')).not.toBe('redVault');
  });

  it('agrupa dinámicamente el catálogo por estilo sin perder ni duplicar pistas', () => {
    const grouped = AMBIENT_THEME_GROUPS.flatMap((group) => group.themes);
    expect(grouped).toHaveLength(AMBIENT_THEME_OPTIONS.length);
    expect(new Set(grouped.map((theme) => theme.id)).size).toBe(AMBIENT_THEME_OPTIONS.length);
    expect(new Set(AMBIENT_THEME_GROUPS.map((group) => group.genre)).size).toBe(AMBIENT_THEME_GROUPS.length);
    expect(AMBIENT_THEME_GROUPS.every((group) => group.themes.length > 0)).toBe(true);

    const byId = new Map(AMBIENT_THEME_OPTIONS.map((theme) => [theme.id, theme]));
    expect(byId.get('endgameAdagio')?.genre).toBe('Clásica');
    expect(byId.get('midnightSatin')?.genre).toBe('Smooth Jazz');
    expect(byId.get('palmsAtDusk')?.genre).toBe('Tropical House');
    expect(byId.get('bossaQueen')?.genre).toBe('Bossa / Latin Lounge');
    expect(byId.get('lofiRainCassette')?.genre).toBe('Lo-Fi / Chill');

    expect(AMBIENT_THEME_OPTIONS.map((x) => x.id)).not.toEqual(expect.arrayContaining([
      'orbitalMonastery','metro317','glassAsh','machineRoom','abyssalArchive','redVault',
    ]));
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Dark Ambient')).toBeUndefined();
  });


  it('da perfil sonoro dedicado a todo el catálogo estructurado y destierra el chiu-chiu', () => {
    const profiled = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus').map((theme) => [theme.id, getAmbientThemeSoundProfile(theme.id)]);
    expect(profiled.every(([, profile]) => !!profile)).toBe(true);
    expect(profiled.some(([, profile]) => ['bell', 'musicbox'].includes(profile.signatureInstrument))).toBe(false);
    expect(getAmbientThemeSoundProfile('winterLibrary').signatureInstrument).toBe('felt');
  });

  it('mantiene personalidad única y normaliza el salto de volumen entre arreglos', () => {
    const structured = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus');
    const profiles = structured.map((theme) => getAmbientThemeSoundProfile(theme.id));
    expect(new Set(profiles.map((profile) => profile.personalityFingerprint)).size).toBe(structured.length);
    expect(Math.min(...profiles.map((profile) => profile.masterTrim))).toBeGreaterThanOrEqual(0.76);
    expect(Math.max(...profiles.map((profile) => profile.masterTrim))).toBeLessThanOrEqual(1.12);
  });

  it('no usa campanitas/musicbox como voz de ningún tema estructurado', () => {
    const forbidden = new Set(['bell', 'musicbox']);
    for (const theme of AMBIENT_THEME_OPTIONS.filter((item) => item.id !== 'andalus')) {
      const profile = getAmbientThemeSoundProfile(theme.id);
      expect([theme.leadInstrument, theme.counterInstrument, theme.chordInstrument, theme.bassInstrument, profile.signatureInstrument].some((instrument) => forbidden.has(instrument))).toBe(false);
    }
    expect(getAmbientThemeSoundProfile('clockwork').leadInstrument).toBe('harpsichord');
    expect(getAmbientThemeSoundProfile('clockwork').chordInstrument).toBe('felt');
  });

  it('da carácter propio a trip-hop, dark ambient, bossa y minimal', () => {
    const ids = ['concreteRain','velvetStatic','abyssalArchive','redVault','queenBossa','havana205','fourSquares','verticalRainPiano'];
    const profiles = ids.map(getAmbientThemeSoundProfile);
    expect(new Set(profiles.map((profile) => profile.family)).size).toBe(ids.length);
    expect(getAmbientThemeSoundProfile('concreteRain').estimatedBpm).toBeLessThan(90);
    expect(getAmbientThemeSoundProfile('abyssalArchive').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('redVault').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('fourSquares').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('queenBossa').swing).toBeGreaterThanOrEqual(0.18);
  });

  it('da una silueta sonora propia a SPA, rock y clásica', () => {
    const ids = ['mistSpa','moonOnsen','postRockMidnight','rookGarage','desertDriveRock','endgameAdagio','knightFugue','nocturnalQuartet','lofiRainTape','lofiWindowLight','neonKnight','midnightArcade'];
    const profiles = ids.map(getAmbientThemeSoundProfile);
    expect(new Set(profiles.map((p) => p.family)).size).toBe(ids.length);
    expect(getAmbientThemeSoundProfile('mistSpa').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('endgameAdagio').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('knightFugue').drumMode).toBe('none');
    expect(getAmbientThemeSoundProfile('rookGarage').percussionPunch).toBeGreaterThan(1.2);
    expect(getAmbientThemeSoundProfile('postRockMidnight').enabledLayers).toEqual(expect.arrayContaining(['lead','counter','chords','bass','drums']));
    expect(getAmbientThemeSoundProfile('lofiRainTape').family).toBe('lofi-rain-cassette');
    expect(getAmbientThemeSoundProfile('neonKnight').family).toBe('neon-synthwave-arp');
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
    expect(istanbul.percussionPunch).toBeGreaterThan(1.3);
    expect(istanbul.enabledLayers).toEqual(expect.arrayContaining(['lead', 'counter', 'bass', 'drums', 'signature']));
    expect(istanbul.estimatedBpm).toBeGreaterThanOrEqual(124);
    expect(istanbul.estimatedBpm).toBeLessThanOrEqual(130);
    expect(getAmbientThemeSoundProfile('istanbulBackgammon').estimatedBpm).toBeGreaterThanOrEqual(127);
    expect(getAmbientThemeSoundProfile('istanbulBackgammon').estimatedBpm).toBeLessThanOrEqual(131);
    expect(damascus.space).toBeGreaterThan(cairo.space);
  });

  it('separa Cairo Quiet Hours y Nilo balcón por decisiones audibles, no sólo por nombre', () => {
    const cairoQuiet = getAmbientThemeSoundProfile('cairoQuietHours');
    const nileBalcony = getAmbientThemeSoundProfile('nileBalcony0152');

    expect(cairoQuiet.family).not.toBe(nileBalcony.family);
    expect(cairoQuiet.percussionKit).not.toBe(nileBalcony.percussionKit);
    expect(cairoQuiet.drumMode).not.toBe(nileBalcony.drumMode);
    expect(cairoQuiet.signatureInstrument).not.toBe(nileBalcony.signatureInstrument);
    expect(cairoQuiet.enabledLayers).toContain('drums');
    expect(nileBalcony.enabledLayers).not.toContain('drums');
  });

  it('humaniza timbre y dinámica sin retrasar ni duplicar ataques', () => {
    const downbeat = getPercussionHumanizationPreview('beirut0113', 0, 'K');
    const secondaryA = getPercussionHumanizationPreview('beirut0113', 3, 'H');
    const secondaryB = getPercussionHumanizationPreview('beirut0113', 9, 'H');

    expect(downbeat.delayMs).toBe(0);
    expect(secondaryA.delayMs).toBe(0);
    expect(secondaryA.ghost).toBe(false);
    expect(secondaryA).toEqual(getPercussionHumanizationPreview('beirut0113', 3, 'H'));
    expect(secondaryA.tone).toBeGreaterThanOrEqual(-0.78);
    expect(secondaryA.tone).toBeLessThanOrEqual(0.78);
    expect(secondaryA.decay).toBeGreaterThanOrEqual(0.9);
    expect(secondaryA.decay).toBeLessThanOrEqual(1.1);
    expect(secondaryA.pan).toBeGreaterThanOrEqual(-0.13);
    expect(secondaryA.pan).toBeLessThanOrEqual(0.13);
    expect(secondaryA).not.toEqual(secondaryB);
  });

  it('asigna voces de percusión distintas según la familia musical', () => {
    const ids = ['rookGarage', 'neonKnight', 'lofiRainTape', 'beirut0113'];
    expect(new Set(ids.map(getPercussionVoiceKit)).size).toBe(ids.length);
    expect(getAmbientThemeSoundProfile('rookGarage').percussionPunch).toBeGreaterThan(1.2);
    expect(getAmbientThemeSoundProfile('lofiRainTape').percussionPunch).toBeLessThan(0.8);
    expect(getAmbientThemeSoundProfile('lofiRainTape').family).toContain('lofi');
  });

  it('mantiene el patrón de percusión continuo al cruzar una sección', () => {
    expect(structuredPercussionPatternStep(71, 16)).toBe(7);
    expect(structuredPercussionPatternStep(72, 16)).toBe(8);
    expect(structuredPercussionPatternStep(73, 16)).toBe(9);
    expect(structuredPercussionPatternStep(224, 18)).toBe(8);
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
    expect(structured.length).toBe(AMBIENT_THEME_OPTIONS.length - 1);
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

  it('permite posicionar el transporte y acota el seek a la duración de la pista', () => {
    setAmbientTheme('cairo0047');
    const duration = getAmbientTrackDurationMs('cairo0047');
    expect(seekAmbientMusic(90_000)).toBe(90_000);
    expect(getAmbientPlaybackState().cyclePositionMs).toBe(90_000);
    expect(seekAmbientMusic(duration + 50_000)).toBe(duration - 1);
    expect(getAmbientPlaybackState().cyclePositionMs).toBe(duration - 1);
  });

  it('mantiene reproducción y salta el transporte al hacer seek durante Play', () => {
    setAmbientTheme('cairo0047');
    startAmbientMusic();
    expect(getAmbientPlaybackState().status).toBe('playing');
    expect(seekAmbientMusic(120_000)).toBe(120_000);
    const afterSeek = getAmbientPlaybackState();
    expect(afterSeek.status).toBe('playing');
    expect(afterSeek.cyclePositionMs).toBeGreaterThanOrEqual(120_000);
    expect(afterSeek.cyclePositionMs).toBeLessThan(120_250);
    stopAmbientMusic();
  });

  it('sortea la pista siguiente sin repetir la que acaba de sonar', () => {
    for (const theme of AMBIENT_THEME_OPTIONS) {
      expect(pickRandomAmbientThemeId(theme.id)).not.toBe(theme.id);
    }
  });

  it('encadena pistas con una transición corta en vez de un agujero largo', () => {
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeGreaterThanOrEqual(1800);
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeLessThanOrEqual(3200);
  });

  it('permite radio por estilo, favoritos, exclusiones y concentración', () => {
    setAmbientRadioMode('focus');
    expect(getAmbientRadioMode()).toBe('focus');
    expect(ambientRadioThemeIds().length).toBeGreaterThan(0);
    setAmbientRadioMode('genre:Ecléctica');
    expect(ambientRadioThemeIds().every((id) => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === id)?.genre === 'Ecléctica')).toBe(true);
    toggleAmbientFavorite('rookGarage');
    expect(isAmbientFavorite('rookGarage')).toBe(true);
    setAmbientRadioMode('favorites');
    expect(ambientRadioThemeIds()).toContain('rookGarage');
    toggleAmbientExcluded('rookGarage');
    expect(isAmbientExcluded('rookGarage')).toBe(true);
    expect(isAmbientFavorite('rookGarage')).toBe(false);
    expect(ambientRadioThemeIds()).not.toContain('rookGarage');
  });

  it('cambiar de estilo selecciona inmediatamente una pista de esa emisora', () => {
    setAmbientTheme('andalus');
    const selected = selectAmbientRadioModeTheme('genre:Ecléctica');
    expect(selected.mode).toBe('genre:Ecléctica');
    expect(selected.themeId).not.toBe('andalus');
    expect(AMBIENT_THEME_OPTIONS.find((theme) => theme.id === selected.themeId)?.genre).toBe('Ecléctica');
    expect(getAmbientThemeId()).toBe(selected.themeId);
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

  it('el ducking es seguro aunque Web Audio no esté disponible', () => {
    expect(() => duckAmbientMusic(true)).not.toThrow();
    expect(() => duckAmbientMusic(false)).not.toThrow();
  });

  it('puede sortear un tema nuevo para una sesión nueva', () => {
    const first = resetAmbientThemeForSession();
    expect(AMBIENT_THEME_OPTIONS.some((theme) => theme.id === first)).toBe(true);
    expect(getAmbientThemeId()).toBe(first);
  });
});
