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
  getAmbientThemeVariationDurationMs,
  getAmbientTrackDurationMs,
  getAmbientVolume,
  pickRandomAmbientThemeId,
  resetAmbientThemeForSession,
  seekAmbientMusic,
  getAmbientPlaybackState,
  setAmbientTheme,
  setAmbientRadioMode,
  toggleAmbientFavorite,
  toggleAmbientExcluded,
  setAmbientVolume,
  startAmbientMusic,
  stopAmbientMusic,
} from './sound.js';

describe('ambient music catalog', () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it('expone sesenta y ocho temas seleccionables', () => {
    expect(AMBIENT_THEME_OPTIONS).toHaveLength(68);
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
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('SPA · niebla de cedro');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Onsen · agua de luna');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Post-rock · medianoche');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Rock · garaje de la torre');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Rock · carretera del desierto');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Adagio del final');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Fuga del caballo');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Cuarteto nocturno');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Lo-fi · lluvia en cassette');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Lo-fi · ventana encendida');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Synthwave · caballo de neón');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Synthwave · arcade 02:17');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Trip-hop · lluvia sobre hormigón');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Trip-hop · estática de terciopelo');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Dark ambient · archivo abisal');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Dark ambient · cámara roja');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Bossa · dama en la terraza');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Havana · 02:05');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Minimal · cuatro casillas');
    expect(AMBIENT_THEME_OPTIONS.map((x) => x.label)).toContain('Piano · lluvia vertical');
  });

  it('agrupa el catálogo por estilo sin perder pistas', () => {
    expect(AMBIENT_THEME_GROUPS.flatMap((group) => group.themes)).toHaveLength(AMBIENT_THEME_OPTIONS.length);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'SPA / Zen')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Rock')?.themes).toHaveLength(3);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Lo-Fi / Chill')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Synthwave')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Trip-Hop / Downtempo')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Dark Ambient')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Bossa / Latin Lounge')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Piano / Minimal')?.themes).toHaveLength(2);
    expect(AMBIENT_THEME_GROUPS.find((group) => group.genre === 'Clásica')?.themes.map((x) => x.id)).toEqual(
      expect.arrayContaining(['endgameAdagio', 'knightFugue', 'nocturnalQuartet']),
    );
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

  it('humaniza la percusión sin soltar el downbeat del pulso', () => {
    const downbeat = getPercussionHumanizationPreview('beirut0113', 0, 'K');
    const secondaryA = getPercussionHumanizationPreview('beirut0113', 3, 'H');
    const secondaryB = getPercussionHumanizationPreview('beirut0113', 9, 'H');

    expect(downbeat.delayMs).toBe(0);
    expect(secondaryA.delayMs).toBeGreaterThanOrEqual(0);
    expect(secondaryA.delayMs).toBeLessThanOrEqual(9);
    expect(secondaryA).toEqual(getPercussionHumanizationPreview('beirut0113', 3, 'H'));
    expect(secondaryA.tone).toBeGreaterThanOrEqual(-0.78);
    expect(secondaryA.tone).toBeLessThanOrEqual(0.78);
    expect(secondaryA.decay).toBeGreaterThanOrEqual(0.9);
    expect(secondaryA.decay).toBeLessThanOrEqual(1.1);
    expect(secondaryA.pan).toBeGreaterThanOrEqual(-0.13);
    expect(secondaryA.pan).toBeLessThanOrEqual(0.13);
    expect(secondaryA).not.toEqual(secondaryB);
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
    expect(structured.length).toBe(67);
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
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeGreaterThanOrEqual(400);
    expect(AMBIENT_INTER_TRACK_SILENCE_MS).toBeLessThanOrEqual(900);
  });

  it('permite radio por estilo, favoritos, exclusiones y concentración', () => {
    setAmbientRadioMode('focus');
    expect(getAmbientRadioMode()).toBe('focus');
    expect(ambientRadioThemeIds().length).toBeGreaterThan(0);
    setAmbientRadioMode('genre:Rock');
    expect(ambientRadioThemeIds().every((id) => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === id)?.genre === 'Rock')).toBe(true);
    toggleAmbientFavorite('rookGarage');
    expect(isAmbientFavorite('rookGarage')).toBe(true);
    setAmbientRadioMode('favorites');
    expect(ambientRadioThemeIds()).toContain('rookGarage');
    toggleAmbientExcluded('rookGarage');
    expect(isAmbientExcluded('rookGarage')).toBe(true);
    expect(isAmbientFavorite('rookGarage')).toBe(false);
    expect(ambientRadioThemeIds()).not.toContain('rookGarage');
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
