#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { AMBIENT_THEMES, PHRASE_NOTE_GAP_MS, SAX_NOTE_GAP_MS } from '../frontend/src/ambientCatalog.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(key, String(value)); }
  removeItem(key) { this.map.delete(key); }
  clear() { this.map.clear(); }
}

globalThis.localStorage ??= new MemoryStorage();
globalThis.sessionStorage ??= new MemoryStorage();

const sound = await import('../frontend/src/sound.js');
const {
  AMBIENT_THEME_GROUPS,
  AMBIENT_THEME_OPTIONS,
  getAmbientThemeSoundProfile,
  getAmbientThemeVariationDurationMs,
  getPercussionHumanizationPreview,
  getAmbientTrackDurationMs,
  getAmbientRadioMode,
  ambientRadioThemeIds,
  isAmbientFavorite,
  isAmbientExcluded,
  pickRandomAmbientThemeId,
  setAmbientRadioMode,
  toggleAmbientFavorite,
  toggleAmbientExcluded,
} = sound;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(AMBIENT_THEME_OPTIONS.length === 73, `catálogo inesperado: ${AMBIENT_THEME_OPTIONS.length} temas`);
const ids = AMBIENT_THEME_OPTIONS.map((theme) => theme.id);
assert(new Set(ids).size === ids.length, 'hay IDs musicales duplicados');

const grouped = AMBIENT_THEME_GROUPS.flatMap((group) => group.themes);
assert(grouped.length === AMBIENT_THEME_OPTIONS.length, 'los grupos no contienen todo el catálogo');
assert(new Set(grouped.map((theme) => theme.id)).size === ids.length, 'un tema aparece en más de un grupo o falta otro');

const expectedGenres = new Map([
  ['SPA / Zen', 2],
  ['Ecléctica', 3],
  ['Energía', 5],
  ['Lo-Fi / Chill', 2],
  ['Trip-Hop / Downtempo', 2],
  ['Bossa / Latin Lounge', 2],
  ['Piano / Minimal', 2],
]);
for (const [genre, expected] of expectedGenres) {
  const group = AMBIENT_THEME_GROUPS.find((row) => row.genre === genre);
  assert(group?.themes.length === expected, `${genre}: esperaba ${expected}, hay ${group?.themes.length ?? 0}`);
}
assert((AMBIENT_THEME_GROUPS.find((row) => row.genre === 'Clásica')?.themes.length || 0) >= 3, 'faltan temas clásicos');
const curatedHidden = ['orbitalMonastery','metro317','glassAsh','machineRoom','abyssalArchive','redVault'];
assert(curatedHidden.every((id) => !ids.includes(id)), 'han reaparecido temas experimentales retirados');
assert(!AMBIENT_THEME_GROUPS.some((group) => group.genre === 'Dark Ambient'), 'Dark Ambient debería quedar fuera del catálogo curado');

const added = ['mistSpa','moonOnsen','postRockMidnight','rookGarage','desertDriveRock','endgameAdagio','knightFugue','nocturnalQuartet','lofiRainTape','lofiWindowLight','neonKnight','midnightArcade'];
const mediterraneanExpansion = ['beirutHarbor2340','cairoBlueNote0211','alexandriaHarborCafe','cordobaRooftop0026','damascusCourtyard0144','tangierNightTrain0058','granadaCopperRain0232','ammanLateTable0303'];
assert(mediterraneanExpansion.every((id) => ids.includes(id)), 'faltan pistas nuevas de jazz mediterráneo');

const profiled = AMBIENT_THEME_OPTIONS.filter((theme) => theme.id !== 'andalus').map((theme) => [theme.id, getAmbientThemeSoundProfile(theme.id)]);
for (const [id, profile] of profiled) assert(profile, `${id}: sigue sin perfil sonoro dedicado`);
const fingerprints = profiled.map(([, profile]) => profile.personalityFingerprint);
assert(new Set(fingerprints).size === fingerprints.length, 'hay temas estructurados con huella compositiva indistinguible');
const forbiddenChiu = new Set(['bell', 'musicbox']);
const soundSource = readFileSync(new URL('../frontend/src/sound.js', import.meta.url), 'utf8');
assert(!soundSource.includes('playWoodblock'), 'ha reaparecido el woodblock tonal del chiu-chiu');
assert(!soundSource.includes('780, start') || !soundSource.includes('520, start + 0.055'), 'ha reaparecido el barrido tonal 780→520 Hz');
assert(!profiled.some(([, profile]) => forbiddenChiu.has(profile.signatureInstrument)), 'quedan firmas campanilleantes tipo chiu-chiu');
for (const theme of AMBIENT_THEME_OPTIONS) {
  if (theme.id === 'andalus') continue;
  const profile = getAmbientThemeSoundProfile(theme.id);
  const instruments = [theme.leadInstrument, theme.counterInstrument, theme.chordInstrument, theme.bassInstrument, profile?.signatureInstrument];
  assert(!instruments.some((instrument) => forbiddenChiu.has(instrument)), `${theme.id}: conserva un timbre chiu-chiu (${instruments.filter(Boolean).join(', ')})`);
  assert(profile.masterTrim >= 0.76 && profile.masterTrim <= 1.12, `${theme.id}: normalización fuera de rango (${profile.masterTrim})`);
}
const profiles = added.map((id) => [id, getAmbientThemeSoundProfile(id)]);
for (const [id, profile] of profiles) assert(profile, `${id}: no tiene perfil estructurado`);
assert(new Set(profiles.map(([, profile]) => profile.family)).size === added.length, 'las nuevas pistas comparten accidentalmente la misma familia sonora');
assert(getAmbientThemeSoundProfile('mistSpa').drumMode === 'none', 'SPA · niebla debería carecer de batería');
assert(getAmbientThemeSoundProfile('endgameAdagio').drumMode === 'none', 'Adagio debería carecer de batería');
assert(getAmbientThemeSoundProfile('rookGarage').percussionPunch > 1.2, 'Garage necesita pegada rock diferenciada');
const energyIds = ['neonSiege', 'overclockedKnight', 'reactorGambit'];
assert(energyIds.every((id) => getAmbientThemeSoundProfile(id)?.percussionKit === 'synth-metal'), 'Energía debe usar batería synth-metal propia');
assert(new Set(energyIds.map((id) => getAmbientThemeSoundProfile(id)?.family)).size === energyIds.length, 'los temas de Energía necesitan identidades distintas');
assert(['neonKnight','midnightArcade',...energyIds].every((id) => getAmbientThemeSoundProfile(id)?.estimatedBpm >= 150), 'Energía necesita al menos 150 BPM percibidos');
assert(['postRockMidnight','rookGarage','desertDriveRock'].every((id) => getAmbientThemeSoundProfile(id)?.estimatedBpm >= 130), 'los temas rock de Ecléctica necesitan más pulso');
assert(PHRASE_NOTE_GAP_MS % AMBIENT_THEMES.andalus.stepMs === 0, 'Al-Ándalus: melodía fuera de la rejilla rítmica');
assert(SAX_NOTE_GAP_MS % AMBIENT_THEMES.andalus.stepMs === 0, 'Al-Ándalus: saxo fuera de la rejilla rítmica');
for (const [id, profile] of profiled) {
  if (profile.drumMode === 'none') continue;
  for (let step = 0; step < Math.max(1, profile.percussionPeriod || 16); step += 1) {
    const preview = getPercussionHumanizationPreview(id, step, step % 8 === 0 ? 'K' : 'H');
    assert((preview?.delayMs || 0) === 0, `${id}: ataque de percusión fuera de rejilla (${preview?.delayMs} ms)`);
    assert(preview?.ghost === false, `${id}: conserva un golpe fantasma capaz de sonar como flam`);
  }
}

const bt = ['concreteRain','velvetStatic','abyssalArchive','redVault','queenBossa','havana205','fourSquares','verticalRainPiano'];
const btProfiles = bt.map((id) => [id, getAmbientThemeSoundProfile(id)]);
assert(new Set(btProfiles.map(([, profile]) => profile.family)).size === bt.length, 'las familias de perfiles ambientales no son únicas');
assert(getAmbientThemeSoundProfile('abyssalArchive').drumMode === 'none', 'Archivo abisal no debe tener batería');
assert(getAmbientThemeSoundProfile('redVault').drumMode === 'none', 'Cámara roja no debe tener batería');
assert(getAmbientThemeSoundProfile('fourSquares').drumMode === 'none', 'Cuatro casillas no debe tener batería');
assert(getAmbientThemeSoundProfile('concreteRain').estimatedBpm < 90, 'Trip-hop hormigón debe ser claramente lento');
assert(getAmbientThemeSoundProfile('queenBossa').swing >= 0.18, 'La bossa necesita micro-groove propio');

for (const theme of AMBIENT_THEME_OPTIONS) {
  const duration = getAmbientTrackDurationMs(theme.id);
  assert(Number.isFinite(duration) && duration >= 120_000, `${theme.id}: duración insuficiente (${duration})`);
  if (theme.id !== 'andalus') {
    const variation = getAmbientThemeVariationDurationMs(theme.id);
    assert(Number.isFinite(variation) && variation >= 120_000, `${theme.id}: forma larga insuficiente (${variation})`);
  }
  if (AMBIENT_THEME_OPTIONS.length > 1) {
    assert(pickRandomAmbientThemeId(theme.id) !== theme.id, `${theme.id}: el selector aleatorio repitió la pista excluida`);
  }
}

setAmbientRadioMode('focus');
assert(getAmbientRadioMode() === 'focus', 'radio focus no persiste');
assert(ambientRadioThemeIds().length > 0, 'radio focus no tiene pistas');
setAmbientRadioMode('genre:Ecléctica');
assert(ambientRadioThemeIds().every((id) => AMBIENT_THEME_OPTIONS.find((theme) => theme.id === id)?.genre === 'Ecléctica'), 'radio Ecléctica filtra mal');
toggleAmbientFavorite('rookGarage');
assert(isAmbientFavorite('rookGarage'), 'favorito no persiste');
toggleAmbientExcluded('rookGarage');
assert(isAmbientExcluded('rookGarage') && !isAmbientFavorite('rookGarage'), 'excluir no invalida favorito');
assert(!ambientRadioThemeIds().includes('rookGarage'), 'radio incluye una pista excluida');

console.log(`audio-check OK · ${AMBIENT_THEME_OPTIONS.length} temas · ${AMBIENT_THEME_GROUPS.length} estilos · ${profiled.length} huellas únicas · no-chiu · loudness trim`);
